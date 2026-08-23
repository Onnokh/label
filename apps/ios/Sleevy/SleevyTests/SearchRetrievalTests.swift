import Foundation
import Testing
@testable import Sleevy

@MainActor
struct SearchRetrievalTests {
    @Test func searchMatchesTheCompleteAccountVocabularyNewestFirst() {
        var filed = SavedItem.fixture(id: "filed", isRead: false, folderId: "folder")
        filed.title = "Swift Concurrency"
        filed.siteName = "Apple Developer"
        filed.description = "Structured tasks"
        filed.previewSummary = "Actors guard shared state"
        filed.type = "Article"
        filed.tags = ["TypeScript", "Security"]
        filed.sourceName = "Onno's iPhone"
        filed.captureChannel = "ios-share-extension"
        filed.originalURL = "https://www.example.com/swift"
        filed.canonicalURL = "https://example.com/canonical"
        filed.lastSavedAt = .init(timeIntervalSince1970: 200)

        var unfiled = SavedItem.fixture(id: "unfiled", isRead: false)
        unfiled.title = "Swift basics"
        unfiled.host = "other.test"
        unfiled.originalURL = "https://other.test/unfiled"
        unfiled.normalizedURL = "https://other.test/unfiled"
        unfiled.type = "Website"
        unfiled.lastSavedAt = .init(timeIntervalSince1970: 100)

        let index = RetrievalIndex(
            globalItems: [unfiled, filed],
            globalCoverage: .complete
        )

        let matches = [
            "concurrency", "apple developer", "example.com", "canonical",
            "structured tasks", "actors guard", "article", "security", "onno's iphone",
            "ios-share-extension",
        ].map { query in
            RetrievalProjector.searchSnapshot(for: query, in: index).items.map(\.id)
        }

        #expect(matches.allSatisfy { $0 == ["filed"] })
        #expect(
            RetrievalProjector.searchSnapshot(for: "swift", in: index).items.map(\.id)
                == ["filed", "unfiled"]
        )
    }

    @Test func searchContentOnlyRebuildsWhenSearchableFieldsChange() {
        var original = SavedItem.fixture(id: "item", isRead: false)
        original.title = "Before hydration"
        var index = RetrievalIndex(globalItems: [original], globalCoverage: .complete)
        let firstBuildCount = index.searchContentBuildCount

        let first = RetrievalProjector.searchSnapshot(for: "before", in: index)
        let second = RetrievalProjector.searchSnapshot(for: "before", in: index)
        index.upsert([original.withReadState(true)])

        #expect(first == second)
        #expect(index.searchContentBuildCount == firstBuildCount)

        var hydrated = original
        hydrated.title = "After hydration"
        hydrated.updatedAt = hydrated.updatedAt.addingTimeInterval(1)
        index.upsert([hydrated])

        #expect(index.searchContentBuildCount == firstBuildCount + 1)
        #expect(RetrievalProjector.searchSnapshot(for: "after", in: index).items.map(\.id) == ["item"])
    }

    @Test func libraryCachesSearchUntilTheQueryOrCanonicalItemChanges() async {
        let environment = SearchRetrievalEnvironment()
        var item = SavedItem.fixture(id: "item", isRead: false, folderId: "folder")
        item.title = "Needle"
        environment.network.items[item.id] = item
        let library = environment.makeLibrary()

        library.setSearchQuery("needle")
        await library.load()

        #expect(library.searchSnapshot.items.map(\.id) == ["item"])
        let projectionCount = library.searchProjectionCount

        library.setSearchQuery("  needle  ")
        _ = library.searchSnapshot
        _ = library.searchSnapshot

        #expect(library.searchProjectionCount == projectionCount)

        var hydrated = item
        hydrated.title = "Hydrated title"
        hydrated.updatedAt = hydrated.updatedAt.addingTimeInterval(1)
        environment.network.items[item.id] = hydrated
        await library.refresh()

        #expect(library.searchSnapshot.items.isEmpty)
        #expect(library.searchProjectionCount == projectionCount + 1)
    }

    @Test func searchRowsShareCaptureOpenReadFolderAndDeleteLifecycle() async throws {
        let environment = SearchRetrievalEnvironment()
        let library = environment.makeLibrary()
        library.setSearchQuery("example.com")

        let outcome = try await library.capture("https://example.com/new")
        guard case .saved(let captured) = outcome else {
            Issue.record("Expected an online capture")
            return
        }

        #expect(library.searchSnapshot.items.map(\.id) == [captured.id])

        library.prepareForAnimatedReadStateChange(captured)
        #expect(library.searchSnapshot.items.first?.isRead == true)

        await library.setRead(library.searchSnapshot.items.first!, isRead: false)
        #expect(library.searchSnapshot.items.first?.isRead == false)

        try await library.createFolder(named: "Reading", emoji: nil, color: nil)
        let folder = library.folders.first!
        try await library.move(library.searchSnapshot.items.first!, to: folder)
        #expect(library.searchSnapshot.items.first?.folder?.id == folder.id)

        await library.delete(library.searchSnapshot.items.first!)
        #expect(library.searchSnapshot.items.isEmpty)
        #expect(library.searchSnapshot.hasSavedItems == false)
    }

    @Test func searchKeepsBlankCachedAndFailureStateInputs() async {
        let failedEnvironment = SearchRetrievalEnvironment()
        failedEnvironment.network.faults["loadSavedItems"] = .unreachable(reason: "offline")
        let failedLibrary = failedEnvironment.makeLibrary()

        await failedLibrary.load()

        #expect(failedLibrary.searchSnapshot.coverage == .failed)
        #expect(failedLibrary.searchSnapshot.hasSavedItems == false)

        let cachedEnvironment = SearchRetrievalEnvironment()
        var cached = SavedItem.fixture(id: "cached", isRead: false)
        cached.title = "Cached result"
        await cachedEnvironment.cache.save(
            RetrievalIndex(globalItems: [cached], globalCoverage: .complete)
        )
        cachedEnvironment.network.faults["loadSavedItems"] = .unreachable(reason: "offline")
        let cachedLibrary = cachedEnvironment.makeLibrary()
        cachedLibrary.setSearchQuery("cached")

        await cachedLibrary.loadIfNeeded()

        #expect(cachedLibrary.searchSnapshot.items.map(\.id) == ["cached"])
        #expect(cachedLibrary.searchSnapshot.coverage == .stale)

        cachedLibrary.setSearchQuery(" \n ")

        #expect(cachedLibrary.searchSnapshot.items.isEmpty)
        #expect(cachedLibrary.searchSnapshot.hasSavedItems)
    }
}

@MainActor
private final class SearchRetrievalEnvironment {
    let network = InMemoryNetworkAdapter()
    let connectivity = StubConnectivityMonitor()
    let cache: RetrievalIndexCache
    private let readState: ReadStateQueue
    private let captures: PendingCaptureQueue
    private let statusDefaults: UserDefaults
    private let userId = "search-retrieval-test-user"

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
        statusDefaults = UserDefaults(suiteName: "search-retrieval-\(UUID().uuidString)")!
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
