import Foundation
import Testing
@testable import Sleevy

@MainActor
struct RetrievalTests {
    @Test func readingQueueProjectsUnreadItemsNewestFirst() {
        var olderUnread = SavedItem.fixture(id: "older", isRead: false)
        olderUnread.lastSavedAt = .init(timeIntervalSince1970: 100)
        var newerUnread = SavedItem.fixture(id: "newer", isRead: false)
        newerUnread.lastSavedAt = .init(timeIntervalSince1970: 200)
        var newestRead = SavedItem.fixture(id: "read", isRead: true)
        newestRead.lastSavedAt = .init(timeIntervalSince1970: 300)

        let index = RetrievalIndex(
            globalItems: [olderUnread, newestRead, newerUnread],
            globalCoverage: .complete
        )

        let snapshot = RetrievalProjector.snapshot(for: .readingQueue, in: index)

        #expect(snapshot.items.map(\.id) == ["newer", "older"])
        #expect(snapshot.coverage == .complete)
    }

    @Test func readingQueueSnapshotTracksLoadAndOptimisticReadState() async {
        let environment = RetrievalTestEnvironment()
        environment.network.items["unread"] = .fixture(id: "unread", isRead: false)
        environment.network.items["read"] = .fixture(id: "read", isRead: true)
        let library = environment.makeLibrary()

        await library.load()

        #expect(library.snapshot(for: .readingQueue).items.map(\.id) == ["unread"])
        #expect(library.snapshot(for: .readingQueue).coverage == .complete)

        environment.connectivity.emit(false)
        await library.setRead(library.savedItems().first(where: { $0.id == "unread" })!, isRead: true)

        #expect(library.snapshot(for: .readingQueue).items.isEmpty)
    }

    @Test func failedLoadsDistinguishMissingDataFromStaleCache() async {
        let emptyEnvironment = RetrievalTestEnvironment()
        emptyEnvironment.network.faults["loadSavedItems"] = .unreachable(reason: "offline")
        let emptyLibrary = emptyEnvironment.makeLibrary()

        await emptyLibrary.load()

        #expect(emptyLibrary.snapshot(for: .readingQueue).coverage == .failed)

        let cachedEnvironment = RetrievalTestEnvironment()
        await cachedEnvironment.cache.save(
            RetrievalIndex(
                globalItems: [.fixture(id: "cached", isRead: false)],
                globalCoverage: .complete
            )
        )
        cachedEnvironment.network.faults["loadSavedItems"] = .unreachable(reason: "offline")
        let cachedLibrary = cachedEnvironment.makeLibrary()

        await cachedLibrary.loadIfNeeded()

        #expect(cachedLibrary.snapshot(for: .readingQueue).items.map(\.id) == ["cached"])
        #expect(cachedLibrary.snapshot(for: .readingQueue).coverage == .stale)
    }

    @Test func failedRefreshKeepsKnownEmptyCacheDistinctFromUnloadedScope() async {
        let environment = RetrievalTestEnvironment()
        await environment.cache.save(
            RetrievalIndex(globalItems: [], globalCoverage: .complete)
        )
        environment.network.faults["loadSavedItems"] = .unreachable(reason: "offline")
        let library = environment.makeLibrary()

        await library.loadIfNeeded()

        #expect(library.snapshot(for: .readingQueue).items.isEmpty)
        #expect(library.snapshot(for: .readingQueue).coverage == .stale)
    }

    @Test func readingQueueSnapshotTracksCaptureAndDelete() async throws {
        let environment = RetrievalTestEnvironment()
        let library = environment.makeLibrary()

        let outcome = try await library.capture("https://example.com/new")
        guard case .saved(let captured) = outcome else {
            Issue.record("Expected an online capture")
            return
        }

        #expect(library.snapshot(for: .readingQueue).items.map(\.id) == [captured.id])

        await library.delete(captured)

        #expect(library.snapshot(for: .readingQueue).items.isEmpty)
    }
}

@MainActor
private final class RetrievalTestEnvironment {
    let network = InMemoryNetworkAdapter()
    let connectivity = StubConnectivityMonitor()
    let cache: RetrievalIndexCache
    let readState: ReadStateQueue
    let captures: PendingCaptureQueue
    let statusDefaults: UserDefaults
    private let userId = "retrieval-test-user"

    init() {
        let container = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        cache = RetrievalIndexCache(
            userId: userId,
            directory: container,
            encoder: .sharedISO8601,
            decoder: .sharedISO8601
        )
        readState = ReadStateQueue(userId: userId, containerURL: container)
        captures = PendingCaptureQueue(
            userId: userId,
            store: SleevyPendingCaptureStore(
                appGroupIdentifier: "group.test",
                containerURLOverride: container
            )
        )
        statusDefaults = UserDefaults(suiteName: "retrieval-test-\(UUID().uuidString)")!
    }

    func makeLibrary() -> Library {
        Library(
            userId: userId,
            network: network,
            cache: cache,
            readStateQueue: readState,
            pendingCaptureQueue: captures,
            statusDefaults: statusDefaults,
            connectivity: connectivity
        )
    }
}
