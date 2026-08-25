import Foundation
import Testing
@testable import Sleevy

/// Drives `SleevyAPIClient` against a stubbed `URLSession` to lock in the
/// status-code → domain-error policy. Serialized because the stub routes
/// requests through a process-wide `URLProtocol` handler.
@MainActor
@Suite(.serialized)
struct SleevyAPIClientTests {

    // MARK: - Success

    @Test func decodesSuccessfulResponse() async throws {
        let api = makeAPI(status: 200, body: Data(#"{"savedItems":[]}"#.utf8))

        let response = try await api.request(path: "/v1/saved-items", responseType: SavedItemsResponse.self)

        #expect(response.savedItems.isEmpty)
    }

    @Test func savedItemFetchRequestsMapToFolderSelectors() async throws {
        let api = makeAPI(status: 200, body: Data(#"{"savedItems":[]}"#.utf8))
        let adapter = HTTPReadingListAdapter(api: api)

        for (request, selector) in [
            (SavedItemFetchRequest.completeLibrary, nil),
            (.libraryRoot, "none"),
            (.folder("work"), "work"),
        ] {
            _ = try await adapter.loadSavedItems(request)

            let query = URLComponents(url: try #require(StubURLProtocol.lastRequest?.url), resolvingAgainstBaseURL: false)
            #expect(query?.queryItems?.first(where: { $0.name == "folder" })?.value == selector)
        }
    }

    @Test func malformedSuccessfulResponseThrowsDecodingError() async {
        let api = makeAPI(status: 200, body: Data(#"{"savedItems":"wrong shape"}"#.utf8))

        let error = await errorThrown {
            _ = try await api.request(path: "/v1/saved-items", responseType: SavedItemsResponse.self)
        }

        #expect(error is DecodingError)
    }

    // MARK: - Token rotation

    @Test func rotatesBearerTokenFromResponseHeader() async throws {
        let store = SessionTokenStore(initial: "stale-token")
        let api = makeAPI(
            status: 200,
            body: Data(#"{"savedItems":[]}"#.utf8),
            headers: ["set-auth-token": "fresh-token"],
            tokenStore: store
        )

        _ = try await api.request(path: "/v1/saved-items", responseType: SavedItemsResponse.self)

        #expect(store.current == "fresh-token")
    }

    @Test func leavesTokenUntouchedWhenNoRotationHeader() async throws {
        let store = SessionTokenStore(initial: "stable-token")
        let api = makeAPI(status: 200, body: Data(#"{"savedItems":[]}"#.utf8), tokenStore: store)

        _ = try await api.request(path: "/v1/saved-items", responseType: SavedItemsResponse.self)

        #expect(store.current == "stable-token")
    }

    // MARK: - request(...) error mapping

    @Test func unauthorizedMapsToSessionExpired() async {
        let api = makeAPI(status: 401, body: Data())

        let error = await errorThrown {
            _ = try await api.request(path: "/v1/saved-items", responseType: SavedItemsResponse.self)
        }

        #expect(isSessionExpired(error))
    }

    @Test func forbiddenMapsToSessionExpired() async {
        let api = makeAPI(status: 403, body: Data())

        let error = await errorThrown {
            _ = try await api.request(path: "/v1/saved-items", responseType: SavedItemsResponse.self)
        }

        #expect(isSessionExpired(error))
    }

    @Test func htmlErrorBodyMapsToUnreachable() async {
        let api = makeAPI(status: 502, body: Data("<html><body>Bad Gateway</body></html>".utf8))

        let error = await errorThrown {
            _ = try await api.request(path: "/v1/saved-items", responseType: SavedItemsResponse.self)
        }

        #expect(error is APIError)
    }

    @Test func serverErrorOnGenericRequestIsRetriable() async {
        let api = makeAPI(status: 503, body: Data(#"{"message":"down for maintenance"}"#.utf8))

        let error = await errorThrown {
            _ = try await api.request(path: "/v1/folders", method: .post, body: ["name": "Reads"], responseType: Folder.self)
        }

        guard case PendingReadStateSyncError.retriable(let message)? = error else {
            Issue.record("expected retriable, got \(String(describing: error))")
            return
        }
        #expect(message == "down for maintenance")
    }

    @Test func tooManyRequestsOnGenericRequestIsRetriable() async {
        let api = makeAPI(status: 429, body: Data())

        let error = await errorThrown {
            _ = try await api.request(path: "/v1/saved-items", responseType: SavedItemsResponse.self)
        }

        guard case PendingReadStateSyncError.retriable? = error else {
            Issue.record("expected retriable, got \(String(describing: error))")
            return
        }
    }

    @Test func plainTextClientErrorMapsToAuthenticationFailed() async {
        let api = makeAPI(status: 400, body: Data("Bad request".utf8))

        let error = await errorThrown {
            _ = try await api.request(path: "/v1/saved-items", responseType: SavedItemsResponse.self)
        }

        guard case AuthError.authenticationFailed(let message)? = error else {
            Issue.record("expected authenticationFailed, got \(String(describing: error))")
            return
        }
        #expect(message == "Bad request")
    }

    // MARK: - setReadState(...) error mapping

    @Test func setReadStateUnauthorizedMapsToSessionExpired() async {
        let api = makeAPI(status: 401, body: Data())

        let error = await errorThrown { _ = try await api.setReadState(itemId: "x", isRead: true) }

        #expect(isSessionExpired(error))
    }

    @Test func setReadStateTooManyRequestsIsRetriable() async {
        let api = makeAPI(status: 429, body: Data(#"{"message":"slow down"}"#.utf8))

        let error = await errorThrown { _ = try await api.setReadState(itemId: "x", isRead: true) }

        guard case PendingReadStateSyncError.retriable(let message)? = error else {
            Issue.record("expected retriable, got \(String(describing: error))")
            return
        }
        #expect(message == "slow down")
    }

    @Test func setReadStateServerErrorIsRetriable() async {
        let api = makeAPI(status: 503, body: Data())

        let error = await errorThrown { _ = try await api.setReadState(itemId: "x", isRead: true) }

        guard case PendingReadStateSyncError.retriable? = error else {
            Issue.record("expected retriable, got \(String(describing: error))")
            return
        }
    }

    @Test func setReadStateClientErrorIsPermanent() async {
        let api = makeAPI(status: 400, body: Data("rejected".utf8))

        let error = await errorThrown { _ = try await api.setReadState(itemId: "x", isRead: true) }

        // A 4xx is a permanent rejection. After unifying classification, read-state
        // writes share the generic mapping, so this surfaces as `authenticationFailed`
        // (→ `.permanent`) rather than the old `PendingReadStateSyncError.unretriable`.
        guard case AuthError.authenticationFailed? = error else {
            Issue.record("expected authenticationFailed, got \(String(describing: error))")
            return
        }
    }

    // MARK: - Folder publishing

    @Test func setFolderPublishedPatchesThePublishFlagAlone() async throws {
        let api = makeAPI(
            status: 200,
            body: Data(#"{"id":"f1","name":"Reading","emoji":null,"color":null,"isPublished":true}"#.utf8)
        )

        let folder = try await api.setFolderPublished(id: "f1", isPublished: true)

        let request = try #require(StubURLProtocol.lastRequest)
        #expect(request.httpMethod == "PATCH")
        #expect(request.url?.path == "/v1/folders/f1")
        // A full folder payload here would overwrite emoji/color with nil.
        let payload = try #require(lastRequestJSON())
        #expect(payload as? [String: Bool] == ["isPublished": true])
        #expect(folder.isPublished)
    }

    @Test func folderWithoutPublishFlagDecodesAsUnpublished() async throws {
        let api = makeAPI(
            status: 200,
            body: Data(#"{"folders":[{"id":"f1","name":"Reading","emoji":null,"color":null}]}"#.utf8)
        )

        let folders = try await api.loadFolders()

        #expect(folders.first?.isPublished == false)
    }

    // MARK: - Profile verbs

    @Test func loadProfileDecodesTheProfileRecord() async throws {
        let api = makeAPI(
            status: 200,
            body: Data(#"{"handle":"onno","visibility":"private","createdAt":"2026-08-01T10:00:00.000Z","updatedAt":"2026-08-01T10:00:00.000Z"}"#.utf8)
        )

        let profile = try await api.loadProfile()

        #expect(profile == Profile(handle: "onno", visibility: .private))
    }

    @Test func loadProfileMapsNotFoundToNoProfile() async throws {
        let api = makeAPI(
            status: 404,
            body: Data(#"{"_tag":"ProfileNotFoundError","message":"Claim a Handle before reading or changing your Public Profile."}"#.utf8)
        )

        let profile = try await api.loadProfile()

        #expect(profile == nil)
    }

    @Test func claimHandleConflictSurfacesTheServerMessage() async {
        let api = makeAPI(
            status: 409,
            body: Data(#"{"_tag":"HandleConflictError","message":"This Handle is already claimed."}"#.utf8)
        )

        let error = await errorThrown { _ = try await api.claimHandle("onno") }

        guard case AuthError.authenticationFailed(let message)? = error else {
            Issue.record("expected authenticationFailed, got \(String(describing: error))")
            return
        }
        #expect(message == "This Handle is already claimed.")
    }

    @Test func setProfileVisibilityPutsTheVisibilityString() async throws {
        let api = makeAPI(
            status: 200,
            body: Data(#"{"handle":"onno","visibility":"public"}"#.utf8)
        )

        let profile = try await api.setProfileVisibility(.public)

        let request = try #require(StubURLProtocol.lastRequest)
        #expect(request.httpMethod == "PUT")
        #expect(request.url?.path == "/v1/profile/visibility")
        let payload = try #require(lastRequestJSON())
        #expect(payload as? [String: String] == ["visibility": "public"])
        #expect(profile.visibility == .public)
    }

    @Test func checkHandleAvailabilityQueriesTheHandle() async throws {
        let api = makeAPI(status: 200, body: Data(#"{"handle":"onno","available":true}"#.utf8))

        let availability = try await api.checkHandleAvailability("onno")

        let query = URLComponents(url: try #require(StubURLProtocol.lastRequest?.url), resolvingAgainstBaseURL: false)
        #expect(query?.queryItems?.first(where: { $0.name == "handle" })?.value == "onno")
        #expect(availability.available)
    }

    // MARK: - Helpers

    /// The stubbed transport surfaces an outgoing body as `httpBodyStream`,
    /// not `httpBody`, so payload assertions drain the stream.
    private func lastRequestJSON() -> Any? {
        guard let request = StubURLProtocol.lastRequest else { return nil }

        var data = request.httpBody ?? Data()
        if data.isEmpty, let stream = request.httpBodyStream {
            stream.open()
            defer { stream.close() }
            let bufferSize = 1024
            let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: bufferSize)
            defer { buffer.deallocate() }
            while stream.hasBytesAvailable {
                let read = stream.read(buffer, maxLength: bufferSize)
                guard read > 0 else { break }
                data.append(buffer, count: read)
            }
        }

        return try? JSONSerialization.jsonObject(with: data)
    }

    private func makeAPI(
        status: Int,
        body: Data,
        headers: [String: String] = [:],
        tokenStore: SessionTokenStore? = nil
    ) -> SleevyAPIClient {
        StubURLProtocol.lastRequest = nil
        StubURLProtocol.handler = { request in
            let response = HTTPURLResponse(
                url: request.url!,
                statusCode: status,
                httpVersion: nil,
                headerFields: ["Content-Type": "application/json"].merging(headers) { _, new in new }
            )!
            return (response, body)
        }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        let session = URLSession(configuration: configuration)

        let baseURL = URL(string: "https://test.local")!
        let api = HTTPClient(baseURL: baseURL, origin: nil, session: session, encoder: .sharedISO8601, decoder: .sharedISO8601)
        let captureClient = SleevyCaptureClient(
            apiBaseURL: baseURL,
            apiOrigin: "https://test.local",
            urlSession: session,
            encoder: .sharedISO8601,
            decoder: .sharedISO8601
        )
        if let tokenStore {
            return SleevyAPIClient(api: api, captureClient: captureClient, decoder: .sharedISO8601, tokenStore: tokenStore)
        }
        return SleevyAPIClient(api: api, captureClient: captureClient, decoder: .sharedISO8601, token: "test-token")
    }

    private func errorThrown(_ work: () async throws -> Void) async -> Error? {
        do {
            try await work()
            return nil
        } catch {
            return error
        }
    }

    private func isSessionExpired(_ error: Error?) -> Bool {
        if case AuthError.sessionExpired? = error { return true }
        return false
    }
}

/// Routes every request through `handler`, which returns the canned response.
/// `handler` is a process-wide hook; the suite is `.serialized` so only one
/// test sets and reads it at a time.
nonisolated final class StubURLProtocol: URLProtocol {
    nonisolated(unsafe) static var handler: ((URLRequest) -> (HTTPURLResponse, Data))?
    nonisolated(unsafe) static var lastRequest: URLRequest?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.lastRequest = request
        guard let handler = Self.handler else {
            client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
            return
        }

        let (response, data) = handler(request)
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
