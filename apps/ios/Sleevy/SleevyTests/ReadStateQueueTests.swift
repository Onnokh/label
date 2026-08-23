import Foundation
import Testing
@testable import Sleevy

@MainActor
struct ReadStateQueueTests {

    // MARK: - Persistence

    @Test func enqueueThenAllReturnsTheUpdate() {
        let queue = makeQueue()
        queue.enqueue(itemId: "a", isRead: true)

        let all = queue.all()
        #expect(all.count == 1)
        #expect(all.first?.itemId == "a")
        #expect(all.first?.isRead == true)
    }

    @Test func enqueueSameItemTwiceKeepsOnlyLatest() {
        let queue = makeQueue()
        queue.enqueue(itemId: "a", isRead: true)
        queue.enqueue(itemId: "a", isRead: false)

        let all = queue.all()
        #expect(all.count == 1)
        #expect(all.first?.isRead == false)
    }

    @Test func removeDropsTheUpdate() {
        let queue = makeQueue()
        queue.enqueue(itemId: "a", isRead: true)
        queue.enqueue(itemId: "b", isRead: false)

        queue.remove(itemId: "a")

        #expect(queue.override(for: "a") == nil)
        #expect(queue.override(for: "b") == false)
    }

    @Test func removeProcessedDropsOnlyTheProcessedEntries() {
        let queue = makeQueue()
        queue.enqueue(itemId: "a", isRead: true)
        queue.enqueue(itemId: "b", isRead: false)
        let processed = queue.all().filter { $0.itemId == "a" }

        queue.removeProcessed(processed)

        #expect(queue.override(for: "a") == nil)
        #expect(queue.override(for: "b") == false)
    }

    /// The drain captures a processed snapshot, then a *newer* change for the same
    /// item is re-enqueued before cleanup runs. `removeProcessed` matches on the
    /// whole entry (incl. `queuedAt`), so the newer change survives.
    @Test func removeProcessedPreservesARequeuedNewerEntry() {
        let queue = makeQueue()
        queue.enqueue(itemId: "a", isRead: true)
        let processed = queue.all() // the snapshot a drain would carry

        // A concurrent toggle re-enqueues "a" with a fresh stamp + flipped state.
        queue.enqueue(itemId: "a", isRead: false)

        queue.removeProcessed(processed)

        #expect(queue.override(for: "a") == false) // the newer change survived
        #expect(queue.all().count == 1)
    }

    @Test func persistEmptyClearsTheQueue() {
        let queue = makeQueue()
        queue.enqueue(itemId: "a", isRead: true)

        queue.persist([])

        #expect(queue.all().isEmpty)
        #expect(queue.hasPending == false)
    }

    @Test func updatesPersistAcrossInstances() {
        let container = makeContainer()
        ReadStateQueue(userId: "user-9", containerURL: container).enqueue(itemId: "a", isRead: true)

        let reopened = ReadStateQueue(userId: "user-9", containerURL: container)
        #expect(reopened.override(for: "a") == true)
    }

    @Test func queuesAreIsolatedPerUser() {
        let container = makeContainer()
        ReadStateQueue(userId: "user-1", containerURL: container).enqueue(itemId: "a", isRead: true)

        let otherUser = ReadStateQueue(userId: "user-2", containerURL: container)
        #expect(otherUser.all().isEmpty)
    }

    @Test func missingContainerDegradesGracefully() {
        let queue = ReadStateQueue(userId: "user-1", containerURL: nil)
        queue.enqueue(itemId: "a", isRead: true)

        #expect(queue.all().isEmpty)
        #expect(queue.hasPending == false)
    }

    // MARK: - Overrides

    @Test func hasPendingTracksContents() {
        let queue = makeQueue()
        #expect(queue.hasPending == false)

        queue.enqueue(itemId: "a", isRead: true)
        #expect(queue.hasPending == true)

        queue.remove(itemId: "a")
        #expect(queue.hasPending == false)
    }

    @Test func overrideReflectsQueuedState() {
        let queue = makeQueue()
        queue.enqueue(itemId: "a", isRead: true)

        #expect(queue.override(for: "a") == true)
        #expect(queue.override(for: "missing") == nil)
    }

    @Test func applyFlipsMatchingItemsOnly() {
        let queue = makeQueue()
        queue.enqueue(itemId: "a", isRead: true)

        let result = queue.apply(to: [makeItem(id: "a", isRead: false), makeItem(id: "b", isRead: false)])

        #expect(result.first(where: { $0.id == "a" })?.isRead == true)
        #expect(result.first(where: { $0.id == "b" })?.isRead == false)
    }

    @Test func applyLeavesItemUntouchedWhenStateAlreadyMatches() {
        let queue = makeQueue()
        queue.enqueue(itemId: "a", isRead: true)

        let original = makeItem(id: "a", isRead: true)
        #expect(queue.apply(to: [original]) == [original])
    }

    // Retry classification no longer lives on the queue — it is unified in
    // `HTTPReadingListAdapter.fault(from:)` + `ReadingListStore.classify`,
    // covered by `HTTPReadingListAdapterTests` and `LibrarySyncTests`.

    // MARK: - Helpers

    private func makeContainer() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
    }

    private func makeQueue(userId: String = "user-1") -> ReadStateQueue {
        ReadStateQueue(userId: userId, containerURL: makeContainer())
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
