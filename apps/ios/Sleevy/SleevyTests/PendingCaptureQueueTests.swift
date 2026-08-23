import Foundation
import os
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

    @Test func enqueueThenLoadReturnsNewestFirst() throws {
        let queue = makeQueue()
        try queue.enqueue(url: "https://example.com/a", sourceName: "iPhone", captureChannel: "ios-app")
        try queue.enqueue(url: "https://example.com/b", sourceName: nil, captureChannel: nil)

        let loaded = try queue.load()
        #expect(loaded.map(\.url) == ["https://example.com/b", "https://example.com/a"])
        #expect(loaded.last?.sourceName == "iPhone")
        #expect(loaded.last?.captureChannel == "ios-app")
    }

    @Test func removeDropsMatchingCapture() throws {
        let queue = makeQueue()
        try queue.enqueue(url: "https://example.com/a", sourceName: nil, captureChannel: nil)
        let id = try queue.load().first!.id

        try queue.remove(id: id)

        #expect(try queue.load().isEmpty)
    }

    @Test func removeProcessedDropsOnlyTheGivenIdsAndKeepsTheRest() throws {
        let queue = makeQueue()
        try queue.enqueue(url: "https://example.com/a", sourceName: nil, captureChannel: nil)
        try queue.enqueue(url: "https://example.com/b", sourceName: nil, captureChannel: nil)
        let processedId = try queue.load().first(where: { $0.url == "https://example.com/a" })!.id

        try queue.removeProcessed(ids: [processedId])

        let urls = try queue.load().map(\.url)
        #expect(urls == ["https://example.com/b"]) // "a" dropped, "b" preserved
    }

    @Test func persistReplacesQueueContents() throws {
        let queue = makeQueue()
        try queue.enqueue(url: "https://example.com/a", sourceName: nil, captureChannel: nil)

        try queue.persist([])

        #expect(try queue.load().isEmpty)
        #expect(try queue.pendingSavedItems().isEmpty)
    }

    @Test func pendingSavedItemsProjectsEachCapture() throws {
        let queue = makeQueue()
        try queue.enqueue(url: "https://www.example.com/x", sourceName: nil, captureChannel: nil)

        let items = try queue.pendingSavedItems()
        #expect(items.count == 1)
        #expect(items.first?.title == "x")
    }

    @Test func queuesAreIsolatedPerUser() throws {
        let container = makeContainer()
        try PendingCaptureQueue(userId: "user-1", store: makeStore(container)).enqueue(
            url: "https://example.com/a", sourceName: nil, captureChannel: nil
        )

        let otherUser = PendingCaptureQueue(userId: "user-2", store: makeStore(container))
        #expect(try otherUser.load().isEmpty)
    }

    @Test func enqueueSurfacesPersistenceFailure() throws {
        let container = makeContainer()
        try Data("not a directory".utf8).write(to: container)
        let queue = PendingCaptureQueue(userId: "user-1", store: makeStore(container))

        #expect(throws: SleevyPendingCaptureStoreError.self) {
            try queue.enqueue(url: "https://example.com/a", sourceName: nil, captureChannel: nil)
        }
    }

    @Test func corruptQueueIsNotOverwrittenByASecondEnqueue() throws {
        let container = makeContainer()
        let queueDirectory = container.appendingPathComponent("PendingCaptures", isDirectory: true)
        try FileManager.default.createDirectory(at: queueDirectory, withIntermediateDirectories: true)
        let queueFile = queueDirectory.appendingPathComponent("user-1.json")
        let corruptData = Data("not json".utf8)
        try corruptData.write(to: queueFile)

        let queue = PendingCaptureQueue(userId: "user-1", store: makeStore(container))
        #expect(throws: SleevyPendingCaptureStoreError.self) {
            try queue.enqueue(url: "https://example.com/a", sourceName: nil, captureChannel: nil)
        }
        #expect(try Data(contentsOf: queueFile) == corruptData)
    }

    @Test func concurrentStoreInstancesPreserveEveryEnqueue() throws {
        let container = makeContainer()
        let first = makeStore(container)
        let second = makeStore(container)
        let failures = OSAllocatedUnfairLock(initialState: [String]())

        DispatchQueue.concurrentPerform(iterations: 40) { index in
            do {
                let store = index.isMultiple(of: 2) ? first : second
                try store.enqueue(
                    url: "https://example.com/\(index)",
                    for: "user-1",
                    sourceName: nil,
                    captureChannel: nil
                )
            } catch {
                failures.withLock { $0.append(error.localizedDescription) }
            }
        }

        #expect(failures.withLock { $0.isEmpty })
        let loaded = try first.load(for: "user-1")
        #expect(loaded.count == 40)
        #expect(Set(loaded.map(\.url)).count == 40)
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
