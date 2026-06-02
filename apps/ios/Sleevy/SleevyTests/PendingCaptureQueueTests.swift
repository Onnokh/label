import Foundation
import Testing
@testable import Sleevy

@MainActor
struct PendingCaptureQueueTests {

    // MARK: - PendingSavedItem projection

    @Test func projectionUsesLastPathComponentAsTitleAndStripsWWW() {
        let item = PendingSavedItem(pendingCapture: makeCapture(url: "https://www.example.com/cool-article"))

        #expect(item.host == "example.com")
        #expect(item.title == "cool-article")
        #expect(item.rawURL == "https://www.example.com/cool-article")
        #expect(item.url != nil)
    }

    @Test func projectionFallsBackToHostWhenPathIsRoot() {
        let item = PendingSavedItem(pendingCapture: makeCapture(url: "https://news.ycombinator.com/"))

        #expect(item.host == "news.ycombinator.com")
        #expect(item.title == "news.ycombinator.com")
    }

    // MARK: - Persistence

    @Test func enqueueThenLoadReturnsNewestFirst() {
        let queue = makeQueue()
        queue.enqueue(url: "https://example.com/a", sourceName: "iPhone", captureChannel: "ios-app")
        queue.enqueue(url: "https://example.com/b", sourceName: nil, captureChannel: nil)

        let loaded = queue.load()
        #expect(loaded.map(\.url) == ["https://example.com/b", "https://example.com/a"])
        #expect(loaded.last?.sourceName == "iPhone")
        #expect(loaded.last?.captureChannel == "ios-app")
    }

    @Test func removeDropsMatchingCapture() {
        let queue = makeQueue()
        queue.enqueue(url: "https://example.com/a", sourceName: nil, captureChannel: nil)
        let id = queue.load().first!.id

        queue.remove(id: id)

        #expect(queue.load().isEmpty)
    }

    @Test func persistReplacesQueueContents() {
        let queue = makeQueue()
        queue.enqueue(url: "https://example.com/a", sourceName: nil, captureChannel: nil)

        queue.persist([])

        #expect(queue.load().isEmpty)
        #expect(queue.pendingSavedItems().isEmpty)
    }

    @Test func pendingSavedItemsProjectsEachCapture() {
        let queue = makeQueue()
        queue.enqueue(url: "https://www.example.com/x", sourceName: nil, captureChannel: nil)

        let items = queue.pendingSavedItems()
        #expect(items.count == 1)
        #expect(items.first?.title == "x")
    }

    @Test func queuesAreIsolatedPerUser() {
        let container = makeContainer()
        PendingCaptureQueue(userId: "user-1", store: makeStore(container)).enqueue(
            url: "https://example.com/a", sourceName: nil, captureChannel: nil
        )

        let otherUser = PendingCaptureQueue(userId: "user-2", store: makeStore(container))
        #expect(otherUser.load().isEmpty)
    }

    // MARK: - Helpers

    private func makeContainer() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
    }

    private func makeStore(_ container: URL) -> SleevyPendingCaptureStore {
        SleevyPendingCaptureStore(appGroupIdentifier: "group.test", containerURLOverride: container)
    }

    private func makeQueue(userId: String = "user-1") -> PendingCaptureQueue {
        PendingCaptureQueue(userId: userId, store: makeStore(makeContainer()))
    }

    private func makeCapture(url: String) -> SleevyPendingCapture {
        SleevyPendingCapture(
            id: UUID(),
            url: url,
            queuedAt: Date(timeIntervalSince1970: 1_700_000_000),
            sourceName: nil,
            captureChannel: nil
        )
    }
}
