import Combine
import Foundation
import Network
import UIKit

@MainActor
final class ReadingListStore: ObservableObject {
    @Published private(set) var savedItems: [SavedItem] = []
    @Published private(set) var pendingSavedItems: [PendingSavedItem] = []
    @Published private(set) var isLoading = false
    @Published private(set) var isRefreshing = false
    @Published private(set) var lastSuccessfulSyncAt: Date?
    @Published private(set) var pendingCaptureCount = 0
    @Published private(set) var isSyncingPendingCaptures = false
    @Published var errorMessage: String?

    private let session: AppSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder
    private let cacheURL: URL
    private let statusDefaults: UserDefaults
    private let pathMonitor = NWPathMonitor()
    private let pathMonitorQueue = DispatchQueue(label: "plowplow.Label.ReadingListStore.pathMonitor")

    init(session: AppSession) {
        self.session = session
        self.decoder = JSONDecoder()
        self.decoder.dateDecodingStrategy = .iso8601
        self.encoder = JSONEncoder()
        self.encoder.dateEncodingStrategy = .iso8601
        self.cacheURL = Self.makeCacheURL(for: session.userId)
        self.statusDefaults = UserDefaults.standard
        self.lastSuccessfulSyncAt = statusDefaults.object(forKey: Self.lastSyncDefaultsKey(for: session.userId)) as? Date
        let pendingCaptures = Self.loadPendingCaptures(for: session.userId)
        self.pendingCaptureCount = pendingCaptures.count
        self.pendingSavedItems = pendingCaptures.map(PendingSavedItem.init)
        startMonitoringConnectivity()
    }

    func loadIfNeeded() async {
        guard savedItems.isEmpty, !isLoading else { return }
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
        await performLoad()
    }

    func load() async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        refreshPendingCaptureState()
        await syncPendingCapturesIfNeeded()
        await performLoad()
    }

    func removePendingSavedItem(_ item: PendingSavedItem) {
        let pendingCaptures = Self.loadPendingCaptures(for: session.userId)
        let updatedCaptures = pendingCaptures.filter { $0.id != item.id }
        Self.persistPendingCaptures(updatedCaptures, for: session.userId)
        refreshPendingCaptureState()
    }

    func markOpened(_ item: SavedItem) async {
        guard let url = URL(string: item.originalURL) else { return }

        do {
            let updated = try await request(
                path: "/v1/saved-items/\(item.id)/open",
                method: "POST",
                responseType: SavedItem.self
            )

            if let index = savedItems.firstIndex(where: { $0.id == updated.id }) {
                savedItems[index] = updated
                persistSavedItems()
            }

            await MainActor.run {
                UIApplication.shared.open(url)
            }
        } catch {
            errorMessage = AppConfig.userFacingNetworkMessage(for: error) ?? error.localizedDescription
        }
    }

    func setRead(_ item: SavedItem, isRead: Bool) async {
        do {
            let updated = try await request(
                path: "/v1/saved-items/\(item.id)/read",
                method: "POST",
                body: ReadStateUpdateRequest(isRead: isRead),
                responseType: SavedItem.self
            )

            if let index = savedItems.firstIndex(where: { $0.id == updated.id }) {
                savedItems[index] = updated
            }

            persistSavedItems()
            errorMessage = nil
        } catch {
            errorMessage = AppConfig.userFacingNetworkMessage(for: error) ?? error.localizedDescription
        }
    }

    func delete(_ item: SavedItem) async {
        do {
            try await requestNoContent(path: "/v1/saved-items/\(item.id)", method: "DELETE")
            savedItems.removeAll { $0.id == item.id }
            persistSavedItems()
        } catch {
            errorMessage = AppConfig.userFacingNetworkMessage(for: error) ?? error.localizedDescription
        }
    }

    private func performLoad() async {
        do {
            let response = try await request(
                path: "/v1/saved-items",
                responseType: SavedItemsResponse.self
            )
            savedItems = response.savedItems
            persistSavedItems()
            lastSuccessfulSyncAt = Date()
            statusDefaults.set(lastSuccessfulSyncAt, forKey: Self.lastSyncDefaultsKey(for: session.userId))
            errorMessage = nil
        } catch {
            errorMessage = AppConfig.userFacingNetworkMessage(for: error) ?? error.localizedDescription
        }
    }

    private func request<T: Decodable>(
        path: String,
        method: String = "GET",
        responseType: T.Type
    ) async throws -> T {
        try await request(
            path: path,
            method: method,
            body: Optional<ReadStateUpdateRequest>.none,
            responseType: responseType
        )
    }

    private func request<T: Decodable, Body: Encodable>(
        path: String,
        method: String = "GET",
        body: Body?,
        responseType: T.Type
    ) async throws -> T {
        var request = URLRequest(url: AppConfig.endpoint(path))
        request.httpMethod = method
        request.setValue("Bearer \(session.token)", forHTTPHeaderField: "Authorization")
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try encoder.encode(body)
        }

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw AuthError.invalidServerResponse
        }

        guard (200 ..< 300).contains(httpResponse.statusCode) else {
            throw messageError(data: data, fallback: "Request failed with status \(httpResponse.statusCode).")
        }

        return try decoder.decode(responseType, from: data)
    }

    private func requestNoContent(path: String, method: String) async throws {
        var request = URLRequest(url: AppConfig.endpoint(path))
        request.httpMethod = method
        request.setValue("Bearer \(session.token)", forHTTPHeaderField: "Authorization")

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw AuthError.invalidServerResponse
        }

        guard (200 ..< 300).contains(httpResponse.statusCode) else {
            throw messageError(data: data, fallback: "Request failed with status \(httpResponse.statusCode).")
        }
    }

    private func messageError(data: Data, fallback: String) -> Error {
        if
            let body = String(data: data, encoding: .utf8)?
                .trimmingCharacters(in: .whitespacesAndNewlines),
            !body.isEmpty
        {
            return AuthError.authenticationFailed(body)
        }

        return AuthError.authenticationFailed(fallback)
    }

    private func startMonitoringConnectivity() {
        pathMonitor.pathUpdateHandler = { [weak self] path in
            guard path.status == .satisfied else { return }

            Task { @MainActor in
                guard let self else { return }

                self.refreshPendingCaptureState()
                guard self.pendingCaptureCount > 0 else { return }

                await self.syncPendingCapturesIfNeeded()

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

        let pendingCaptures = Self.loadPendingCaptures(for: session.userId)
        guard !pendingCaptures.isEmpty else { return }

        var remainingCaptures: [PendingCapture] = []
        var retriableError: Error?

        for (index, pendingCapture) in pendingCaptures.enumerated() {
            do {
                try await submitPendingCapture(url: pendingCapture.url)
            } catch {
                if shouldRetryPendingCapture(after: error) {
                    remainingCaptures.append(contentsOf: pendingCaptures[index...])
                    retriableError = error
                    break
                }
            }
        }

        Self.persistPendingCaptures(remainingCaptures, for: session.userId)

        if let retriableError {
            errorMessage = AppConfig.userFacingNetworkMessage(for: retriableError) ?? retriableError.localizedDescription
        } else if remainingCaptures.isEmpty {
            errorMessage = nil
        }
    }

    private func submitPendingCapture(url: String) async throws {
        var request = URLRequest(url: AppConfig.endpoint("/v1/captures"))
        request.httpMethod = "POST"
        request.httpShouldHandleCookies = false
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(session.token)", forHTTPHeaderField: "Authorization")
        request.setValue(AppConfig.apiOrigin, forHTTPHeaderField: "Origin")
        request.httpBody = try encoder.encode(CaptureRequest(url: url))

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw AuthError.invalidServerResponse
        }

        if httpResponse.statusCode == 401 || httpResponse.statusCode == 403 {
            throw AuthError.sessionExpired
        }

        guard (200 ..< 300).contains(httpResponse.statusCode) else {
            let message = serverMessage(data) ?? "Label could not sync this saved link right now."

            if httpResponse.statusCode == 429 || (500 ..< 600).contains(httpResponse.statusCode) {
                throw PendingCaptureSyncError.retriable(message)
            }

            throw PendingCaptureSyncError.unretriable(message)
        }
    }

    private func shouldRetryPendingCapture(after error: Error) -> Bool {
        if error is URLError {
            return true
        }

        if let authError = error as? AuthError {
            switch authError {
            case .sessionExpired:
                return true
            default:
                break
            }
        }

        if let syncError = error as? PendingCaptureSyncError {
            switch syncError {
            case .retriable:
                return true
            case .unretriable:
                return false
            }
        }

        return false
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

        savedItems = cachedItems
    }

    private func refreshPendingCaptureState() {
        let pendingCaptures = Self.loadPendingCaptures(for: session.userId)
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

    private static func pendingCapturesURL(for userId: String) -> URL? {
        FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: AppConfig.appGroupIdentifier)?
            .appendingPathComponent("PendingCaptures", isDirectory: true)
            .appendingPathComponent("\(userId).json", isDirectory: false)
    }

    private static func loadPendingCaptures(for userId: String) -> [PendingCapture] {
        guard
            let queueURL = pendingCapturesURL(for: userId),
            let data = try? Data(contentsOf: queueURL),
            let pendingCaptures = try? JSONDecoder.sharedISO8601.decode([PendingCapture].self, from: data)
        else {
            return []
        }

        return pendingCaptures
    }

    private static func persistPendingCaptures(_ pendingCaptures: [PendingCapture], for userId: String) {
        guard let queueURL = pendingCapturesURL(for: userId) else { return }

        do {
            try FileManager.default.createDirectory(
                at: queueURL.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )

            if pendingCaptures.isEmpty {
                try? FileManager.default.removeItem(at: queueURL)
                return
            }

            let data = try JSONEncoder.sharedISO8601.encode(pendingCaptures)
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

private struct CaptureRequest: Encodable {
    let url: String
}

private struct ServerErrorResponse: Decodable {
    let message: String?
}

private struct PendingCapture: Codable, Equatable {
    let id: UUID
    let url: String
    let queuedAt: Date
}

struct PendingSavedItem: Identifiable, Equatable {
    let id: UUID
    let url: URL?
    let rawURL: String
    let host: String
    let title: String
    let queuedAt: Date

    fileprivate init(pendingCapture: PendingCapture) {
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

private enum PendingCaptureSyncError: LocalizedError {
    case retriable(String)
    case unretriable(String)

    var errorDescription: String? {
        switch self {
        case .retriable(let message), .unretriable(let message):
            return message
        }
    }
}

private extension JSONDecoder {
    static let sharedISO8601: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()
}

private extension JSONEncoder {
    static let sharedISO8601: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()
}
