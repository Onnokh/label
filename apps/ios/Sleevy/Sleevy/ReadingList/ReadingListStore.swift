import Combine
import Foundation
import Network
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
    private let api: APIClient
    private let captureClient: SleevyCaptureClient
    private let pendingCaptureStore: SleevyPendingCaptureStore
    private let cacheURL: URL
    private let statusDefaults: UserDefaults
    private let pathMonitor = NWPathMonitor()
    private let pathMonitorQueue = DispatchQueue(label: "app.sleevy.ReadingListStore.pathMonitor")
    private var hasAttemptedInitialLoad = false
    private var hasAttemptedLibraryLoad = false
    private var isSyncingPendingReadStateUpdates = false
    private static var sourceName: String {
        SleevyUserPreferences.sourceName
    }

    init(session: AppSession) {
        self.session = session
        self.decoder = JSONDecoder()
        self.decoder.dateDecodingStrategy = .sleevyISO8601
        self.encoder = JSONEncoder()
        self.encoder.dateEncodingStrategy = .iso8601
        self.api = APIClient(
            baseURL: AppConfig.apiBaseURL,
            origin: AppConfig.apiOrigin,
            session: AppConfig.apiSession,
            encoder: self.encoder,
            decoder: self.decoder
        )
        self.captureClient = SleevyCaptureClient(
            apiBaseURL: AppConfig.apiBaseURL,
            apiOrigin: AppConfig.apiOrigin,
            urlSession: AppConfig.apiSession,
            encoder: self.encoder,
            decoder: self.decoder
        )
        self.pendingCaptureStore = SleevyPendingCaptureStore(
            appGroupIdentifier: AppConfig.appGroupIdentifier
        )
        self.cacheURL = Self.makeCacheURL(for: session.userId)
        self.statusDefaults = UserDefaults.standard
        self.lastSuccessfulSyncAt = statusDefaults.object(forKey: Self.lastSyncDefaultsKey(for: session.userId)) as? Date
        let pendingCaptures = pendingCaptureStore.load(for: session.userId)
        self.pendingCaptureCount = pendingCaptures.count
        self.pendingSavedItems = pendingCaptures.map(PendingSavedItem.init)
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
            let foldersResponse = try await request(path: "/v1/folders", responseType: FoldersResponse.self)
            let rootResponse = try await request(
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
            let response = try await request(
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
        let folder = try await request(
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
        let renamed = try await request(
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
        try await requestNoContent(path: "/v1/folders/\(folder.id)", method: "DELETE")
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
        let updated = try await request(
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
        pendingCaptureStore.remove(id: item.id, for: session.userId)
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
            let savedItem = try await submitCapture(url: url, sourceName: Self.sourceName, captureChannel: "ios-app")
            upsertCapturedSavedItem(savedItem)
            isAPIReachable = true
            errorMessage = nil
            return .saved(savedItem)
        } catch {
            if shouldRetryPendingCapture(after: error) {
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
            enqueuePendingReadStateUpdate(itemId: item.id, isRead: true)
            errorMessage = nil
            return
        }

        Task { @MainActor [weak self] in
            guard let self else { return }

            do {
                let updated = try await request(
                    path: "/v1/saved-items/\(item.id)/open",
                    method: "POST",
                    responseType: SavedItem.self
                )

                let queuedState = pendingReadStateOverride(for: updated.id)
                if queuedState == nil || queuedState == true {
                    removePendingReadStateUpdate(for: updated.id)
                }

                if currentReadState(for: updated.id) == true,
                   let index = savedItems.firstIndex(where: { $0.id == updated.id }) {
                    savedItems[index] = updated
                    persistSavedItems()
                }

                errorMessage = nil
            } catch {
                if shouldRetryPendingReadStateUpdate(after: error) {
                    enqueuePendingReadStateUpdate(itemId: item.id, isRead: true)
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
            enqueuePendingReadStateUpdate(itemId: item.id, isRead: isRead)
            errorMessage = nil
            return
        }

        do {
            let updated = try await submitReadStateUpdate(itemId: item.id, isRead: isRead)
            let queuedState = pendingReadStateOverride(for: updated.id)
            if queuedState == nil || queuedState == isRead {
                removePendingReadStateUpdate(for: updated.id)
            }

            if currentReadState(for: updated.id) == isRead,
               let index = savedItems.firstIndex(where: { $0.id == updated.id }) {
                savedItems[index] = updated
                persistSavedItems()
            }

            errorMessage = nil
        } catch {
            if shouldRetryPendingReadStateUpdate(after: error) {
                enqueuePendingReadStateUpdate(itemId: item.id, isRead: isRead)
                errorMessage = nil
            } else {
                handleRequestError(error)
            }
        }
    }

    func delete(_ item: SavedItem) async {
        do {
            try await requestNoContent(path: "/v1/saved-items/\(item.id)", method: "DELETE")
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
            let response = try await request(
                path: "/v1/saved-items",
                responseType: SavedItemsResponse.self
            )
            savedItems = applyPendingReadStateOverrides(to: response.savedItems)
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

    private func request<T: Decodable>(
        path: String,
        method: String = "GET",
        queryItems: [URLQueryItem] = [],
        responseType: T.Type
    ) async throws -> T {
        do {
            return try await api.send(
                path,
                method: HTTPMethod(rawValue: method) ?? .get,
                query: queryItems,
                token: session.token,
                as: T.self
            )
        } catch let APIClientError.unacceptableStatus(code, data) {
            throw mapStatusError(code: code, data: data)
        } catch APIClientError.invalidResponse {
            throw AuthError.invalidServerResponse
        }
    }

    private func request<T: Decodable, Body: Encodable>(
        path: String,
        method: String = "GET",
        queryItems: [URLQueryItem] = [],
        body: Body,
        responseType: T.Type
    ) async throws -> T {
        do {
            return try await api.send(
                path,
                method: HTTPMethod(rawValue: method) ?? .get,
                query: queryItems,
                token: session.token,
                body: body,
                as: T.self
            )
        } catch let APIClientError.unacceptableStatus(code, data) {
            throw mapStatusError(code: code, data: data)
        } catch APIClientError.invalidResponse {
            throw AuthError.invalidServerResponse
        }
    }

    private func requestNoContent(path: String, method: String) async throws {
        do {
            try await api.send(
                path,
                method: HTTPMethod(rawValue: method) ?? .get,
                token: session.token
            )
        } catch let APIClientError.unacceptableStatus(code, data) {
            throw mapStatusError(code: code, data: data)
        } catch APIClientError.invalidResponse {
            throw AuthError.invalidServerResponse
        }
    }

    private func mapStatusError(code: Int, data: Data) -> Error {
        if code == 401 || code == 403 {
            return AuthError.sessionExpired
        }

        return messageError(data: data, fallback: "Request failed with status \(code).")
    }

    private func messageError(data: Data, fallback: String) -> Error {
        guard
            let body = String(data: data, encoding: .utf8)?
                .trimmingCharacters(in: .whitespacesAndNewlines),
            !body.isEmpty
        else {
            return AuthError.authenticationFailed(fallback)
        }

        // HTML response means a proxy/CDN error page, not an auth failure
        if body.hasPrefix("<") {
            return APIError.unreachable
        }

        return AuthError.authenticationFailed(body)
    }

    private func startMonitoringConnectivity() {
        pathMonitor.pathUpdateHandler = { [weak self] path in
            let satisfied = path.status == .satisfied
            Task { @MainActor in
                guard let self else { return }
                self.isOnline = satisfied
                guard satisfied else { return }

                self.refreshPendingCaptureState()
                let hasPendingReadStateUpdates = self.hasPendingReadStateUpdates()
                let hasPendingCaptures = self.pendingCaptureCount > 0
                guard hasPendingCaptures || hasPendingReadStateUpdates else { return }

                if hasPendingCaptures {
                    await self.syncPendingCapturesIfNeeded()
                }
                await self.syncPendingReadStateUpdatesIfNeeded()

                guard !self.isLoading, !self.isRefreshing else { return }
                await self.performLoad()
            }
        }

        pathMonitor.start(queue: pathMonitorQueue)
    }

    private func syncPendingCapturesIfNeeded() async {
        refreshPendingCaptureState()

        guard pendingCaptureCount > 0, !isSyncingPendingCaptures else { return }

        isSyncingPendingCaptures = true
        defer {
            isSyncingPendingCaptures = false
            refreshPendingCaptureState()
        }

        let pendingCaptures = pendingCaptureStore.load(for: session.userId)
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

                if shouldRetryPendingCapture(after: error) {
                    remainingCaptures.append(contentsOf: pendingCaptures[index...])
                    retriableError = error
                    break
                }
            }
        }

        try? pendingCaptureStore.persist(remainingCaptures, for: session.userId)

        if retriableError != nil {
            errorMessage = nil
        } else if remainingCaptures.isEmpty {
            errorMessage = nil
        }
    }

    private func syncPendingReadStateUpdatesIfNeeded() async {
        guard !isSyncingPendingReadStateUpdates else { return }

        let pendingReadStateUpdates = Self.loadPendingReadStateUpdates(for: session.userId)
        guard !pendingReadStateUpdates.isEmpty else { return }

        isSyncingPendingReadStateUpdates = true
        defer { isSyncingPendingReadStateUpdates = false }

        var remainingUpdates: [PendingReadStateUpdate] = []
        var didUpdateSavedItems = false

        for (index, pendingUpdate) in pendingReadStateUpdates.enumerated() {
            do {
                let updated = try await submitReadStateUpdate(
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

                if shouldRetryPendingReadStateUpdate(after: error) {
                    remainingUpdates.append(contentsOf: pendingReadStateUpdates[index...])
                    break
                }
            }
        }

        Self.persistPendingReadStateUpdates(remainingUpdates, for: session.userId)

        if didUpdateSavedItems {
            persistSavedItems()
        }

        errorMessage = nil
    }

    private func submitPendingCapture(url: String, sourceName: String?, captureChannel: String?) async throws {
        _ = try await submitCapture(url: url, sourceName: sourceName, captureChannel: captureChannel)
    }

    private func submitCapture(url: String, sourceName: String? = nil, captureChannel: String? = nil) async throws -> SavedItem {
        let data = try await captureClient.capture(url: url, token: session.token, sourceName: sourceName, captureChannel: captureChannel)
        return try decoder.decode(CaptureResponse.self, from: data).savedItem
    }

    private func submitReadStateUpdate(itemId: String, isRead: Bool) async throws -> SavedItem {
        do {
            return try await api.send(
                "/v1/saved-items/\(itemId)/read-state",
                method: .post,
                token: session.token,
                body: ReadStateUpdateRequest(isRead: isRead),
                as: SavedItem.self
            )
        } catch let APIClientError.unacceptableStatus(code, data) {
            if code == 401 || code == 403 {
                throw AuthError.sessionExpired
            }

            let message = serverMessage(data) ?? "Sleevy could not update this saved item right now."

            if code == 429 || (500 ..< 600).contains(code) {
                throw PendingReadStateSyncError.retriable(message)
            }

            throw PendingReadStateSyncError.unretriable(message)
        } catch APIClientError.invalidResponse {
            throw AuthError.invalidServerResponse
        }
    }

    private func shouldRetryPendingCapture(after error: Error) -> Bool {
        if error is URLError {
            return true
        }

        if let captureError = error as? SleevyCaptureError {
            switch captureError {
            case .temporarilyUnavailable:
                return true
            case .sessionExpired:
                return false
            case .invalidServerResponse:
                return true
            case .failed:
                return false
            }
        }

        if let authError = error as? AuthError {
            switch authError {
            case .sessionExpired:
                return false
            default:
                break
            }
        }

        return false
    }

    private func shouldRetryPendingReadStateUpdate(after error: Error) -> Bool {
        if error is URLError {
            return true
        }

        if let authError = error as? AuthError {
            switch authError {
            case .sessionExpired:
                return false
            default:
                break
            }
        }

        if let syncError = error as? PendingReadStateSyncError {
            switch syncError {
            case .retriable:
                return true
            case .unretriable:
                return false
            }
        }

        return false
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

    private func serverMessage(_ data: Data) -> String? {
        guard
            let payload = try? decoder.decode(ServerErrorResponse.self, from: data),
            let message = payload.message,
            !message.isEmpty
        else {
            return nil
        }

        return message
    }

    private func restoreCachedItems() {
        guard
            let data = try? Data(contentsOf: cacheURL),
            let cachedItems = try? decoder.decode([SavedItem].self, from: data)
        else {
            return
        }

        savedItems = applyPendingReadStateOverrides(to: cachedItems)
    }

    private func refreshPendingCaptureState() {
        let pendingCaptures = pendingCaptureStore.load(for: session.userId)
        pendingCaptureCount = pendingCaptures.count
        pendingSavedItems = pendingCaptures.map(PendingSavedItem.init)
    }

    private func persistSavedItems() {
        let directoryURL = cacheURL.deletingLastPathComponent()

        do {
            try FileManager.default.createDirectory(
                at: directoryURL,
                withIntermediateDirectories: true
            )

            let data = try encoder.encode(savedItems)
            try data.write(to: cacheURL, options: .atomic)
        } catch {
            // Cache writes are best-effort so network-backed usage still works.
        }
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

    private func pendingReadStateOverride(for itemId: String) -> Bool? {
        Self.loadPendingReadStateUpdates(for: session.userId)
            .first(where: { $0.itemId == itemId })?
            .isRead
    }

    private func hasPendingReadStateUpdates() -> Bool {
        !Self.loadPendingReadStateUpdates(for: session.userId).isEmpty
    }

    private func enqueuePendingCapture(url: String) {
        try? pendingCaptureStore.enqueue(url: url, for: session.userId, sourceName: Self.sourceName, captureChannel: "ios-app")
        refreshPendingCaptureState()
    }

    private func enqueuePendingReadStateUpdate(itemId: String, isRead: Bool) {
        var pendingUpdates = Self.loadPendingReadStateUpdates(for: session.userId)
        pendingUpdates.removeAll { $0.itemId == itemId }
        pendingUpdates.append(
            PendingReadStateUpdate(
                itemId: itemId,
                isRead: isRead,
                queuedAt: Date()
            )
        )
        Self.persistPendingReadStateUpdates(pendingUpdates, for: session.userId)
    }

    private func removePendingReadStateUpdate(for itemId: String) {
        let pendingUpdates = Self.loadPendingReadStateUpdates(for: session.userId)
        let updatedPendingUpdates = pendingUpdates.filter { $0.itemId != itemId }
        Self.persistPendingReadStateUpdates(updatedPendingUpdates, for: session.userId)
    }

    private func applyPendingReadStateOverrides(to items: [SavedItem]) -> [SavedItem] {
        let pendingStates = Dictionary(
            uniqueKeysWithValues: Self.loadPendingReadStateUpdates(for: session.userId)
                .map { ($0.itemId, $0.isRead) }
        )

        return items.map { item in
            guard let pendingIsRead = pendingStates[item.id], item.isRead != pendingIsRead else {
                return item
            }

            return item.withReadState(pendingIsRead)
        }
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

    private static func makeCacheURL(for userId: String) -> URL {
        let applicationSupportURL = try! FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )

        return applicationSupportURL
            .appendingPathComponent("ReadingListCache", isDirectory: true)
            .appendingPathComponent("\(userId).json", isDirectory: false)
    }

    private static func pendingReadStateUpdatesURL(for userId: String) -> URL? {
        FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: AppConfig.appGroupIdentifier)?
            .appendingPathComponent("PendingReadStateUpdates", isDirectory: true)
            .appendingPathComponent("\(userId).json", isDirectory: false)
    }

    private static func loadPendingReadStateUpdates(for userId: String) -> [PendingReadStateUpdate] {
        guard
            let queueURL = pendingReadStateUpdatesURL(for: userId),
            let data = try? Data(contentsOf: queueURL),
            let pendingReadStateUpdates = try? JSONDecoder.sharedISO8601.decode([PendingReadStateUpdate].self, from: data)
        else {
            return []
        }

        return pendingReadStateUpdates
    }

    private static func persistPendingReadStateUpdates(_ pendingReadStateUpdates: [PendingReadStateUpdate], for userId: String) {
        guard let queueURL = pendingReadStateUpdatesURL(for: userId) else { return }

        do {
            try FileManager.default.createDirectory(
                at: queueURL.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )

            if pendingReadStateUpdates.isEmpty {
                try? FileManager.default.removeItem(at: queueURL)
                return
            }

            let data = try JSONEncoder.sharedISO8601.encode(pendingReadStateUpdates)
            try data.write(to: queueURL, options: .atomic)
        } catch {
            // Queue persistence is best-effort and should not break the main reading flow.
        }
    }

    private static func lastSyncDefaultsKey(for userId: String) -> String {
        "reading-list-last-sync.\(userId)"
    }

    deinit {
        pathMonitor.cancel()
    }
}

private struct ReadStateUpdateRequest: Encodable {
    let isRead: Bool
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

private struct CaptureResponse: Decodable {
    let savedItem: SavedItem
    let captureResult: String
}

private struct ServerErrorResponse: Decodable {
    let message: String?
}

private struct PendingReadStateUpdate: Codable, Equatable {
    let itemId: String
    let isRead: Bool
    let queuedAt: Date
}

struct PendingSavedItem: Identifiable, Equatable {
    let id: UUID
    let url: URL?
    let rawURL: String
    let host: String
    let title: String
    let queuedAt: Date

    fileprivate init(pendingCapture: SleevyPendingCapture) {
        let resolvedURL = URL(string: pendingCapture.url)
        let sanitizedHost = resolvedURL?.host?
            .replacingOccurrences(of: #"^www\."#, with: "", options: .regularExpression)
        let trimmedURL = pendingCapture.url.trimmingCharacters(in: .whitespacesAndNewlines)
        let lastPathComponent = resolvedURL?.lastPathComponent.trimmingCharacters(in: .whitespacesAndNewlines)
        let preferredTitle: String

        if let lastPathComponent, !lastPathComponent.isEmpty, lastPathComponent != "/" {
            preferredTitle = lastPathComponent
        } else if let sanitizedHost, !sanitizedHost.isEmpty {
            preferredTitle = sanitizedHost
        } else {
            preferredTitle = trimmedURL
        }

        self.id = pendingCapture.id
        self.url = resolvedURL
        self.rawURL = pendingCapture.url
        self.host = (sanitizedHost?.isEmpty == false ? sanitizedHost : nil) ?? trimmedURL
        self.title = preferredTitle
        self.queuedAt = pendingCapture.queuedAt
    }
}

enum CaptureSubmissionOutcome: Equatable {
    case saved(SavedItem)
    case queued
}

private enum APIError: Error {
    case unreachable
}

private enum PendingReadStateSyncError: LocalizedError {
    case retriable(String)
    case unretriable(String)

    var errorDescription: String? {
        switch self {
        case .retriable(let message), .unretriable(let message):
            return message
        }
    }
}
