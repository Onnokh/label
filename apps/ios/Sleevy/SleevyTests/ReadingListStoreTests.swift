import Foundation
import Testing
@testable import Sleevy

/// Exercises the `ReadingListStore` coordination layer end-to-end against
/// stubbed collaborators: a `URLProtocol`-backed `SavedItemsAPI`, temp-dir
/// queues and cache, and a fake connectivity monitor. This covers the logic the
/// extracted-collaborator unit tests can't — the optimistic updates, queue
/// draining, and persistence the store orchestrates on top of them.
///
/// Serialized because the URL stub (`StoreStubURLProtocol`) routes through a
/// process-wide handler; serialization keeps these tests from clobbering each
/// other's canned responses. The dedicated protocol class (rather than reusing
/// `SavedItemsAPITests`' `StubURLProtocol`) keeps the two suites independent so
/// they can run in parallel.
@MainActor
@Suite(.serialized)
struct ReadingListStoreTests {

    @Test func loadFetchesPersistsAndMarksReachable() async {
        StoreStubURLProtocol.handler = { request in
            Self.respond(to: request, savedItems: [Self.itemJSON(id: "a", isRead: false)])
        }
        let env = Environment()
        let store = env.makeStore()

        await store.load()

        #expect(store.savedItems.map(\.id) == ["a"])
        #expect(store.isAPIReachable)
        #expect(store.lastSuccessfulSyncAt != nil)
        #expect(env.cache.load()?.map(\.id) == ["a"]) // persisted through the injected cache
    }

    @Test func captureWhileOfflineQueuesItemWithoutHittingNetwork() async throws {
        StoreStubURLProtocol.handler = { _ in Self.respond(status: 500, json: "{}") }
        let env = Environment()
        let store = env.makeStore()
        env.connectivity.emit(false)

        let outcome = try await store.capture("https://example.com/x")

        #expect(outcome == .queued)
        #expect(store.pendingCaptureCount == 1)
        #expect(store.savedItems.isEmpty)
    }

    @Test func loadAppliesAndDrainsQueuedReadState() async {
        // The server starts with the item unread; a read-state write flips it, so a
        // re-fetch reflects the synced state — as the real backend would.
        let server = ServerState()
        StoreStubURLProtocol.handler = { request in
            if request.url?.path.hasSuffix("/read-state") == true {
                server.isRead = true
                return Self.respond(status: 200, json: Self.itemJSON(id: "a", isRead: true))
            }
            return Self.respond(to: request, savedItems: [Self.itemJSON(id: "a", isRead: server.isRead)])
        }
        let env = Environment()
        env.readStateQueue.enqueue(itemId: "a", isRead: true) // an offline toggle awaiting sync
        let store = env.makeStore()

        await store.load()

        #expect(store.savedItems.first?.isRead == true) // override applied, then synced and confirmed
        #expect(env.readStateQueue.all().isEmpty)        // queue drained after the server confirmed it
        #expect(server.isRead)                           // the optimistic change was pushed to the server
    }

    /// Mutable server-side state captured by a stub handler so a read-state write
    /// is reflected by later fetches.
    private final class ServerState {
        var isRead = false
    }

    @Test func deleteRemovesItemAndUpdatesCache() async throws {
        StoreStubURLProtocol.handler = { request in
            if request.httpMethod == "DELETE" {
                return Self.respond(status: 204, json: "")
            }
            return Self.respond(to: request, savedItems: [Self.itemJSON(id: "a", isRead: false)])
        }
        let env = Environment()
        let store = env.makeStore()
        await store.load()
        let item = try #require(store.savedItems.first)

        await store.delete(item)

        #expect(store.savedItems.isEmpty)
        #expect(env.cache.load()?.isEmpty == true)
    }

    // MARK: - Environment

    /// Owns the per-test temp directory and the stubbed collaborators so a test
    /// can both inject them into the store and assert against them afterwards.
    private final class Environment {
        let connectivity = StubConnectivityMonitor()
        let cache: SavedItemCache
        let readStateQueue: ReadStateQueue
        let pendingCaptureQueue: PendingCaptureQueue
        private let savedItemsAPI: SavedItemsAPI
        private let statusDefaults: UserDefaults
        private let userId = "store-test-user"

        init() {
            let container = FileManager.default.temporaryDirectory
                .appendingPathComponent(UUID().uuidString, isDirectory: true)

            cache = SavedItemCache(userId: userId, directory: container, encoder: .sharedISO8601, decoder: .sharedISO8601)
            readStateQueue = ReadStateQueue(userId: userId, containerURL: container)
            pendingCaptureQueue = PendingCaptureQueue(
                userId: userId,
                store: SleevyPendingCaptureStore(appGroupIdentifier: "group.test", containerURLOverride: container)
            )
            statusDefaults = UserDefaults(suiteName: "store-test-\(UUID().uuidString)")!

            let configuration = URLSessionConfiguration.ephemeral
            configuration.protocolClasses = [StoreStubURLProtocol.self]
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
            savedItemsAPI = SavedItemsAPI(api: api, captureClient: captureClient, decoder: .sharedISO8601, token: "test-token")
        }

        @MainActor func makeStore() -> ReadingListStore {
            ReadingListStore(
                session: AppSession(token: "test-token", userId: userId, email: "a@b.c", name: "Tester", provider: nil),
                connectivityMonitor: connectivity,
                savedItemsAPI: savedItemsAPI,
                pendingCaptureQueue: pendingCaptureQueue,
                readStateQueue: readStateQueue,
                savedItemCache: cache,
                statusDefaults: statusDefaults
            )
        }
    }

    /// Captures the store's connectivity callback so a test can drive reachability
    /// transitions deterministically, with no live `NWPathMonitor`.
    private final class StubConnectivityMonitor: ConnectivityMonitoring {
        private var onChange: (@MainActor (Bool) -> Void)?

        func start(onChange: @escaping @MainActor (Bool) -> Void) {
            self.onChange = onChange
        }

        @MainActor func emit(_ isOnline: Bool) {
            onChange?(isOnline)
        }
    }

    // MARK: - Stub responses

    private static func respond(to request: URLRequest, savedItems: [String]) -> (HTTPURLResponse, Data) {
        respond(status: 200, json: #"{"savedItems":[\#(savedItems.joined(separator: ","))]}"#)
    }

    private static func respond(status: Int, json: String) -> (HTTPURLResponse, Data) {
        let response = HTTPURLResponse(
            url: URL(string: "https://test.local")!,
            statusCode: status,
            httpVersion: nil,
            headerFields: ["Content-Type": "application/json"]
        )!
        return (response, Data(json.utf8))
    }

    private static func itemJSON(id: String, isRead: Bool) -> String {
        """
        {
          "id": "\(id)",
          "originalUrl": "https://example.com/\(id)",
          "normalizedUrl": "https://example.com/\(id)",
          "host": "example.com",
          "type": "article",
          "tags": [],
          "enrichmentStatus": "enriched",
          "isRead": \(isRead),
          "lastSavedAt": "2026-05-13T10:11:12.345Z",
          "createdAt": "2026-05-13T10:11:12.345Z",
          "updatedAt": "2026-05-13T10:11:12.345Z"
        }
        """
    }
}

/// Routes every request through `handler`, which returns the canned response.
/// Distinct from `SavedItemsAPITests`' `StubURLProtocol` so the two suites own
/// separate process-wide hooks and don't race.
nonisolated final class StoreStubURLProtocol: URLProtocol {
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
