import Combine
import Foundation
import UIKit

@MainActor
final class ReadingListStore: ObservableObject {
    @Published private(set) var savedItems: [SavedItem] = []
    @Published private(set) var pendingSavedItems: [PendingSavedItem] = []
    @Published private(set) var folders: [Folder] = []
    @Published private(set) var libraryRootItems: [SavedItem] = []
    @Published private(set) var folderItems: [String: [SavedItem]] = [:]
    @Published private(set) var isLoadingLibrary = false
    @Published var libraryErrorMessage: String?
    @Published private(set) var isLoading = false
    @Published private(set) var isRefreshing = false
    @Published private(set) var isOnline = true
    @Published private(set) var isAPIReachable = true
    @Published private(set) var lastSuccessfulSyncAt: Date?
    @Published private(set) var pendingCaptureCount = 0
    @Published private(set) var isSyncingPendingCaptures = false
    @Published var errorMessage: String?
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

    init(
        session: AppSession,
        connectivityMonitor: any ConnectivityMonitoring = LiveConnectivityMonitor()
    ) {
        self.session = session
        self.connectivityMonitor = connectivityMonitor
        self.decoder = JSONDecoder()
        self.decoder.dateDecodingStrategy = .sleevyISO8601
        self.encoder = JSONEncoder()
        self.encoder.dateEncodingStrategy = .iso8601
        let api = APIClient(
            baseURL: AppConfig.apiBaseURL,
            origin: AppConfig.apiOrigin,
            session: AppConfig.apiSession,
            encoder: self.encoder,
            decoder: self.decoder
        )
        let captureClient = SleevyCaptureClient(
            apiBaseURL: AppConfig.apiBaseURL,
            apiOrigin: AppConfig.apiOrigin,
            urlSession: AppConfig.apiSession,
            encoder: self.encoder,
            decoder: self.decoder
        )
        self.savedItemsAPI = SavedItemsAPI(
            api: api,
            captureClient: captureClient,
            decoder: self.decoder,
            token: session.token
        )
        self.pendingCaptureQueue = PendingCaptureQueue(
            userId: session.userId,
            store: SleevyPendingCaptureStore(appGroupIdentifier: AppConfig.appGroupIdentifier)
        )
        self.readStateQueue = ReadStateQueue(
            userId: session.userId,
            containerURL: FileManager.default.containerURL(
                forSecurityApplicationGroupIdentifier: AppConfig.appGroupIdentifier
            )
        )
        self.savedItemCache = SavedItemCache(
            userId: session.userId,
            directory: Self.applicationSupportDirectory(),
            encoder: self.encoder,
            decoder: self.decoder
        )
        self.statusDefaults = UserDefaults.standard
        self.lastSuccessfulSyncAt = statusDefaults.object(forKey: Self.lastSyncDefaultsKey(for: session.userId)) as? Date
        let pendingItems = pendingCaptureQueue.pendingSavedItems()
        self.pendingCaptureCount = pendingItems.count
        self.pendingSavedItems = pendingItems
        startMonitoringConnectivity()
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
            libraryRootItems = rootResponse.savedItems
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
            folderItems[folder.id] = response.savedItems
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
        updateFolderSummary(from: folder, to: renamed)
        libraryErrorMessage = nil
    }

    func deleteFolder(_ folder: Folder) async throws {
        try await savedItemsAPI.requestNoContent(path: "/v1/folders/\(folder.id)", method: "DELETE")
        folders.removeAll { $0.id == folder.id }
        let returningItems = (folderItems.removeValue(forKey: folder.id) ?? []).map { $0.withFolder(nil) }
        libraryRootItems.append(contentsOf: returningItems)
        savedItems = savedItems.map { item in
            item.folder?.id == folder.id ? item.withFolder(nil) : item
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
        replaceItemInLoadedCollections(updated, removingFromOtherDestinations: true)
        if let index = savedItems.firstIndex(where: { $0.id == updated.id }) {
            savedItems[index] = updated
            persistSavedItems()
        }
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

                if currentReadState(for: updated.id) == true,
                   let index = savedItems.firstIndex(where: { $0.id == updated.id }) {
                    savedItems[index] = updated
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

            if currentReadState(for: updated.id) == isRead,
               let index = savedItems.firstIndex(where: { $0.id == updated.id }) {
                savedItems[index] = updated
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
            savedItems.removeAll { $0.id == item.id }
            libraryRootItems.removeAll { $0.id == item.id }
            for key in Array(folderItems.keys) {
                folderItems[key]?.removeAll { $0.id == item.id }
            }
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
            savedItems = readStateQueue.apply(to: response.savedItems)
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

                if let savedItemIndex = savedItems.firstIndex(where: { $0.id == updated.id }) {
                    savedItems[savedItemIndex] = updated
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

        savedItems = readStateQueue.apply(to: cachedItems)
    }

    private func refreshPendingCaptureState() {
        let pendingItems = pendingCaptureQueue.pendingSavedItems()
        pendingCaptureCount = pendingItems.count
        pendingSavedItems = pendingItems
    }

    private func persistSavedItems() {
        savedItemCache.save(savedItems)
    }

    private func updateLocalReadState(for itemId: String, isRead: Bool) {
        updateReadStateInLoadedCollections(for: itemId, isRead: isRead)
        if let index = savedItems.firstIndex(where: { $0.id == itemId }),
           savedItems[index].isRead != isRead {
            savedItems[index] = savedItems[index].withReadState(isRead)
            persistSavedItems()
        }
    }

    private func currentReadState(for itemId: String) -> Bool? {
        savedItems.first(where: { $0.id == itemId })?.isRead
    }

    private func enqueuePendingCapture(url: String) {
        pendingCaptureQueue.enqueue(url: url, sourceName: Self.sourceName, captureChannel: "ios-app")
        refreshPendingCaptureState()
    }

    private func upsertCapturedSavedItem(_ savedItem: SavedItem) {
        savedItems.removeAll { $0.id == savedItem.id }
        savedItems.insert(savedItem, at: 0)
        if hasAttemptedLibraryLoad && savedItem.folder == nil {
            libraryRootItems.removeAll { $0.id == savedItem.id }
            libraryRootItems.insert(savedItem, at: 0)
        }
        persistSavedItems()
    }

    private func updateReadStateInLoadedCollections(for itemId: String, isRead: Bool) {
        if let index = libraryRootItems.firstIndex(where: { $0.id == itemId }) {
            libraryRootItems[index] = libraryRootItems[index].withReadState(isRead)
        }

        for key in Array(folderItems.keys) {
            if let index = folderItems[key]?.firstIndex(where: { $0.id == itemId }) {
                folderItems[key]?[index] = folderItems[key]?[index].withReadState(isRead) ?? folderItems[key]![index]
            }
        }
    }

    private func replaceItemInLoadedCollections(_ item: SavedItem, removingFromOtherDestinations: Bool) {
        if removingFromOtherDestinations {
            libraryRootItems.removeAll { $0.id == item.id }
            for key in Array(folderItems.keys) {
                folderItems[key]?.removeAll { $0.id == item.id }
            }
        }

        if let folderId = item.folder?.id {
            guard folderItems[folderId] != nil else { return }
            folderItems[folderId]?.insert(item, at: 0)
        } else {
            libraryRootItems.insert(item, at: 0)
        }
    }

    private func updateFolderSummary(from oldFolder: Folder, to renamed: Folder) {
        let summary = FolderSummary(id: renamed.id, name: renamed.name, emoji: renamed.emoji, color: renamed.color)
        libraryRootItems = libraryRootItems.map {
            $0.folder?.id == oldFolder.id ? $0.withFolder(summary) : $0
        }
        folderItems[oldFolder.id] = folderItems[oldFolder.id]?.map { $0.withFolder(summary) }
        savedItems = savedItems.map {
            $0.folder?.id == oldFolder.id ? $0.withFolder(summary) : $0
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
