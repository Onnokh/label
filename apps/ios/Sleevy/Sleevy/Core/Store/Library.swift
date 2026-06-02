import Foundation
import Observation
import UIKit

/// Selects which slice of the library a view wants, mirroring the web app's
/// `useSavedItems(sort, folder)` selector (`undefined` | `"none"` | id):
///
/// - `.all` — the **Inbox**: every saved item.
/// - `.unfiled` — the **Library** root: items not in any folder.
/// - `.folder(id)` — a **Folder**: items filed under it.
enum FolderSelector: Equatable {
    case all
    case unfiled
    case folder(String)
}

/// A folder/move command that failed against the server, surfaced to the caller
/// with the human-facing reason. Folder operations have no offline queue, so
/// (unlike captures and read-state) their failures are thrown rather than
/// silently retried.
struct ReadingListError: LocalizedError {
    let reason: String
    var errorDescription: String? { reason }
}

/// The reading list's single source of truth and offline-sync coordinator.
///
/// One canonical `items` array holds every saved item we know about. The Inbox,
/// Library root, and each Folder are *derived* by `savedItems(_:)` — pure
/// filter + sort, never stored — so a read-state toggle, move, or rename is one
/// write to `items` that every view reflects automatically.
///
/// The network is a `ReadingListNetworkPort`: production wires the HTTP adapter
/// (`HTTPReadingListAdapter`), tests wire an in-memory one, and — crucially —
/// every network failure arrives already classified as a `SyncFault`, so
/// "should I re-queue this?" is answered in exactly one place (`classify(_:)`).
/// Persistence stays the concrete per-user file stores (`SavedItemCache`,
/// `ReadStateQueue`, `PendingCaptureQueue`) shared with the share extension.
@MainActor
@Observable
final class Library {
    /// The one truth: every saved item, in no particular stored order. The Inbox,
    /// Library root, and folders are *derived* by `savedItems(_:)`.
    private(set) var items: [SavedItem] = []
    private(set) var folders: [Folder] = []
    private(set) var pendingSavedItems: [PendingSavedItem] = []
    private(set) var pendingCaptureCount = 0
    private(set) var status = SyncStatus()

    /// Invoked when the session is found to be invalid (`401/403`), so the app
    /// shell can route back to sign-in.
    var onAuthenticationInvalid: ((String) -> Void)?

    // View-facing projections of the single `status` value, so SwiftUI binds to
    // stable property names while the flags live in one place.
    var isLoading: Bool { status.isInitialLoad }
    var isOnline: Bool { status.isOnline }
    var isAPIReachable: Bool { status.isAPIReachable }
    var lastSuccessfulSyncAt: Date? { status.lastSuccessfulSyncAt }

    /// Settable so a view can clear a dismissed banner.
    var errorMessage: String? {
        get { status.errorMessage }
        set { status.errorMessage = newValue }
    }

    var libraryErrorMessage: String? {
        get { status.libraryErrorMessage }
        set { status.libraryErrorMessage = newValue }
    }

    private let userId: String
    private let network: any ReadingListNetworkPort
    private let connectivity: any ConnectivityMonitoring
    private let cache: SavedItemCache
    private let readStateQueue: ReadStateQueue
    private let pendingCaptureQueue: PendingCaptureQueue
    private let statusDefaults: UserDefaults

    private var hasAttemptedInitialLoad = false
    /// Serializes sync cycles (and the standalone retry pull) so two never run at
    /// once — the single re-entrancy guard for all server coordination.
    private var isSyncing = false
    private static var sourceName: String { SleevyUserPreferences.sourceName }

    /// Designated initializer: everything that crosses a boundary is injected, so
    /// tests can drive the whole coordinator with an in-memory network and
    /// temp-directory stores.
    init(
        userId: String,
        network: any ReadingListNetworkPort,
        cache: SavedItemCache,
        readStateQueue: ReadStateQueue,
        pendingCaptureQueue: PendingCaptureQueue,
        statusDefaults: UserDefaults,
        connectivity: any ConnectivityMonitoring
    ) {
        self.userId = userId
        self.network = network
        self.cache = cache
        self.readStateQueue = readStateQueue
        self.pendingCaptureQueue = pendingCaptureQueue
        self.statusDefaults = statusDefaults
        self.connectivity = connectivity
        self.status.lastSuccessfulSyncAt = statusDefaults.object(forKey: Self.lastSyncDefaultsKey(for: userId)) as? Date
        refreshPendingCaptureState()
        startMonitoringConnectivity()
    }

    /// Production convenience initializer. Collaborators default to their live
    /// construction (API session, app-group queues, application-support cache,
    /// standard defaults); tests inject stubbed versions.
    convenience init(
        session: AppSession,
        tokenStore: SessionTokenStore? = nil,
        connectivityMonitor: any ConnectivityMonitoring = LiveConnectivityMonitor(),
        api: SleevyAPIClient? = nil,
        pendingCaptureQueue: PendingCaptureQueue? = nil,
        readStateQueue: ReadStateQueue? = nil,
        savedItemCache: SavedItemCache? = nil,
        statusDefaults: UserDefaults = .standard
    ) {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .sleevyISO8601
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601

        let apiClient = api ?? Self.makeAPI(
            tokenStore: tokenStore ?? SessionTokenStore(initial: session.token),
            encoder: encoder,
            decoder: decoder
        )
        let captureQueue = pendingCaptureQueue ?? PendingCaptureQueue(
            userId: session.userId,
            store: SleevyPendingCaptureStore(appGroupIdentifier: AppConfig.appGroupIdentifier)
        )
        let readState = readStateQueue ?? ReadStateQueue(
            userId: session.userId,
            containerURL: FileManager.default.containerURL(
                forSecurityApplicationGroupIdentifier: AppConfig.appGroupIdentifier
            )
        )
        let cache = savedItemCache ?? SavedItemCache(
            userId: session.userId,
            directory: Self.applicationSupportDirectory(),
            encoder: encoder,
            decoder: decoder
        )

        self.init(
            userId: session.userId,
            network: HTTPReadingListAdapter(api: apiClient),
            cache: cache,
            readStateQueue: readState,
            pendingCaptureQueue: captureQueue,
            statusDefaults: statusDefaults,
            connectivity: connectivityMonitor
        )
    }

    // MARK: - Classification (the single authority)

    private enum Disposition {
        /// Keep the change queued and stop draining for now.
        case retain
        /// Drop the change — it will never succeed.
        case drop
        /// The session is dead; stop everything and sign out.
        case signOut
    }

    /// Normalizes a caught error to a `SyncFault`. The network port is typed
    /// `throws(SyncFault)`, so at runtime this is always the `as?` branch; the
    /// fallback exists only because Swift 5 language mode binds `catch` to
    /// `any Error` rather than the declared thrown type.
    private func asFault(_ error: any Error) -> SyncFault {
        error as? SyncFault ?? .permanent(reason: error.localizedDescription)
    }

    /// The one place a `SyncFault` becomes a sync decision. Replaces the three
    /// divergent `shouldRetry(after:)` implementations.
    private func classify(_ fault: SyncFault) -> Disposition {
        switch fault {
        case .transient, .unreachable:
            return .retain
        case .permanent:
            return .drop
        case .authInvalid:
            return .signOut
        }
    }

    // MARK: - Derived views

    /// The items for a view, derived from the single `items` truth, in the
    /// server's canonical "newest" order; views layer their own sort/filter on top.
    func savedItems(_ selector: FolderSelector = .all) -> [SavedItem] {
        let filtered: [SavedItem]
        switch selector {
        case .all:
            filtered = items
        case .unfiled:
            filtered = items.filter { $0.folder == nil }
        case .folder(let id):
            filtered = items.filter { $0.folder?.id == id }
        }
        return filtered.sortedNewest()
    }

    // MARK: - Loading

    /// First appearance: paint cached content immediately, then load. Runs at
    /// most once, even if the result is empty.
    func loadIfNeeded() async {
        guard items.isEmpty, !hasAttemptedInitialLoad else { return }
        hasAttemptedInitialLoad = true
        restoreCachedItems()
        refreshPendingCaptureState()
        await load()
    }

    /// Initial load: one fast pull for first paint (with the loading spinner),
    /// then a full sync to push queued changes and surface anything new.
    func load() async {
        guard !status.isInitialLoad, !isSyncing else { return }
        status.isInitialLoad = true
        refreshPendingCaptureState()
        let didLoad = await performLoad()
        status.isInitialLoad = false

        guard didLoad else { return }
        await sync()
    }

    /// User-initiated refresh (pull-to-refresh, scene activation): a full sync.
    func refresh() async {
        await sync()
    }

    /// Retry after a failed load: just attempt the pull again.
    func retryLoad() async {
        guard !status.isInitialLoad, !isSyncing else { return }
        isSyncing = true
        defer { isSyncing = false }
        await performLoad()
    }

    /// One sync cycle — push local pending changes (queued captures, then queued
    /// read-state), then pull the canonical state back. Serialized via
    /// `isSyncing`, and skipped while the initial load holds the screen.
    private func sync() async {
        guard !status.isInitialLoad, !isSyncing else { return }
        isSyncing = true
        defer { isSyncing = false }

        refreshPendingCaptureState()
        await drainPendingCaptures()
        await drainPendingReadState()
        await performLoad()
    }

    /// Fetches the full item set (the inbox) and folder list. The item fetch is
    /// the critical path; folders load best-effort.
    @discardableResult
    private func performLoad() async -> Bool {
        do {
            let savedItems = try await network.loadSavedItems()
            items = readStateQueue.apply(to: savedItems)
            persistItems()
            let now = Date()
            status.lastSuccessfulSyncAt = now
            statusDefaults.set(now, forKey: Self.lastSyncDefaultsKey(for: userId))
            status.isAPIReachable = true
            status.errorMessage = nil
            await loadFolders()
            return true
        } catch {
            handleRequestFault(asFault(error))
            return false
        }
    }

    private func loadFolders() async {
        do {
            folders = try await network.loadFolders()
            status.libraryErrorMessage = nil
        } catch {
            handleLibraryFault(asFault(error))
        }
    }

    // MARK: - Folder commands

    func createFolder(named name: String, emoji: String?, color: String?) async throws {
        do {
            let folder = try await network.createFolder(name: name, emoji: emoji, color: color)
            folders.append(folder)
            sortFolders()
            status.libraryErrorMessage = nil
        } catch {
            throw ReadingListError(reason: asFault(error).reason)
        }
    }

    func renameFolder(_ folder: Folder, to name: String, emoji: String?, color: String?) async throws {
        do {
            let renamed = try await network.renameFolder(id: folder.id, name: name, emoji: emoji, color: color)
            folders.removeAll { $0.id == folder.id }
            folders.append(renamed)
            sortFolders()
            applyFolderSummary(renamed)
            status.libraryErrorMessage = nil
        } catch {
            throw ReadingListError(reason: asFault(error).reason)
        }
    }

    func deleteFolder(_ folder: Folder) async throws {
        do {
            try await network.deleteFolder(id: folder.id)
            folders.removeAll { $0.id == folder.id }
            // Detaching the summary returns these items to the Library root — the
            // `.unfiled` view picks them up automatically, no re-fetch needed.
            mutateItems(where: { $0.folder?.id == folder.id }) { $0 = $0.withFolder(nil) }
            persistItems()
        } catch {
            throw ReadingListError(reason: asFault(error).reason)
        }
    }

    func move(_ item: SavedItem, to folder: Folder?) async throws {
        do {
            let updated = try await network.moveItem(id: item.id, toFolder: folder?.id)
            upsert([updated])
            persistItems()
            status.libraryErrorMessage = nil
        } catch {
            throw ReadingListError(reason: asFault(error).reason)
        }
    }

    // MARK: - Item commands

    func capture(_ rawURL: String) async throws -> CaptureSubmissionOutcome {
        let url = rawURL.trimmingCharacters(in: .whitespacesAndNewlines)

        guard status.isOnline else {
            enqueuePendingCapture(url: url)
            return .queued
        }

        do {
            let savedItem = try await network.capture(url: url, sourceName: Self.sourceName, captureChannel: CaptureChannel.app.rawValue)
            upsert([savedItem])
            persistItems()
            status.isAPIReachable = true
            status.errorMessage = nil
            return .saved(savedItem)
        } catch {
            let fault = asFault(error)
            switch classify(fault) {
            case .retain:
                enqueuePendingCapture(url: url)
                status.errorMessage = nil
                return .queued
            case .drop, .signOut:
                handleRequestFault(fault)
                throw ReadingListError(reason: fault.reason)
            }
        }
    }

    /// Optimistically marks an item read for the open animation, before the
    /// `markOpened` round-trip runs.
    func prepareForAnimatedReadStateChange(_ item: SavedItem) {
        updateLocalReadState(for: item.id, isRead: true)
    }

    func markOpened(_ item: SavedItem) async {
        guard let url = URL(string: item.originalURL) else { return }

        updateLocalReadState(for: item.id, isRead: true)

        await UIApplication.shared.open(url)

        guard status.isOnline else {
            readStateQueue.enqueue(itemId: item.id, isRead: true)
            status.errorMessage = nil
            return
        }

        // Fire-and-forget: the local read state is already applied and the link is
        // open, so the server sync runs detached rather than making the caller
        // await a network round-trip after the article has launched.
        Task { @MainActor [weak self] in
            guard let self else { return }

            do {
                let updated = try await self.network.markOpened(itemId: item.id)

                let queuedState = self.readStateQueue.override(for: updated.id)
                if queuedState == nil || queuedState == true {
                    self.readStateQueue.remove(itemId: updated.id)
                }

                if self.currentReadState(for: updated.id) == true {
                    self.upsert([updated])
                    self.persistItems()
                }

                self.status.errorMessage = nil
            } catch {
                let fault = self.asFault(error)
                switch self.classify(fault) {
                case .retain:
                    self.readStateQueue.enqueue(itemId: item.id, isRead: true)
                    self.status.errorMessage = nil
                case .drop, .signOut:
                    self.handleRequestFault(fault)
                }
            }
        }
    }

    func setRead(_ item: SavedItem, isRead: Bool) async {
        updateLocalReadState(for: item.id, isRead: isRead)

        guard status.isOnline else {
            readStateQueue.enqueue(itemId: item.id, isRead: isRead)
            status.errorMessage = nil
            return
        }

        do {
            let updated = try await network.setReadState(itemId: item.id, isRead: isRead)
            let queuedState = readStateQueue.override(for: updated.id)
            if queuedState == nil || queuedState == isRead {
                readStateQueue.remove(itemId: updated.id)
            }

            if currentReadState(for: updated.id) == isRead {
                upsert([updated])
                persistItems()
            }

            status.errorMessage = nil
        } catch {
            let fault = asFault(error)
            switch classify(fault) {
            case .retain:
                readStateQueue.enqueue(itemId: item.id, isRead: isRead)
                status.errorMessage = nil
            case .drop, .signOut:
                handleRequestFault(fault)
            }
        }
    }

    func delete(_ item: SavedItem) async {
        do {
            try await network.deleteItem(itemId: item.id)
            items.removeAll { $0.id == item.id }
            persistItems()
        } catch {
            handleRequestFault(asFault(error))
        }
    }

    func removePendingSavedItem(_ item: PendingSavedItem) {
        pendingCaptureQueue.remove(id: item.id)
        refreshPendingCaptureState()
    }

    // MARK: - Connectivity & draining

    private func startMonitoringConnectivity() {
        connectivity.start { [weak self] isOnline in
            self?.handleConnectivityChange(isOnline: isOnline)
        }
    }

    private func handleConnectivityChange(isOnline: Bool) {
        status.isOnline = isOnline
        guard isOnline else { return }

        // Coming back online: reconcile only if there's queued work to push.
        refreshPendingCaptureState()
        guard pendingCaptureCount > 0 || readStateQueue.hasPending else { return }

        Task { await sync() }
    }

    /// The one drain skeleton both queues share: push each pending item; on the
    /// first `.retain` keep it and the tail queued and stop; on `.signOut`
    /// invalidate the session and stop; `.drop` skips the item and keeps going.
    /// `push` returns the `SyncFault` on failure (having already applied any
    /// per-item success side effect), or `nil` on success.
    private func drain<Item>(
        _ pending: [Item],
        push: (Item) async -> SyncFault?
    ) async -> [Item] {
        var remaining: [Item] = []
        for (index, item) in pending.enumerated() {
            guard let fault = await push(item) else { continue }
            switch classify(fault) {
            case .signOut:
                invalidateAuthentication()
                return remaining
            case .retain:
                remaining.append(contentsOf: pending[index...])
                return remaining
            case .drop:
                continue
            }
        }
        return remaining
    }

    /// Pushes queued captures (made offline, or that failed to sync) to the
    /// server. Only ever called from `sync()`, which serializes it.
    private func drainPendingCaptures() async {
        let pending = pendingCaptureQueue.load()
        guard !pending.isEmpty else { return }

        let remaining = await drain(pending) { capture in
            do {
                _ = try await self.network.capture(url: capture.url, sourceName: capture.sourceName, captureChannel: capture.captureChannel)
                return nil
            } catch {
                return self.asFault(error)
            }
        }

        pendingCaptureQueue.persist(remaining)
        refreshPendingCaptureState()
        status.errorMessage = nil
    }

    /// Pushes queued read-state changes, applying each confirmed result back onto
    /// its item. Only ever called from `sync()`, which serializes it.
    private func drainPendingReadState() async {
        let pending = readStateQueue.all()
        guard !pending.isEmpty else { return }

        var didUpdate = false
        let remaining = await drain(pending) { update in
            do {
                let updated = try await self.network.setReadState(itemId: update.itemId, isRead: update.isRead)
                if self.items.contains(where: { $0.id == updated.id }) {
                    self.upsert([updated])
                    didUpdate = true
                }
                return nil
            } catch {
                return self.asFault(error)
            }
        }

        readStateQueue.persist(remaining)
        if didUpdate { persistItems() }
        status.errorMessage = nil
    }

    // MARK: - Faults

    /// Maps a request fault to the user-facing status. A `.transient` carries its
    /// message in `reason` (empty means "offline — suppress"); `.unreachable`
    /// flips `isAPIReachable`; `.authInvalid` invalidates the session.
    private func handleRequestFault(_ fault: SyncFault) {
        switch fault {
        case .authInvalid:
            invalidateAuthentication()
        case .unreachable:
            status.isAPIReachable = false
            status.errorMessage = nil
        case .transient(let reason):
            status.errorMessage = reason.isEmpty ? nil : reason
        case .permanent(let reason):
            status.errorMessage = reason
        }
    }

    private func handleLibraryFault(_ fault: SyncFault) {
        switch fault {
        case .authInvalid:
            invalidateAuthentication()
        case .transient(let reason), .permanent(let reason), .unreachable(let reason):
            status.libraryErrorMessage = reason.isEmpty ? nil : reason
        }
    }

    private func invalidateAuthentication() {
        status.errorMessage = nil
        onAuthenticationInvalid?("Your Sleevy session expired. Please sign in again.")
    }

    // MARK: - Item mutation helpers

    /// Upserts item data, applying any pending offline read-state overrides so a
    /// freshly-fetched item never clobbers a local toggle that hasn't synced yet.
    private func upsert(_ incoming: [SavedItem]) {
        for item in readStateQueue.apply(to: incoming) {
            if let index = items.firstIndex(where: { $0.id == item.id }) {
                items[index] = item
            } else {
                items.append(item)
            }
        }
    }

    private func updateLocalReadState(for itemId: String, isRead: Bool) {
        guard let index = items.firstIndex(where: { $0.id == itemId }), items[index].isRead != isRead else { return }
        items[index] = items[index].withReadState(isRead)
        persistItems()
    }

    private func currentReadState(for itemId: String) -> Bool? {
        items.first(where: { $0.id == itemId })?.isRead
    }

    /// Reassigns the (renamed) folder's summary onto every item that belongs to it.
    private func applyFolderSummary(_ folder: Folder) {
        let summary = FolderSummary(id: folder.id, name: folder.name, emoji: folder.emoji, color: folder.color)
        mutateItems(where: { $0.folder?.id == folder.id }) { $0 = $0.withFolder(summary) }
        persistItems()
    }

    private func mutateItems(where predicate: (SavedItem) -> Bool, transform: (inout SavedItem) -> Void) {
        for index in items.indices where predicate(items[index]) {
            transform(&items[index])
        }
    }

    private func sortFolders() {
        folders.sort { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    // MARK: - Persistence & pending captures

    private func restoreCachedItems() {
        guard let cachedItems = cache.load() else { return }
        items = readStateQueue.apply(to: cachedItems)
    }

    private func persistItems() {
        cache.save(savedItems())
    }

    private func refreshPendingCaptureState() {
        let pendingItems = pendingCaptureQueue.pendingSavedItems()
        pendingCaptureCount = pendingItems.count
        pendingSavedItems = pendingItems
    }

    private func enqueuePendingCapture(url: String) {
        pendingCaptureQueue.enqueue(url: url, sourceName: Self.sourceName, captureChannel: CaptureChannel.app.rawValue)
        refreshPendingCaptureState()
    }

    // MARK: - Construction helpers

    /// The production `SleevyAPIClient`, wired to the live API base URL and shared
    /// URL session. Extracted so the initializer can fall back to it when no API
    /// is injected.
    private static func makeAPI(
        tokenStore: SessionTokenStore,
        encoder: JSONEncoder,
        decoder: JSONDecoder
    ) -> SleevyAPIClient {
        let api = HTTPClient(
            baseURL: AppConfig.apiBaseURL,
            origin: AppConfig.apiOrigin,
            session: AppConfig.apiSession,
            encoder: encoder,
            decoder: decoder
        )
        let captureClient = SleevyCaptureClient(
            apiBaseURL: AppConfig.apiBaseURL,
            apiOrigin: AppConfig.apiOrigin,
            urlSession: AppConfig.apiSession,
            encoder: encoder,
            decoder: decoder
        )
        return SleevyAPIClient(
            api: api,
            captureClient: captureClient,
            decoder: decoder,
            tokenStore: tokenStore
        )
    }

    private static func applicationSupportDirectory() -> URL {
        try! FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
    }

    private static func lastSyncDefaultsKey(for userId: String) -> String {
        "reading-list-last-sync.\(userId)"
    }
}

private extension Sequence where Element == SavedItem {
    /// Reproduces the server's canonical "newest" ordering: `desc(lastSavedAt, id)`.
    func sortedNewest() -> [SavedItem] {
        sorted { ($0.lastSavedAt, $0.id) > ($1.lastSavedAt, $1.id) }
    }
}

enum CaptureSubmissionOutcome: Equatable {
    case saved(SavedItem)
    case queued
}
