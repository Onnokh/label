import Foundation
import Testing
@testable import Sleevy

/// Drives `SavedItemsAPI` against a stubbed `URLSession` to lock in the
/// status-code → domain-error policy. Serialized because the stub routes
/// requests through a process-wide `URLProtocol` handler.
@MainActor
@Suite(.serialized)
struct SavedItemsAPITests {

    // MARK: - Success

    @Test func decodesSuccessfulResponse() async throws {
        let api = makeAPI(status: 200, body: Data(#"{"savedItems":[]}"#.utf8))

        let response = try await api.request(path: "/v1/saved-items", responseType: SavedItemsResponse.self)

        #expect(response.savedItems.isEmpty)
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

    @Test func plainTextErrorBodyMapsToAuthenticationFailed() async {
        let api = makeAPI(status: 500, body: Data("Server exploded".utf8))

        let error = await errorThrown {
            _ = try await api.request(path: "/v1/saved-items", responseType: SavedItemsResponse.self)
        }

        guard case AuthError.authenticationFailed(let message)? = error else {
            Issue.record("expected authenticationFailed, got \(String(describing: error))")
            return
        }
        #expect(message == "Server exploded")
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

    @Test func setReadStateClientErrorIsUnretriable() async {
        let api = makeAPI(status: 400, body: Data())

        let error = await errorThrown { _ = try await api.setReadState(itemId: "x", isRead: true) }

        guard case PendingReadStateSyncError.unretriable? = error else {
            Issue.record("expected unretriable, got \(String(describing: error))")
            return
        }
    }

    // MARK: - Helpers

    private func makeAPI(status: Int, body: Data) -> SavedItemsAPI {
        StubURLProtocol.handler = { request in
            let response = HTTPURLResponse(
                url: request.url!,
                statusCode: status,
                httpVersion: nil,
                headerFields: ["Content-Type": "application/json"]
            )!
            return (response, body)
        }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        let session = URLSession(configuration: configuration)

        let baseURL = URL(string: "https://test.local")!
        let api = APIClient(baseURL: baseURL, origin: nil, session: session, encoder: .sharedISO8601, decoder: .sharedISO8601)
        let captureClient = SleevyCaptureClient(
            apiBaseURL: baseURL,
            apiOrigin: "https://test.local",
            urlSession: session,
            encoder: .sharedISO8601,
            decoder: .sharedISO8601
        )
        return SavedItemsAPI(api: api, captureClient: captureClient, decoder: .sharedISO8601, token: "test-token")
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

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
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
