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

/// The reading list's single source of truth.
///
/// One canonical `items` array holds every saved item we know about. The Inbox,
/// Library root, and each Folder are *derived* by `savedItems(_:)` — pure
/// filter + sort, never stored — so a read-state toggle, move, or rename is one
/// write to `items` that every view reflects automatically. There are no
/// per-view projections to keep coherent.
///
/// Because the server returns every list with the same deterministic order
/// (`desc(lastSavedAt, id)`) and no pagination, the inbox snapshot is the full
/// set: the Library root and folders are subsets of it, reproduced locally
/// rather than re-fetched.
///
/// Offline behavior is delegated to focused collaborators: `ReadStateQueue`
/// (read-state edits made offline) and `PendingCaptureQueue` (captures made in
/// the app or the share extension). This store composes them and owns the
/// coordination — optimistic updates, queue draining, persistence, and error
/// classification.
@MainActor
@Observable
final class Library {
    /// The one truth: every saved item, in no particular stored order.
    private(set) var items: [SavedItem] = []
    private(set) var folders: [Folder] = []

    private(set) var pendingSavedItems: [PendingSavedItem] = []
    /// Drives the full-screen "loading" spinner: true only during the very first
    /// fetch, when there is nothing to show yet.
    private(set) var isLoading = false
    private(set) var isOnline = true
    private(set) var isAPIReachable = true
    private(set) var lastSuccessfulSyncAt: Date?
    private(set) var pendingCaptureCount = 0
    var errorMessage: String?
    var libraryErrorMessage: String?
    var onAuthenticationInvalid: ((String) -> Void)?

    private let session: AppSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder
    private let api: SleevyAPI
    private let pendingCaptureQueue: PendingCaptureQueue
    private let readStateQueue: ReadStateQueue
    private let savedItemCache: SavedItemCache
    private let statusDefaults: UserDefaults
    private let connectivityMonitor: any ConnectivityMonitoring
    private var hasAttemptedInitialLoad = false
    /// Serializes sync cycles (and the standalone retry pull) so two never run at
    /// once — the single re-entrancy guard for all server coordination.
    private var isSyncing = false
    private static var sourceName: String { SleevyUserPreferences.sourceName }

    /// Collaborators default to their production construction (live API session,
    /// app-group queues, application-support cache, standard defaults). Tests
    /// inject stubbed versions to drive the coordination logic deterministically.
    init(
        session: AppSession,
        tokenStore: SessionTokenStore? = nil,
        connectivityMonitor: any ConnectivityMonitoring = LiveConnectivityMonitor(),
        api: SleevyAPI? = nil,
        pendingCaptureQueue: PendingCaptureQueue? = nil,
        readStateQueue: ReadStateQueue? = nil,
        savedItemCache: SavedItemCache? = nil,
        statusDefaults: UserDefaults = .standard
    ) {
        self.session = session
        self.connectivityMonitor = connectivityMonitor

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .sleevyISO8601
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        self.decoder = decoder
        self.encoder = encoder

        self.api = api ?? Self.makeAPI(
            tokenStore: tokenStore ?? SessionTokenStore(initial: session.token),
            encoder: encoder,
            decoder: decoder
        )
        self.pendingCaptureQueue = pendingCaptureQueue ?? PendingCaptureQueue(
            userId: session.userId,
            store: SleevyPendingCaptureStore(appGroupIdentifier: AppConfig.appGroupIdentifier)
        )
        self.readStateQueue = readStateQueue ?? ReadStateQueue(
            userId: session.userId,
            containerURL: FileManager.default.containerURL(
                forSecurityApplicationGroupIdentifier: AppConfig.appGroupIdentifier
            )
        )
        self.savedItemCache = savedItemCache ?? SavedItemCache(
            userId: session.userId,
            directory: Self.applicationSupportDirectory(),
            encoder: encoder,
            decoder: decoder
        )
        self.statusDefaults = statusDefaults
        self.lastSuccessfulSyncAt = statusDefaults.object(forKey: Self.lastSyncDefaultsKey(for: session.userId)) as? Date
        let pendingItems = self.pendingCaptureQueue.pendingSavedItems()
        self.pendingCaptureCount = pendingItems.count
        self.pendingSavedItems = pendingItems
        startMonitoringConnectivity()
    }

    // MARK: - Derived views

    /// The items for a view, derived from the single `items` truth. Returned in
    /// the server's canonical "newest" order; views layer their own sort/filter
    /// on top.
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
        guard !isLoading, !isSyncing else { return }
        isLoading = true
        refreshPendingCaptureState()
        let didLoad = await performLoad()
        isLoading = false

        guard didLoad else { return }
        await sync()
    }

    /// User-initiated refresh (pull-to-refresh, scene activation): a full sync.
    func refresh() async {
        await sync()
    }

    /// Retry after a failed load: just attempt the pull again.
    func retryLoad() async {
        guard !isLoading, !isSyncing else { return }
        isSyncing = true
        defer { isSyncing = false }
        await performLoad()
    }

    /// One sync cycle — the heart of the load logic: push local pending changes
    /// to the server (queued captures, then queued read-state), then pull the
    /// canonical state back so freshly-synced items surface. Serialized via
    /// `isSyncing`, and skipped while the initial load holds the screen, so
    /// cycles never overlap or race a load.
    private func sync() async {
        guard !isLoading, !isSyncing else { return }
        isSyncing = true
        defer { isSyncing = false }

        refreshPendingCaptureState()
        await drainPendingCaptures()
        await drainPendingReadState()
        await performLoad()
    }

    /// Fetches the full item set (the inbox) and folder list. The item fetch is
    /// the critical path — its failure fails the load; folders load best-effort
    /// so the inbox still renders if only the folder endpoint is down.
    @discardableResult
    private func performLoad() async -> Bool {
        do {
            let savedItems = try await api.loadSavedItems()
            items = readStateQueue.apply(to: savedItems)
            persistItems()
            lastSuccessfulSyncAt = Date()
            statusDefaults.set(lastSuccessfulSyncAt, forKey: Self.lastSyncDefaultsKey(for: session.userId))
            isAPIReachable = true
            errorMessage = nil
            await loadFolders()
            return true
        } catch {
            handleRequestError(error)
            return false
        }
    }

    private func loadFolders() async {
        do {
            folders = try await api.loadFolders()
            libraryErrorMessage = nil
        } catch {
            handleLibraryError(error)
        }
    }

    // MARK: - Folder commands

    func createFolder(named name: String, emoji: String?, color: String?) async throws {
        let folder = try await api.createFolder(name: name, emoji: emoji, color: color)
        folders.append(folder)
        sortFolders()
        libraryErrorMessage = nil
    }

    func renameFolder(_ folder: Folder, to name: String, emoji: String?, color: String?) async throws {
        let renamed = try await api.renameFolder(id: folder.id, name: name, emoji: emoji, color: color)
        folders.removeAll { $0.id == folder.id }
        folders.append(renamed)
        sortFolders()
        applyFolderSummary(renamed)
        libraryErrorMessage = nil
    }

    func deleteFolder(_ folder: Folder) async throws {
        try await api.deleteFolder(id: folder.id)
        folders.removeAll { $0.id == folder.id }
        // Detaching the summary returns these items to the Library root — the
        // `.unfiled` view picks them up automatically, no re-fetch needed.
        mutateItems(where: { $0.folder?.id == folder.id }) { $0 = $0.withFolder(nil) }
        persistItems()
    }

    func move(_ item: SavedItem, to folder: Folder?) async throws {
        let updated = try await api.moveItem(id: item.id, toFolder: folder?.id)
        upsert([updated])
        persistItems()
        libraryErrorMessage = nil
    }

    // MARK: - Item commands

    func capture(_ rawURL: String) async throws -> CaptureSubmissionOutcome {
        let url = rawURL.trimmingCharacters(in: .whitespacesAndNewlines)

        guard isOnline else {
            enqueuePendingCapture(url: url)
            return .queued
        }

        do {
            let savedItem = try await api.capture(url: url, sourceName: Self.sourceName, captureChannel: CaptureChannel.app.rawValue)
            upsert([savedItem])
            persistItems()
            isAPIReachable = true
            errorMessage = nil
            return .saved(savedItem)
        } catch {
            if pendingCaptureQueue.shouldRetry(after: error) {
                enqueuePendingCapture(url: url)
                errorMessage = nil
                return .queued
            }

            handleRequestError(error)
            throw error
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

        guard isOnline else {
            readStateQueue.enqueue(itemId: item.id, isRead: true)
            errorMessage = nil
            return
        }

        // Fire-and-forget: the local read state is already applied and the link is
        // open, so the server sync runs detached rather than making the caller
        // await a network round-trip after the article has launched.
        Task { @MainActor [weak self] in
            guard let self else { return }

            do {
                let updated = try await api.markOpened(id: item.id)

                let queuedState = readStateQueue.override(for: updated.id)
                if queuedState == nil || queuedState == true {
                    readStateQueue.remove(itemId: updated.id)
                }

                if currentReadState(for: updated.id) == true {
                    upsert([updated])
                    persistItems()
                }

                errorMessage = nil
            } catch {
                if readStateQueue.shouldRetry(after: error) {
                    readStateQueue.enqueue(itemId: item.id, isRead: true)
                    errorMessage = nil
                } else {
                    handleRequestError(error)
                }
            }
        }
    }

    func setRead(_ item: SavedItem, isRead: Bool) async {
        updateLocalReadState(for: item.id, isRead: isRead)

        guard isOnline else {
            readStateQueue.enqueue(itemId: item.id, isRead: isRead)
            errorMessage = nil
            return
        }

        do {
            let updated = try await api.setReadState(itemId: item.id, isRead: isRead)
            let queuedState = readStateQueue.override(for: updated.id)
            if queuedState == nil || queuedState == isRead {
                readStateQueue.remove(itemId: updated.id)
            }

            if currentReadState(for: updated.id) == isRead {
                upsert([updated])
                persistItems()
            }

            errorMessage = nil
        } catch {
            if readStateQueue.shouldRetry(after: error) {
                readStateQueue.enqueue(itemId: item.id, isRead: isRead)
                errorMessage = nil
            } else {
                handleRequestError(error)
            }
        }
    }

    func delete(_ item: SavedItem) async {
        do {
            try await api.deleteItem(id: item.id)
            items.removeAll { $0.id == item.id }
            persistItems()
        } catch {
            handleRequestError(error)
        }
    }

    func removePendingSavedItem(_ item: PendingSavedItem) {
        pendingCaptureQueue.remove(id: item.id)
        refreshPendingCaptureState()
    }

    // MARK: - Connectivity & sync

    private func startMonitoringConnectivity() {
        connectivityMonitor.start { [weak self] isOnline in
            self?.handleConnectivityChange(isOnline: isOnline)
        }
    }

    private func handleConnectivityChange(isOnline: Bool) {
        self.isOnline = isOnline
        guard isOnline else { return }

        // Coming back online: reconcile only if there's queued work to push.
        refreshPendingCaptureState()
        guard pendingCaptureCount > 0 || readStateQueue.hasPending else { return }

        Task { await sync() }
    }

    /// Pushes queued captures (made offline, or that failed to sync) to the
    /// server. Stops at the first retriable failure, keeping it and everything
    /// after it queued; permanent failures are dropped. Only ever called from
    /// `sync()`, which serializes it.
    private func drainPendingCaptures() async {
        let pendingCaptures = pendingCaptureQueue.load()
        guard !pendingCaptures.isEmpty else { return }

        var remaining: [SleevyPendingCapture] = []
        for (index, capture) in pendingCaptures.enumerated() {
            do {
                _ = try await api.capture(url: capture.url, sourceName: capture.sourceName, captureChannel: capture.captureChannel)
            } catch {
                if handleAuthenticationInvalid(error) { break }
                if pendingCaptureQueue.shouldRetry(after: error) {
                    remaining.append(contentsOf: pendingCaptures[index...])
                    break
                }
            }
        }

        pendingCaptureQueue.persist(remaining)
        refreshPendingCaptureState()
        errorMessage = nil
    }

    /// Pushes queued read-state changes to the server, applying each confirmed
    /// result back onto its item. Stops at the first retriable failure. Only ever
    /// called from `sync()`, which serializes it.
    private func drainPendingReadState() async {
        let pending = readStateQueue.all()
        guard !pending.isEmpty else { return }

        var remaining: [PendingReadStateUpdate] = []
        var didUpdate = false
        for (index, update) in pending.enumerated() {
            do {
                let updated = try await api.setReadState(itemId: update.itemId, isRead: update.isRead)
                if items.contains(where: { $0.id == updated.id }) {
                    upsert([updated])
                    didUpdate = true
                }
            } catch {
                if handleAuthenticationInvalid(error) { break }
                if readStateQueue.shouldRetry(after: error) {
                    remaining.append(contentsOf: pending[index...])
                    break
                }
            }
        }

        readStateQueue.persist(remaining)
        if didUpdate { persistItems() }
        errorMessage = nil
    }

    // MARK: - Errors

    private func handleRequestError(_ error: Error) {
        if handleAuthenticationInvalid(error) {
            return
        }

        if error is APIError {
            isAPIReachable = false
            errorMessage = nil
        } else {
            if AppConfig.isOfflineNetworkError(error) {
                errorMessage = nil
            } else if let networkMessage = AppConfig.userFacingNetworkMessage(for: error) {
                errorMessage = networkMessage
            } else {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func handleLibraryError(_ error: Error) {
        if handleAuthenticationInvalid(error) {
            return
        }

        libraryErrorMessage = AppConfig.userFacingNetworkMessage(for: error) ?? error.localizedDescription
    }

    private func handleAuthenticationInvalid(_ error: Error) -> Bool {
        if let authError = error as? AuthError, case .sessionExpired = authError {
            invalidateAuthentication()
            return true
        }

        if let captureError = error as? SleevyCaptureError, case .sessionExpired = captureError {
            invalidateAuthentication()
            return true
        }

        return false
    }

    private func invalidateAuthentication() {
        errorMessage = nil
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

    /// Reassigns the (renamed) folder's summary onto every item that belongs to
    /// it. One pass over the canonical store; all views follow.
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
        guard let cachedItems = savedItemCache.load() else { return }
        items = readStateQueue.apply(to: cachedItems)
    }

    private func persistItems() {
        savedItemCache.save(savedItems())
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

    /// The production `SleevyAPI`, wired to the live API base URL and shared
    /// URL session. Extracted so the initializer can fall back to it when no API
    /// is injected.
    private static func makeAPI(
        tokenStore: SessionTokenStore,
        encoder: JSONEncoder,
        decoder: JSONDecoder
    ) -> SleevyAPI {
        let api = APIClient(
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
        return SleevyAPI(
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
