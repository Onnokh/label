import Foundation
import Testing
@testable import Sleevy

@MainActor
struct RetrievalIndexCacheTests {

    @Test func saveThenLoadRoundTripsRetrievalIndex() async {
        let cache = makeCache()
        let items = [makeItem(id: "a", isRead: false), makeItem(id: "b", isRead: true)]
        let index = RetrievalIndex(globalItems: items, globalCoverage: .complete)
        let savedAt = Date(timeIntervalSince1970: 1_800_000_000)
        let scopeUpdatedAt = Date(timeIntervalSince1970: 1_700_000_000)

        await cache.save(index, savedAt: savedAt, scopeUpdatedAt: scopeUpdatedAt)
        let cached = await cache.load()

        #expect(cached?.index.globalItems.sorted(by: { $0.id < $1.id }) == items.sorted(by: { $0.id < $1.id }))
        #expect(cached?.index.globalCoverage == .cached)
        #expect(cached?.storedCoverage == .complete)
        #expect(cached?.savedAt == savedAt)
        #expect(cached?.scopeUpdatedAt == scopeUpdatedAt)
    }

    @Test func loadReturnsNilWhenNoFileExists() async {
        let cached = await makeCache().load()
        #expect(cached == nil)
    }

    @Test func saveEmptyPersistsKnownEmptyScope() async {
        let cache = makeCache()
        await cache.save(index(with: [makeItem(id: "a", isRead: false)]))

        await cache.save(index(with: []))
        let cached = await cache.load()

        #expect(cached?.index.globalItems == [])
        #expect(cached?.index.globalCoverage == .cached)
    }

    @Test func saveOverwritesPreviousContents() async {
        let cache = makeCache()
        await cache.save(index(with: [makeItem(id: "a", isRead: false)]))
        await cache.save(index(with: [makeItem(id: "b", isRead: true)]))

        let cached = await cache.load()
        #expect(cached?.index.globalItems.map(\.id) == ["b"])
    }

    @Test func cachesAreIsolatedPerUser() async {
        let directory = makeDirectory()
        await makeCache(userId: "user-1", directory: directory)
            .save(index(with: [makeItem(id: "a", isRead: false)]))

        let otherAccountCache = await makeCache(userId: "user-2", directory: directory).load()
        #expect(otherAccountCache == nil)
    }

    @Test func loadMigratesBareSavedItemArrayWithoutDroppingContent() async throws {
        let directory = makeDirectory()
        let fileURL = cacheFileURL(userId: "user-1", directory: directory)
        try FileManager.default.createDirectory(
            at: fileURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        let item = makeItem(id: "legacy", isRead: false)
        try JSONEncoder.sharedISO8601.encode([item]).write(to: fileURL, options: .atomic)

        let cached = await makeCache(directory: directory).load()

        #expect(cached?.index.globalItems == [item])
        #expect(cached?.index.globalCoverage == .cached)
        let migratedData = try Data(contentsOf: fileURL)
        let migratedJSON = try #require(JSONSerialization.jsonObject(with: migratedData) as? [String: Any])
        #expect(migratedJSON["version"] as? Int == 1)
    }

    @Test func loadIgnoresCorruptData() async throws {
        let directory = makeDirectory()
        let fileURL = cacheFileURL(userId: "user-1", directory: directory)
        try FileManager.default.createDirectory(
            at: fileURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try Data("not-json".utf8).write(to: fileURL, options: .atomic)

        let cached = await makeCache(directory: directory).load()

        #expect(cached == nil)
        #expect(try Data(contentsOf: fileURL) == Data("not-json".utf8))
    }

    @Test func loadIgnoresUnsupportedFutureVersion() async throws {
        let directory = makeDirectory()
        let cache = makeCache(directory: directory)
        await cache.save(index(with: [makeItem(id: "future", isRead: false)]))
        let fileURL = cacheFileURL(userId: "user-1", directory: directory)
        let data = try Data(contentsOf: fileURL)
        var json = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
        json["version"] = 2
        try JSONSerialization.data(withJSONObject: json).write(to: fileURL, options: .atomic)

        let cached = await cache.load()

        #expect(cached == nil)
        let retainedJSON = try #require(
            JSONSerialization.jsonObject(with: Data(contentsOf: fileURL)) as? [String: Any]
        )
        #expect(retainedJSON["version"] as? Int == 2)
    }

    @Test func saveFailureIsBestEffort() async throws {
        let blockedDirectory = makeDirectory()
        try Data().write(to: blockedDirectory, options: .atomic)
        let cache = makeCache(directory: blockedDirectory)

        await cache.save(index(with: [makeItem(id: "a", isRead: false)]))

        let cached = await cache.load()
        #expect(cached == nil)
    }

    // MARK: - Helpers

    private func makeDirectory() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
    }

    private func makeCache(userId: String = "user-1", directory: URL? = nil) -> RetrievalIndexCache {
        RetrievalIndexCache(
            userId: userId,
            directory: directory ?? makeDirectory(),
            encoder: .sharedISO8601,
            decoder: .sharedISO8601
        )
    }

    private func cacheFileURL(userId: String, directory: URL) -> URL {
        directory
            .appendingPathComponent("ReadingListCache", isDirectory: true)
            .appendingPathComponent("\(userId).json", isDirectory: false)
    }

    private func makeItem(id: String, isRead: Bool) -> SavedItem {
        SavedItem(
            id: id,
            originalURL: "https://example.com/\(id)",
            normalizedURL: "https://example.com/\(id)",
            host: "example.com",
            title: id,
            description: nil,
            siteName: nil,
            faviconURL: nil,
            faviconLightURL: nil,
            faviconDarkURL: nil,
            canonicalURL: nil,
            previewSummary: nil,
            type: "article",
            tags: [],
            enrichmentStatus: .enriched,
            sourceName: nil,
            captureChannel: nil,
            folder: nil,
            isRead: isRead,
            lastSavedAt: Date(timeIntervalSince1970: 1_700_000_000),
            createdAt: Date(timeIntervalSince1970: 1_700_000_000),
            updatedAt: Date(timeIntervalSince1970: 1_700_000_000)
        )
    }

    private func index(with items: [SavedItem]) -> RetrievalIndex {
        RetrievalIndex(globalItems: items, globalCoverage: .complete)
    }
}
