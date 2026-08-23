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

    @Test func scopedResponseMergesIntoCanonicalSavedItem() {
        var stale = SavedItem.fixture(id: "shared", isRead: false)
        stale.title = "Stale title"
        var fresh = stale
        fresh.title = "Fresh title"
        var index = RetrievalIndex(globalItems: [stale], globalCoverage: .complete)

        index.replace(
            with: [fresh],
            for: .libraryRoot,
            coverage: .complete
        )

        #expect(RetrievalProjector.snapshot(for: .libraryRoot, in: index).items.first?.title == "Fresh title")
        #expect(RetrievalProjector.snapshot(for: .completeLibrary, in: index).items.first?.title == "Fresh title")
    }

    @Test func libraryRootLoadsAndKeepsKnownEmptyCoverage() async {
        let environment = RetrievalTestEnvironment()
        environment.network.items["filed"] = .fixture(id: "filed", isRead: false, folderId: "work")
        let library = environment.makeStore()

        await library.load()
        await library.loadIfNeeded(for: .libraryRoot)

        let snapshot = library.snapshot(for: .libraryRoot)
        #expect(snapshot.items.isEmpty)
        #expect(snapshot.coverage == .complete)
        #expect(environment.network.savedItemFetches.contains(.libraryRoot))
    }

    @Test func failedRefreshKeepsKnownEmptyLibraryRootAsStale() async {
        let environment = RetrievalTestEnvironment()
        environment.network.items["filed"] = .fixture(id: "filed", isRead: false, folderId: "work")
        let library = environment.makeStore()
        await library.load()
        await library.loadIfNeeded(for: .libraryRoot)
        var shouldArmScopeFailure = true
        environment.network.onLoadSavedItems = {
            guard shouldArmScopeFailure else { return }
            shouldArmScopeFailure = false
            environment.network.faults["loadSavedItems"] = .unreachable(reason: "offline")
        }

        await library.refresh(.libraryRoot)

        #expect(library.snapshot(for: .libraryRoot).items.isEmpty)
        #expect(library.snapshot(for: .libraryRoot).coverage == .stale)
    }

    @Test func folderChangesUpdateEveryKnownDestination() async throws {
        let environment = RetrievalTestEnvironment()
        let work = Folder(id: "work", name: "Work", emoji: nil, color: nil)
        let later = Folder(id: "later", name: "Later", emoji: nil, color: nil)
        environment.network.folders = [work.id: work, later.id: later]
        environment.network.items["root"] = .fixture(id: "root", isRead: false)
        environment.network.items["filed"] = .fixture(id: "filed", isRead: true, folderId: work.id)
        let library = environment.makeStore()

        await library.load()
        await library.loadIfNeeded(for: .libraryRoot)
        await library.loadIfNeeded(for: .folder(work.id))
        await library.loadIfNeeded(for: .folder(later.id))

        try await library.move(environment.network.items["root"]!, to: work)

        #expect(library.snapshot(for: .libraryRoot).items.isEmpty)
        #expect(library.snapshot(for: .folder(work.id)).items.map(\.id).sorted() == ["filed", "root"])
        #expect(library.snapshot(for: .completeLibrary).items.count { $0.folder?.id == work.id } == 2)

        try await library.renameFolder(work, to: "Career", emoji: "💼", color: "blue")

        #expect(library.snapshot(for: .folder(work.id)).items.allSatisfy { $0.folder?.name == "Career" })

        let renamed = try #require(library.folders.first(where: { $0.id == work.id }))
        try await library.deleteFolder(renamed)

        #expect(library.snapshot(for: .folder(work.id)).items.isEmpty)
        #expect(library.snapshot(for: .libraryRoot).items.map(\.id).sorted() == ["filed", "root"])
    }

    @Test func libraryProjectionKeepsDestinationFiltersSortsAndFacetCounts() {
        var older = SavedItem.fixture(id: "older", isRead: true)
        older.lastSavedAt = .init(timeIntervalSince1970: 100)
        older.tags = ["Swift", "Design"]
        older.sourceName = "Mac"
        var newer = SavedItem.fixture(id: "newer", isRead: false)
        newer.lastSavedAt = .init(timeIntervalSince1970: 200)
        newer.tags = ["Swift"]
        newer.sourceName = "iPhone"
        let index = RetrievalIndex(globalItems: [older, newer], globalCoverage: .complete)
        let projection = RetrievalProjector.libraryProjection(
            for: .libraryRoot,
            filter: LibraryFilter(tag: "Swift", source: "iPhone", type: "article"),
            sort: .oldest,
            facetOrder: .frequency,
            in: index
        )

        #expect(projection.items.map(\.id) == ["newer"])
        #expect(projection.destinationCount == 2)
        #expect(projection.unreadDestinationCount == 1)
        #expect(projection.tags == [
            LibraryFilterOption(value: "Swift", count: 2),
            LibraryFilterOption(value: "Design", count: 1),
        ])
        #expect(projection.folderCounts.isEmpty)
    }

    @Test func unchangedLibraryProjectionReadsReusePreparedWork() async {
        let environment = RetrievalTestEnvironment()
        environment.network.items["root"] = .fixture(id: "root", isRead: false)
        let store = environment.makeStore()
        await store.load()

        let first = store.libraryProjection(
            for: .libraryRoot,
            filter: LibraryFilter(),
            sort: .newest,
            facetOrder: .frequency
        )
        let buildCount = store.libraryProjectionCount
        let second = store.libraryProjection(
            for: .libraryRoot,
            filter: LibraryFilter(),
            sort: .newest,
            facetOrder: .frequency
        )

        #expect(first == second)
        #expect(store.libraryProjectionCount == buildCount)
    }

    @Test func retrievalMutationInvalidatesLibraryProjection() async {
        let environment = RetrievalTestEnvironment()
        environment.network.items["root"] = .fixture(id: "root", isRead: false)
        let store = environment.makeStore()
        await store.load()

        let before = store.libraryProjection(
            for: .libraryRoot,
            filter: LibraryFilter(),
            sort: .newest,
            facetOrder: .frequency
        )
        #expect(before.unreadDestinationCount == 1)

        environment.connectivity.emit(false) // keep the toggle local
        await store.setRead(before.items.first!, isRead: true)

        let after = store.libraryProjection(
            for: .libraryRoot,
            filter: LibraryFilter(),
            sort: .newest,
            facetOrder: .frequency
        )
        #expect(after.items.first?.isRead == true)
        #expect(after.unreadDestinationCount == 0)
    }

    @Test func readingQueueSnapshotTracksLoadAndOptimisticReadState() async {
        let environment = RetrievalTestEnvironment()
        environment.network.items["unread"] = .fixture(id: "unread", isRead: false)
        environment.network.items["read"] = .fixture(id: "read", isRead: true)
        let library = environment.makeStore()

        await library.load()

        #expect(library.snapshot(for: .readingQueue).items.map(\.id) == ["unread"])
        #expect(library.snapshot(for: .readingQueue).coverage == .complete)

        environment.connectivity.emit(false)
        await library.setRead(library.snapshot(for: .completeLibrary).items.first(where: { $0.id == "unread" })!, isRead: true)

        #expect(library.snapshot(for: .readingQueue).items.isEmpty)
    }

    @Test func failedLoadsDistinguishMissingDataFromStaleCache() async {
        let emptyEnvironment = RetrievalTestEnvironment()
        emptyEnvironment.network.faults["loadSavedItems"] = .unreachable(reason: "offline")
        let emptyLibrary = emptyEnvironment.makeStore()

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
        let cachedLibrary = cachedEnvironment.makeStore()

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
        let library = environment.makeStore()

        await library.loadIfNeeded()

        #expect(library.snapshot(for: .readingQueue).items.isEmpty)
        #expect(library.snapshot(for: .readingQueue).coverage == .stale)
    }

    @Test func readingQueueSnapshotTracksCaptureAndDelete() async throws {
        let environment = RetrievalTestEnvironment()
        let library = environment.makeStore()

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

    func makeStore() -> ReadingListStore {
        ReadingListStore(
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
