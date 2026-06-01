import Foundation
import Testing
@testable import Sleevy

@MainActor
struct SavedItemCacheTests {

    @Test func saveThenLoadRoundTripsItems() {
        let cache = makeCache()
        let items = [makeItem(id: "a", isRead: false), makeItem(id: "b", isRead: true)]

        cache.save(items)

        #expect(cache.load() == items)
    }

    @Test func loadReturnsNilWhenNoFileExists() {
        #expect(makeCache().load() == nil)
    }

    @Test func saveEmptyPersistsEmptyArray() {
        let cache = makeCache()
        cache.save([makeItem(id: "a", isRead: false)])

        cache.save([])

        #expect(cache.load() == [])
    }

    @Test func saveOverwritesPreviousContents() {
        let cache = makeCache()
        cache.save([makeItem(id: "a", isRead: false)])
        cache.save([makeItem(id: "b", isRead: true)])

        #expect(cache.load()?.map(\.id) == ["b"])
    }

    @Test func cachesAreIsolatedPerUser() {
        let directory = makeDirectory()
        makeCache(userId: "user-1", directory: directory).save([makeItem(id: "a", isRead: false)])

        #expect(makeCache(userId: "user-2", directory: directory).load() == nil)
    }

    // MARK: - Helpers

    private func makeDirectory() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
    }

    private func makeCache(userId: String = "user-1", directory: URL? = nil) -> SavedItemCache {
        SavedItemCache(
            userId: userId,
            directory: directory ?? makeDirectory(),
            encoder: .sharedISO8601,
            decoder: .sharedISO8601
        )
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
}
