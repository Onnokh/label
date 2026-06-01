import Foundation
import Observation
import UIKit

@MainActor
@Observable
final class ReadingListStore {
    /// Canonical, de-duplicated store of every saved item we know about, keyed by
    /// id. Item *data* lives here exactly once; the inbox/library/folder
    /// collections below are ordered *projections* of ids into this dictionary.
    /// A read-state toggle or folder rename is therefore a single write here that
    /// every projection reflects automatically — no cross-collection fan-out.
    private var itemsById: [String: SavedItem] = [:]
    /// Ids in inbox-feed order (the `/v1/saved-items` response). The inbox holds
    /// every item; library/folder are subsets loaded from their own endpoints.
    private var inboxOrder: [String] = []
    /// Ids of unfiled items shown at the library root.
    private var rootOrder: [String] = []
    /// Ids per loaded folder. A missing key means the folder hasn't been loaded
    /// yet; the views read this to distinguish "empty" from "not loaded".
    private var folderOrder: [String: [String]] = [:]

    /// The inbox feed: every saved item, in server order.
    var savedItems: [SavedItem] { inboxOrder.compactMap { itemsById[$0] } }
    /// Unfiled items shown at the library root.
    var libraryRootItems: [SavedItem] { rootOrder.compactMap { itemsById[$0] } }
    /// Loaded folders' items, keyed by folder id. A missing key means the folder
    /// hasn't been loaded yet.
    var folderItems: [String: [SavedItem]] {
        folderOrder.reduce(into: [:]) { result, entry in
            result[entry.key] = entry.value.compactMap { itemsById[$0] }
        }
    }

    private(set) var pendingSavedItems: [PendingSavedItem] = []
    private(set) var folders: [Folder] = []
    private(set) var isLoadingLibrary = false
    var libraryErrorMessage: String?
    private(set) var isLoading = false
    private(set) var isRefreshing = false
    private(set) var isOnline = true
    private(set) var isAPIReachable = true
    private(set) var lastSuccessfulSyncAt: Date?
    private(set) var pendingCaptureCount = 0
    private(set) var isSyncingPendingCaptures = false
    var errorMessage: String?
    var onAuthenticationInvalid: ((String) -> Void)?

    private let session: AppSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder
    private let savedItemsAPI: SavedItemsAPI
    private let pendingCaptureQueue: PendingCaptureQueue
    private let readStateQueue: ReadStateQueue
    private let savedItemCache: SavedItemCache
    private let statusDefaults: UserDefaults
    private let connectivityMonitor: any ConnectivityMonitoring
    private var hasAttemptedInitialLoad = false
    private var hasAttemptedLibraryLoad = false
    private var isSyncingPendingReadStateUpdates = false
    private static var sourceName: String {
        SleevyUserPreferences.sourceName
    }

    /// Collaborators default to their production construction (live API session,
    /// app-group queues, application-support cache, standard defaults). Tests
    /// inject stubbed versions — a `URLProtocol`-backed `SavedItemsAPI`, temp-dir
    /// queues/cache — to drive the store's coordination logic deterministically,
    /// the same way `connectivityMonitor` is already substituted.
    init(
        session: AppSession,
        connectivityMonitor: any ConnectivityMonitoring = LiveConnectivityMonitor(),
        savedItemsAPI: SavedItemsAPI? = nil,
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

        self.savedItemsAPI = savedItemsAPI ?? Self.makeSavedItemsAPI(
            token: session.token,
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

    /// The production `SavedItemsAPI`, wired to the live API base URL and shared
    /// URL session. Extracted so the initializer can fall back to it when no API
    /// is injected.
    private static func makeSavedItemsAPI(
        token: String,
        encoder: JSONEncoder,
        decoder: JSONDecoder
    ) -> SavedItemsAPI {
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
        return SavedItemsAPI(
            api: api,
            captureClient: captureClient,
            decoder: decoder,
            token: token
        )
    }

    func loadIfNeeded() async {
        guard savedItems.isEmpty, !isLoading, !hasAttemptedInitialLoad else { return }
        restoreCachedItems()
        refreshPendingCaptureState()
        await load()
    }

    func refresh() async {
        guard !isRefreshing else { return }
        isRefreshing = true
        defer { isRefreshing = false }
        refreshPendingCaptureState()
        await syncPendingCapturesIfNeeded()
        await syncPendingReadStateUpdatesIfNeeded()
        await performLoad()
        if hasAttemptedLibraryLoad {
            await loadLibraryRoot()
        }
    }

    func load() async {
        guard !isLoading else { return }
        hasAttemptedInitialLoad = true
        isLoading = true
        refreshPendingCaptureState()
        let didLoad = await performLoad()
        isLoading = false

        guard didLoad else { return }

        await syncPendingCapturesIfNeeded()
        await syncPendingReadStateUpdatesIfNeeded()

        guard !isLoading, !isRefreshing else { return }
        await performLoad()
    }

    func retryLoad() async {
        guard !isLoading, !isRefreshing else { return }
        hasAttemptedInitialLoad = true
        refreshPendingCaptureState()
        await performLoad()
    }

    func loadLibraryRoot() async {
        guard !isLoadingLibrary else { return }
        hasAttemptedLibraryLoad = true
        isLoadingLibrary = true
        defer { isLoadingLibrary = false }

        do {
            let foldersResponse = try await savedItemsAPI.request(path: "/v1/folders", responseType: FoldersResponse.self)
            let rootResponse = try await savedItemsAPI.request(
                path: "/v1/saved-items",
                queryItems: [URLQueryItem(name: "folder", value: "none")],
                responseType: SavedItemsResponse.self
            )
            folders = foldersResponse.folders
            ingest(rootResponse.savedItems)
            rootOrder = rootResponse.savedItems.map(\.id)
            pruneOrphans()
            libraryErrorMessage = nil
        } catch {
            handleLibraryError(error)
        }
    }

    func loadFolderItems(_ folder: Folder) async {
        do {
            let response = try await savedItemsAPI.request(
                path: "/v1/saved-items",
                queryItems: [URLQueryItem(name: "folder", value: folder.id)],
                responseType: SavedItemsResponse.self
            )
            ingest(response.savedItems)
            folderOrder[folder.id] = response.savedItems.map(\.id)
            libraryErrorMessage = nil
        } catch {
            handleLibraryError(error)
        }
    }

    func createFolder(named name: String, emoji: String?, color: String?) async throws {
        let folder = try await savedItemsAPI.request(
            path: "/v1/folders",
            method: "POST",
            body: FolderNameRequest(name: name, emoji: emoji, color: color),
            responseType: Folder.self
        )
        folders.append(folder)
        folders.sort { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        libraryErrorMessage = nil
    }

    func renameFolder(_ folder: Folder, to name: String, emoji: String?, color: String?) async throws {
        let renamed = try await savedItemsAPI.request(
            path: "/v1/folders/\(folder.id)",
            method: "PATCH",
            body: FolderNameRequest(name: name, emoji: emoji, color: color),
            responseType: Folder.self
        )
        folders.removeAll { $0.id == folder.id }
        folders.append(renamed)
        folders.sort { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        applyFolderSummary(renamed)
        libraryErrorMessage = nil
    }

    func deleteFolder(_ folder: Folder) async throws {
        try await savedItemsAPI.requestNoContent(path: "/v1/folders/\(folder.id)", method: "DELETE")
        folders.removeAll { $0.id == folder.id }
        let returningIds = folderOrder.removeValue(forKey: folder.id) ?? []
        for (id, item) in itemsById where item.folder?.id == folder.id {
            itemsById[id] = item.withFolder(nil)
        }
        for id in returningIds where !rootOrder.contains(id) {
            rootOrder.append(id)
        }
        persistSavedItems()
        await loadLibraryRoot()
    }

    func move(_ item: SavedItem, to folder: Folder?) async throws {
        let updated = try await savedItemsAPI.request(
            path: "/v1/saved-items/\(item.id)/folder",
            method: "PUT",
            body: FolderAssignmentRequest(folderId: folder?.id),
            responseType: SavedItem.self
        )
        ingest([updated])
        removeFromLibraryProjections(id: updated.id)
        if let folderId = updated.folder?.id {
            // Only insert into a folder that's been loaded; otherwise it loads
            // fresh on next open.
            if folderOrder[folderId] != nil {
                folderOrder[folderId]?.insert(updated.id, at: 0)
            }
        } else {
            rootOrder.insert(updated.id, at: 0)
        }
        persistSavedItems()
        libraryErrorMessage = nil
    }

    func removePendingSavedItem(_ item: PendingSavedItem) {
        pendingCaptureQueue.remove(id: item.id)
        refreshPendingCaptureState()
    }

    func prepareForAnimatedReadStateChange(_ item: SavedItem) {
        updateLocalReadState(for: item.id, isRead: true)
    }

    func capture(_ rawURL: String) async throws -> CaptureSubmissionOutcome {
        let url = rawURL.trimmingCharacters(in: .whitespacesAndNewlines)

        guard isOnline else {
            enqueuePendingCapture(url: url)
            return .queued
        }

        do {
            let savedItem = try await savedItemsAPI.capture(url: url, sourceName: Self.sourceName, captureChannel: "ios-app")
            upsertCapturedSavedItem(savedItem)
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

    func markOpened(_ item: SavedItem) async {
        guard let url = URL(string: item.originalURL) else { return }

        updateLocalReadState(for: item.id, isRead: true)

        await UIApplication.shared.open(url)

        guard isOnline else {
            readStateQueue.enqueue(itemId: item.id, isRead: true)
            errorMessage = nil
            return
        }

        Task { @MainActor [weak self] in
            guard let self else { return }

            do {
                let updated = try await savedItemsAPI.request(
                    path: "/v1/saved-items/\(item.id)/open",
                    method: "POST",
                    responseType: SavedItem.self
                )

                let queuedState = readStateQueue.override(for: updated.id)
                if queuedState == nil || queuedState == true {
                    readStateQueue.remove(itemId: updated.id)
                }

                if currentReadState(for: updated.id) == true {
                    ingest([updated])
                    persistSavedItems()
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
            let updated = try await savedItemsAPI.setReadState(itemId: item.id, isRead: isRead)
            let queuedState = readStateQueue.override(for: updated.id)
            if queuedState == nil || queuedState == isRead {
                readStateQueue.remove(itemId: updated.id)
            }

            if currentReadState(for: updated.id) == isRead {
                ingest([updated])
                persistSavedItems()
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
            try await savedItemsAPI.requestNoContent(path: "/v1/saved-items/\(item.id)", method: "DELETE")
            removeItem(id: item.id)
            persistSavedItems()
        } catch {
            handleRequestError(error)
        }
    }

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

    @discardableResult
    private func performLoad() async -> Bool {
        do {
            let response = try await savedItemsAPI.request(
                path: "/v1/saved-items",
                responseType: SavedItemsResponse.self
            )
            ingest(response.savedItems)
            inboxOrder = response.savedItems.map(\.id)
            pruneOrphans()
            persistSavedItems()
            lastSuccessfulSyncAt = Date()
            statusDefaults.set(lastSuccessfulSyncAt, forKey: Self.lastSyncDefaultsKey(for: session.userId))
            isAPIReachable = true
            errorMessage = nil
            return true
        } catch {
            if handleAuthenticationInvalid(error) {
                return false
            }

            if error is APIError {
                isAPIReachable = false
                errorMessage = nil
            } else if AppConfig.isOfflineNetworkError(error) {
                errorMessage = nil
            } else if AppConfig.userFacingNetworkMessage(for: error) == nil {
                errorMessage = error.localizedDescription
            } else {
                errorMessage = AppConfig.userFacingNetworkMessage(for: error)
            }
            return false
        }
    }

    private func startMonitoringConnectivity() {
        connectivityMonitor.start { [weak self] isOnline in
            self?.handleConnectivityChange(isOnline: isOnline)
        }
    }

    private func handleConnectivityChange(isOnline: Bool) {
        self.isOnline = isOnline
        guard isOnline else { return }

        refreshPendingCaptureState()
        let hasPendingReadStateUpdates = readStateQueue.hasPending
        let hasPendingCaptures = pendingCaptureCount > 0
        guard hasPendingCaptures || hasPendingReadStateUpdates else { return }

        Task {
            if hasPendingCaptures {
                await syncPendingCapturesIfNeeded()
            }
            await syncPendingReadStateUpdatesIfNeeded()

            guard !isLoading, !isRefreshing else { return }
            await performLoad()
        }
    }

    private func syncPendingCapturesIfNeeded() async {
        refreshPendingCaptureState()

        guard pendingCaptureCount > 0, !isSyncingPendingCaptures else { return }

        isSyncingPendingCaptures = true
        defer {
            isSyncingPendingCaptures = false
            refreshPendingCaptureState()
        }

        let pendingCaptures = pendingCaptureQueue.load()
        guard !pendingCaptures.isEmpty else { return }

        var remainingCaptures: [SleevyPendingCapture] = []
        var retriableError: Error?

        for (index, pendingCapture) in pendingCaptures.enumerated() {
            do {
                try await submitPendingCapture(url: pendingCapture.url, sourceName: pendingCapture.sourceName, captureChannel: pendingCapture.captureChannel)
            } catch {
                if handleAuthenticationInvalid(error) {
                    break
                }

                if pendingCaptureQueue.shouldRetry(after: error) {
                    remainingCaptures.append(contentsOf: pendingCaptures[index...])
                    retriableError = error
                    break
                }
            }
        }

        pendingCaptureQueue.persist(remainingCaptures)

        if retriableError != nil {
            errorMessage = nil
        } else if remainingCaptures.isEmpty {
            errorMessage = nil
        }
    }

    private func syncPendingReadStateUpdatesIfNeeded() async {
        guard !isSyncingPendingReadStateUpdates else { return }

        let pendingReadStateUpdates = readStateQueue.all()
        guard !pendingReadStateUpdates.isEmpty else { return }

        isSyncingPendingReadStateUpdates = true
        defer { isSyncingPendingReadStateUpdates = false }

        var remainingUpdates: [PendingReadStateUpdate] = []
        var didUpdateSavedItems = false

        for (index, pendingUpdate) in pendingReadStateUpdates.enumerated() {
            do {
                let updated = try await savedItemsAPI.setReadState(
                    itemId: pendingUpdate.itemId,
                    isRead: pendingUpdate.isRead
                )

                if itemsById[updated.id] != nil {
                    ingest([updated])
                    didUpdateSavedItems = true
                }
            } catch {
                if handleAuthenticationInvalid(error) {
                    break
                }

                if readStateQueue.shouldRetry(after: error) {
                    remainingUpdates.append(contentsOf: pendingReadStateUpdates[index...])
                    break
                }
            }
        }

        readStateQueue.persist(remainingUpdates)

        if didUpdateSavedItems {
            persistSavedItems()
        }

        errorMessage = nil
    }

    private func submitPendingCapture(url: String, sourceName: String?, captureChannel: String?) async throws {
        _ = try await savedItemsAPI.capture(url: url, sourceName: sourceName, captureChannel: captureChannel)
    }

    private func handleAuthenticationInvalid(_ error: Error) -> Bool {
        if let authError = error as? AuthError,
           case .sessionExpired = authError {
            invalidateAuthentication()
            return true
        }

        if let captureError = error as? SleevyCaptureError,
           case .sessionExpired = captureError {
            invalidateAuthentication()
            return true
        }

        return false
    }

    private func invalidateAuthentication() {
        errorMessage = nil
        onAuthenticationInvalid?("Your Sleevy session expired. Please sign in again.")
    }

    private func restoreCachedItems() {
        guard let cachedItems = savedItemCache.load() else { return }

        ingest(cachedItems)
        inboxOrder = cachedItems.map(\.id)
    }

    private func refreshPendingCaptureState() {
        let pendingItems = pendingCaptureQueue.pendingSavedItems()
        pendingCaptureCount = pendingItems.count
        pendingSavedItems = pendingItems
    }

    private func persistSavedItems() {
        savedItemCache.save(savedItems)
    }

    /// Upserts item *data* into the canonical store, applying any pending offline
    /// read-state overrides so a freshly-fetched item never clobbers a local
    /// toggle that hasn't synced yet — regardless of which endpoint it arrived
    /// from. Every projection that references the id reflects the change.
    private func ingest(_ items: [SavedItem]) {
        for item in readStateQueue.apply(to: items) {
            itemsById[item.id] = item
        }
    }

    /// Removes an item entirely: its data and every projection that referenced it.
    private func removeItem(id: String) {
        itemsById[id] = nil
        inboxOrder.removeAll { $0 == id }
        removeFromLibraryProjections(id: id)
    }

    /// Removes an id from the library root and every loaded folder, leaving the
    /// inbox feed untouched. Used when an item changes folder destination.
    private func removeFromLibraryProjections(id: String) {
        rootOrder.removeAll { $0 == id }
        for key in folderOrder.keys {
            folderOrder[key]?.removeAll { $0 == id }
        }
    }

    /// Drops canonical entries no projection references anymore (e.g. items
    /// deleted server-side that fell out of every loaded collection), so
    /// `itemsById` can't grow without bound across a long session.
    private func pruneOrphans() {
        var referenced = Set(inboxOrder)
        referenced.formUnion(rootOrder)
        for ids in folderOrder.values { referenced.formUnion(ids) }
        itemsById = itemsById.filter { referenced.contains($0.key) }
    }

    private func updateLocalReadState(for itemId: String, isRead: Bool) {
        guard let item = itemsById[itemId], item.isRead != isRead else { return }
        itemsById[itemId] = item.withReadState(isRead)
        persistSavedItems()
    }

    private func currentReadState(for itemId: String) -> Bool? {
        itemsById[itemId]?.isRead
    }

    private func enqueuePendingCapture(url: String) {
        pendingCaptureQueue.enqueue(url: url, sourceName: Self.sourceName, captureChannel: "ios-app")
        refreshPendingCaptureState()
    }

    private func upsertCapturedSavedItem(_ savedItem: SavedItem) {
        ingest([savedItem])
        inboxOrder.removeAll { $0 == savedItem.id }
        inboxOrder.insert(savedItem.id, at: 0)
        if hasAttemptedLibraryLoad && savedItem.folder == nil {
            rootOrder.removeAll { $0 == savedItem.id }
            rootOrder.insert(savedItem.id, at: 0)
        }
        persistSavedItems()
    }

    /// Reassigns the (renamed) folder's summary onto every item that belongs to
    /// it. One write per item in the canonical store; all projections follow.
    private func applyFolderSummary(_ folder: Folder) {
        let summary = FolderSummary(id: folder.id, name: folder.name, emoji: folder.emoji, color: folder.color)
        for (id, item) in itemsById where item.folder?.id == folder.id {
            itemsById[id] = item.withFolder(summary)
        }
        persistSavedItems()
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

private struct FolderNameRequest: Encodable {
    let name: String
    let emoji: String?
    let color: String?

    private enum CodingKeys: String, CodingKey {
        case name
        case emoji
        case color
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(name, forKey: .name)
        try container.encode(emoji, forKey: .emoji)
        try container.encode(color, forKey: .color)
    }
}

private struct FolderAssignmentRequest: Encodable {
    let folderId: String?

    private enum CodingKeys: String, CodingKey {
        case folderId
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        if let folderId {
            try container.encode(folderId, forKey: .folderId)
        } else {
            try container.encodeNil(forKey: .folderId)
        }
    }
}

enum CaptureSubmissionOutcome: Equatable {
    case saved(SavedItem)
    case queued
}
