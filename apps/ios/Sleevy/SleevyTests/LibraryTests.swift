import Foundation
import Testing
@testable import Sleevy

/// Exercises the `ReadingListStore` coordination layer end-to-end against stubbed
/// collaborators: a `URLProtocol`-backed `SleevyAPIClient`, temp-dir queues and
/// cache, and a fake connectivity monitor. This covers the logic the
/// extracted-collaborator unit tests can't — the optimistic updates, queue
/// draining, derived views, and persistence the store orchestrates on top of
/// them.
///
/// Serialized because the URL stub (`StoreStubURLProtocol`) routes through a
/// process-wide handler; serialization keeps these tests from clobbering each
/// other's canned responses.
@MainActor
@Suite(.serialized)
struct LibraryTests {

    @Test func loadFetchesPersistsAndMarksReachable() async {
        StoreStubURLProtocol.handler = { request in
            Self.respond(to: request, savedItems: [Self.itemJSON(id: "a", isRead: false)])
        }
        let env = Environment()
        let store = env.makeStore()

        await store.load()

        #expect(store.snapshot(for: .completeLibrary).items.map(\.id) == ["a"])
        #expect(store.isAPIReachable)
        #expect(store.lastSuccessfulSyncAt != nil)
        let cached = await env.cache.load()
        #expect(cached?.index.globalItems.map(\.id) == ["a"]) // persisted through the injected cache
    }

    @Test func captureWhileOfflineQueuesItemWithoutHittingNetwork() async throws {
        StoreStubURLProtocol.handler = { _ in Self.respond(status: 500, json: "{}") }
        let env = Environment()
        let store = env.makeStore()
        env.connectivity.emit(false)

        let outcome = try await store.capture("https://example.com/x")

        #expect(outcome == .queued)
        #expect(store.pendingCaptureCount == 1)
        #expect(store.snapshot(for: .completeLibrary).items.isEmpty)
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

        #expect(store.snapshot(for: .completeLibrary).items.first?.isRead == true) // override applied, then synced and confirmed
        #expect(env.readStateQueue.all().isEmpty)          // queue drained after the server confirmed it
        #expect(server.isRead)                             // the optimistic change was pushed to the server
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
        let item = try #require(store.snapshot(for: .completeLibrary).items.first)

        await store.delete(item)

        #expect(store.snapshot(for: .completeLibrary).items.isEmpty)
        let cached = await env.cache.load()
        #expect(cached?.index.globalItems.isEmpty == true)
    }

    // MARK: - Derived-view invariants

    /// The same unfiled item is surfaced by both the Inbox (`.all`) and the
    /// Library root (`.unfiled`). A local read-state toggle is one write to the
    /// canonical store; both derived views must reflect it.
    @Test func readStateTogglePropagatesAcrossInboxAndLibraryRoot() async throws {
        StoreStubURLProtocol.handler = { request in
            if request.url?.path == "/v1/folders" { return Self.respond(status: 200, json: #"{"folders":[]}"#) }
            return Self.respond(to: request, savedItems: [Self.itemJSON(id: "a", isRead: false)])
        }
        let env = Environment()
        let store = env.makeStore()
        await store.load()
        env.connectivity.emit(false) // keep the toggle local — no server reconciliation

        let item = try #require(store.snapshot(for: .completeLibrary).items.first)
        await store.setRead(item, isRead: true)

        #expect(store.snapshot(for: .completeLibrary).items.first(where: { $0.id == "a" })?.isRead == true)
        #expect(store.snapshot(for: .libraryRoot).items.first(where: { $0.id == "a" })?.isRead == true)
    }

    /// Same invariant for an item that lives in the Inbox and a folder.
    @Test func readStateTogglePropagatesAcrossInboxAndFolder() async throws {
        StoreStubURLProtocol.handler = { request in
            if request.url?.path == "/v1/folders" {
                return Self.respond(status: 200, json: #"{"folders":[\#(Self.folderJSON(id: "f", name: "Work"))]}"#)
            }
            return Self.respond(to: request, savedItems: [Self.itemJSON(id: "b", isRead: false, folderId: "f")])
        }
        let env = Environment()
        let store = env.makeStore()
        await store.load()
        env.connectivity.emit(false)

        let item = try #require(store.snapshot(for: .completeLibrary).items.first)
        await store.setRead(item, isRead: true)

        #expect(store.snapshot(for: .completeLibrary).items.first(where: { $0.id == "b" })?.isRead == true)
        #expect(store.snapshot(for: .folder("f")).items.first(where: { $0.id == "b" })?.isRead == true)
    }

    /// Filing an unfiled item drops it from the Library root and adds it to the
    /// destination folder, with the shared canonical copy's folder updated — all
    /// from one upsert, with every derived view following.
    @Test func moveFilesItemAndUpdatesEveryView() async throws {
        StoreStubURLProtocol.handler = { request in
            if request.url?.path == "/v1/folders" {
                return Self.respond(status: 200, json: #"{"folders":[\#(Self.folderJSON(id: "f", name: "Work"))]}"#)
            }
            if request.httpMethod == "PUT", request.url?.path.hasSuffix("/folder") == true {
                return Self.respond(status: 200, json: Self.itemJSON(id: "a", isRead: false, folderId: "f"))
            }
            return Self.respond(to: request, savedItems: [Self.itemJSON(id: "a", isRead: false)])
        }
        let env = Environment()
        let store = env.makeStore()
        await store.load()
        let folder = try #require(store.folders.first)
        let item = try #require(store.snapshot(for: .completeLibrary).items.first)

        try await store.move(item, to: folder)

        #expect(store.snapshot(for: .libraryRoot).items.contains { $0.id == "a" } == false)
        #expect(store.snapshot(for: .folder("f")).items.contains { $0.id == "a" } == true)
        #expect(store.snapshot(for: .completeLibrary).items.first(where: { $0.id == "a" })?.folder?.id == "f")
    }

    /// Renaming a folder rewrites the embedded folder summary on every item that
    /// belongs to it, across both the Inbox and the folder view.
    @Test func renameFolderUpdatesSummaryOnEveryView() async throws {
        StoreStubURLProtocol.handler = { request in
            if request.url?.path == "/v1/folders", request.httpMethod == "GET" {
                return Self.respond(status: 200, json: #"{"folders":[\#(Self.folderJSON(id: "f", name: "Work"))]}"#)
            }
            if request.httpMethod == "PATCH", request.url?.path.hasPrefix("/v1/folders/") == true {
                return Self.respond(status: 200, json: Self.folderJSON(id: "f", name: "Career", emoji: "💼", color: "blue"))
            }
            return Self.respond(to: request, savedItems: [Self.itemJSON(id: "b", isRead: false, folderId: "f")])
        }
        let env = Environment()
        let store = env.makeStore()
        await store.load()
        let folder = try #require(store.folders.first)

        try await store.renameFolder(folder, to: "Career", emoji: "💼", color: "blue")

        #expect(store.snapshot(for: .completeLibrary).items.first(where: { $0.id == "b" })?.folder?.name == "Career")
        #expect(store.snapshot(for: .folder("f")).items.first(where: { $0.id == "b" })?.folder?.emoji == "💼")
    }

    // MARK: - Environment

    /// Owns the per-test temp directory and the stubbed collaborators so a test
    /// can both inject them into the store and assert against them afterwards.
    private final class Environment {
        let connectivity = StubConnectivityMonitor()
        let cache: RetrievalIndexCache
        let readStateQueue: ReadStateQueue
        let pendingCaptureQueue: PendingCaptureQueue
        private let sleevyAPI: SleevyAPIClient
        private let statusDefaults: UserDefaults
        private let userId = "store-test-user"

        init() {
            let container = FileManager.default.temporaryDirectory
                .appendingPathComponent(UUID().uuidString, isDirectory: true)

            cache = RetrievalIndexCache(userId: userId, directory: container, encoder: .sharedISO8601, decoder: .sharedISO8601)
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
            let api = HTTPClient(baseURL: baseURL, origin: nil, session: session, encoder: .sharedISO8601, decoder: .sharedISO8601)
            let captureClient = SleevyCaptureClient(
                apiBaseURL: baseURL,
                apiOrigin: "https://test.local",
                urlSession: session,
                encoder: .sharedISO8601,
                decoder: .sharedISO8601
            )
            sleevyAPI = SleevyAPIClient(api: api, captureClient: captureClient, decoder: .sharedISO8601, token: "test-token")
        }

        @MainActor func makeStore() -> ReadingListStore {
            ReadingListStore(
                session: AppSession(token: "test-token", userId: userId, email: "a@b.c", name: "Tester", provider: nil),
                connectivityMonitor: connectivity,
                api: sleevyAPI,
                pendingCaptureQueue: pendingCaptureQueue,
                readStateQueue: readStateQueue,
                retrievalIndexCache: cache,
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

    private static func itemJSON(id: String, isRead: Bool, folderId: String? = nil, folderName: String = "Work") -> String {
        let folderField = folderId.map {
            #""folder": {"id": "\#($0)", "name": "\#(folderName)", "emoji": null, "color": null},"#
        } ?? ""
        return """
        {
          "id": "\(id)",
          "originalUrl": "https://example.com/\(id)",
          "normalizedUrl": "https://example.com/\(id)",
          "host": "example.com",
          "type": "article",
          "tags": [],
          "enrichmentStatus": "enriched",
          \(folderField)
          "isRead": \(isRead),
          "lastSavedAt": "2026-05-13T10:11:12.345Z",
          "createdAt": "2026-05-13T10:11:12.345Z",
          "updatedAt": "2026-05-13T10:11:12.345Z"
        }
        """
    }

    private static func folderJSON(id: String, name: String, emoji: String? = nil, color: String? = nil) -> String {
        func quoted(_ value: String?) -> String { value.map { "\"\($0)\"" } ?? "null" }
        return #"{"id": "\#(id)", "name": "\#(name)", "emoji": \#(quoted(emoji)), "color": \#(quoted(color))}"#
    }
}

/// Routes every request through `handler`, which returns the canned response.
/// Distinct from `SleevyAPITests`' `StubURLProtocol` so the two suites own
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
