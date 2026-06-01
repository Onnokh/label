import Foundation

/// The Sleevy REST surface: the typed reading-list verbs plus the policy that
/// maps transport-level `APIClientError`s to the store's domain errors.
///
/// `APIClient` deliberately stays policy-free — it only knows 2xx-vs-not. This
/// type owns the decisions that are specific to Sleevy's endpoints: a
/// `401/403` means the session expired, an HTML error body means a proxy/CDN is
/// unreachable, and read-state writes distinguish retriable (`429`/`5xx`) from
/// permanent failures so they can be queued for later.
///
/// Extracting it from the store lets these mappings be unit-tested with a
/// stubbed `URLSession`, without standing up the whole store.
struct SleevyAPI {
    private let api: APIClient
    private let captureClient: SleevyCaptureClient
    private let decoder: JSONDecoder
    private let token: String

    init(api: APIClient, captureClient: SleevyCaptureClient, decoder: JSONDecoder, token: String) {
        self.api = api
        self.captureClient = captureClient
        self.decoder = decoder
        self.token = token
    }

    func request<T: Decodable>(
        path: String,
        method: HTTPMethod = .get,
        queryItems: [URLQueryItem] = [],
        responseType: T.Type
    ) async throws -> T {
        do {
            return try await api.send(
                path,
                method: method,
                query: queryItems,
                token: token,
                as: T.self
            )
        } catch let APIClientError.unacceptableStatus(code, data) {
            throw mapStatusError(code: code, data: data)
        } catch APIClientError.invalidResponse {
            throw AuthError.invalidServerResponse
        }
    }

    func request<T: Decodable, Body: Encodable>(
        path: String,
        method: HTTPMethod = .get,
        queryItems: [URLQueryItem] = [],
        body: Body,
        responseType: T.Type
    ) async throws -> T {
        do {
            return try await api.send(
                path,
                method: method,
                query: queryItems,
                token: token,
                body: body,
                as: T.self
            )
        } catch let APIClientError.unacceptableStatus(code, data) {
            throw mapStatusError(code: code, data: data)
        } catch APIClientError.invalidResponse {
            throw AuthError.invalidServerResponse
        }
    }

    func requestNoContent(path: String, method: HTTPMethod) async throws {
        do {
            try await api.send(
                path,
                method: method,
                token: token
            )
        } catch let APIClientError.unacceptableStatus(code, data) {
            throw mapStatusError(code: code, data: data)
        } catch APIClientError.invalidResponse {
            throw AuthError.invalidServerResponse
        }
    }

    /// Submits a capture and returns the created saved item. Errors propagate as
    /// `SleevyCaptureError` (from `SleevyCaptureClient`) so the store's
    /// retry/auth handling can classify them.
    func capture(url: String, sourceName: String? = nil, captureChannel: String? = nil) async throws -> SavedItem {
        let data = try await captureClient.capture(url: url, token: token, sourceName: sourceName, captureChannel: captureChannel)
        return try decoder.decode(CaptureResponse.self, from: data).savedItem
    }

    /// Writes a saved item's read state. A `401/403` is mapped to
    /// `AuthError.sessionExpired`; `429`/`5xx` to `.retriable` (safe to queue);
    /// everything else to `.unretriable`.
    func setReadState(itemId: String, isRead: Bool) async throws -> SavedItem {
        do {
            return try await api.send(
                "/v1/saved-items/\(itemId)/read-state",
                method: .post,
                token: token,
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

    // MARK: - Reading list verbs

    /// The full saved-item set (the inbox), in the server's canonical order.
    func loadSavedItems() async throws -> [SavedItem] {
        try await request(path: "/v1/saved-items", responseType: SavedItemsResponse.self).savedItems
    }

    func loadFolders() async throws -> [Folder] {
        try await request(path: "/v1/folders", responseType: FoldersResponse.self).folders
    }

    func createFolder(name: String, emoji: String?, color: String?) async throws -> Folder {
        try await request(
            path: "/v1/folders",
            method: .post,
            body: FolderNameRequest(name: name, emoji: emoji, color: color),
            responseType: Folder.self
        )
    }

    func renameFolder(id: String, name: String, emoji: String?, color: String?) async throws -> Folder {
        try await request(
            path: "/v1/folders/\(id)",
            method: .patch,
            body: FolderNameRequest(name: name, emoji: emoji, color: color),
            responseType: Folder.self
        )
    }

    func deleteFolder(id: String) async throws {
        try await requestNoContent(path: "/v1/folders/\(id)", method: .delete)
    }

    func moveItem(id: String, toFolder folderId: String?) async throws -> SavedItem {
        try await request(
            path: "/v1/saved-items/\(id)/folder",
            method: .put,
            body: FolderAssignmentRequest(folderId: folderId),
            responseType: SavedItem.self
        )
    }

    /// Records that the item was opened, returning it with read state applied.
    func markOpened(id: String) async throws -> SavedItem {
        try await request(path: "/v1/saved-items/\(id)/open", method: .post, responseType: SavedItem.self)
    }

    func deleteItem(id: String) async throws {
        try await requestNoContent(path: "/v1/saved-items/\(id)", method: .delete)
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

/// A non-auth, non-decodable failure (e.g. an HTML proxy error page) signalling
/// the API is unreachable. The store reads this to flip `isAPIReachable`.
enum APIError: Error {
    case unreachable
}
