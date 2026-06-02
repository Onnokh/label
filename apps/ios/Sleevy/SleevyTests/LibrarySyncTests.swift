import Foundation
import Testing
@testable import Sleevy

/// Boundary tests for `Library`'s sync coordination, driven through an in-memory
/// `ReadingListNetworkPort` (no `URLProtocol`, no `URLSession`, no JSON) over the
/// real temp-directory file stores. These exercise retry classification and the
/// drain/reconcile behavior at the seam where the real bugs (e.g. a misclassified
/// error silently dropping a pending change) actually live.
@MainActor
struct LibrarySyncTests {

    // MARK: - Loading & capture

    @Test func loadPullsPersistsAndMarksReachable() async {
        let env = Environment()
        env.network.items["a"] = .fixture(id: "a", isRead: false)
        let library = env.makeLibrary()

        await library.load()

        #expect(library.savedItems().map(\.id) == ["a"])
        #expect(library.status.isAPIReachable)
        #expect(library.status.lastSuccessfulSyncAt != nil)
        #expect(env.cache.load()?.map(\.id) == ["a"]) // persisted through the cache
    }

    @Test func captureOnlineReturnsSavedItem() async throws {
        let env = Environment()
        let library = env.makeLibrary()

        let outcome = try await library.capture("https://example.com/x")

        guard case .saved = outcome else {
            Issue.record("expected .saved, got \(outcome)")
            return
        }
        #expect(library.savedItems().isEmpty == false)
        #expect(env.network.calls.contains("capture"))
    }

    @Test func captureWhileOfflineQueuesWithoutHittingNetwork() async throws {
        let env = Environment()
        let library = env.makeLibrary()
        env.connectivity.emit(false)

        let outcome = try await library.capture("https://example.com/x")

        #expect(outcome == .queued)
        #expect(library.pendingCaptureCount == 1)
        #expect(library.savedItems().isEmpty)
        #expect(env.network.calls.contains("capture") == false)
    }

    // MARK: - Optimism & draining

    @Test func offlineToggleAppliesImmediatelyAndIsQueued() async {
        let env = Environment()
        env.network.items["a"] = .fixture(id: "a", isRead: false)
        let library = env.makeLibrary()
        await library.load()
        env.connectivity.emit(false) // keep the toggle local — no reconciliation

        let item = library.savedItems().first!
        await library.setRead(item, isRead: true)

        #expect(library.savedItems().first?.isRead == true)    // applied immediately
        #expect(env.readState.all().count == 1)                 // queued, not sent
        #expect(env.network.calls.contains("setReadState") == false)
    }

    @Test func queuedReadStateDrainsAndIsConfirmed() async {
        let env = Environment()
        env.network.items["a"] = .fixture(id: "a", isRead: false)
        env.readState.enqueue(itemId: "a", isRead: true)
        let library = env.makeLibrary()

        await library.load() // pull applies the override, then sync drains it

        #expect(library.savedItems().first?.isRead == true)
        #expect(env.readState.all().isEmpty)                    // drained after the server confirmed
        #expect(env.network.items["a"]?.isRead == true)         // pushed to the "server"
        #expect(env.network.calls.contains("setReadState"))
    }

    // MARK: - The single retry authority

    /// The headline regression: a *permanent* failure must DROP the pending
    /// change, never silently retain it forever (and never lose it without a
    /// trace). This is the bug the three divergent `shouldRetry`s could produce.
    @Test func permanentFaultDropsPendingChange() async {
        let env = Environment()
        env.network.items["a"] = .fixture(id: "a", isRead: false)
        env.readState.enqueue(itemId: "a", isRead: true)
        let library = env.makeLibrary()
        env.network.faults["setReadState"] = .permanent(reason: "422 unprocessable")

        await library.refresh()

        #expect(env.readState.all().isEmpty)                    // dropped, not retained
    }

    /// A *transient* failure keeps the change queued for the next cycle.
    @Test func transientFaultKeepsChangeQueued() async {
        let env = Environment()
        env.network.items["a"] = .fixture(id: "a", isRead: false)
        env.readState.enqueue(itemId: "a", isRead: true)
        let library = env.makeLibrary()
        env.network.faults["setReadState"] = .transient(reason: "offline")

        await library.refresh()

        #expect(env.readState.all().count == 1)                 // still queued
    }

    /// An auth-invalid failure stops the cycle and signals sign-out.
    @Test func authInvalidFaultSignalsSignOut() async {
        let env = Environment()
        env.network.items["a"] = .fixture(id: "a", isRead: false)
        env.readState.enqueue(itemId: "a", isRead: true)
        let library = env.makeLibrary()
        var signedOut = false
        library.onAuthenticationInvalid = { _ in signedOut = true }
        env.network.faults["setReadState"] = .authInvalid(reason: "session expired")

        await library.refresh()

        #expect(signedOut)
    }

    // MARK: - Derived views from one canonical store

    @Test func readStateTogglePropagatesAcrossInboxAndFolder() async {
        let env = Environment()
        env.network.items["b"] = .fixture(id: "b", isRead: false, folderId: "f")
        let library = env.makeLibrary()
        await library.load()
        env.connectivity.emit(false)

        let item = library.savedItems().first!
        await library.setRead(item, isRead: true)

        #expect(library.savedItems(.all).first(where: { $0.id == "b" })?.isRead == true)
        #expect(library.savedItems(.folder("f")).first(where: { $0.id == "b" })?.isRead == true)
    }

    // MARK: - Environment

    private final class Environment {
        let network = InMemoryNetworkAdapter()
        let connectivity = StubConnectivityMonitor()
        let cache: SavedItemCache
        let readState: ReadStateQueue
        let captures: PendingCaptureQueue
        let statusDefaults: UserDefaults
        private let userId = "library-sync-test-user"

        @MainActor init() {
            let container = FileManager.default.temporaryDirectory
                .appendingPathComponent(UUID().uuidString, isDirectory: true)
            cache = SavedItemCache(userId: userId, directory: container, encoder: .sharedISO8601, decoder: .sharedISO8601)
            readState = ReadStateQueue(userId: userId, containerURL: container)
            captures = PendingCaptureQueue(
                userId: userId,
                store: SleevyPendingCaptureStore(appGroupIdentifier: "group.test", containerURLOverride: container)
            )
            statusDefaults = UserDefaults(suiteName: "library-sync-test-\(UUID().uuidString)")!
        }

        @MainActor func makeLibrary() -> Library {
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
}

// MARK: - In-memory network adapter

@MainActor
final class InMemoryNetworkAdapter: ReadingListNetworkPort {
    var items: [String: SavedItem] = [:]
    var folders: [String: Folder] = [:]
    /// A fault armed per verb name; consumed on the next call to that verb.
    var faults: [String: SyncFault] = [:]
    private(set) var calls: [String] = []

    private func record(_ verb: String) throws(SyncFault) {
        calls.append(verb)
        if let fault = faults.removeValue(forKey: verb) { throw fault }
    }

    func loadSavedItems() async throws(SyncFault) -> [SavedItem] {
        try record("loadSavedItems")
        return Array(items.values)
    }

    func loadFolders() async throws(SyncFault) -> [Folder] {
        try record("loadFolders")
        return Array(folders.values)
    }

    func capture(url: String, sourceName: String?, captureChannel: String?) async throws(SyncFault) -> SavedItem {
        try record("capture")
        let item = SavedItem.fixture(id: "captured-\(items.count)", isRead: false, url: url)
        items[item.id] = item
        return item
    }

    func setReadState(itemId: String, isRead: Bool) async throws(SyncFault) -> SavedItem {
        try record("setReadState")
        let updated = (items[itemId] ?? .fixture(id: itemId, isRead: !isRead)).withReadState(isRead)
        items[itemId] = updated
        return updated
    }

    func markOpened(itemId: String) async throws(SyncFault) -> SavedItem {
        try record("markOpened")
        let updated = (items[itemId] ?? .fixture(id: itemId, isRead: false)).withReadState(true)
        items[itemId] = updated
        return updated
    }

    func deleteItem(itemId: String) async throws(SyncFault) {
        try record("deleteItem")
        items[itemId] = nil
    }

    func createFolder(name: String, emoji: String?, color: String?) async throws(SyncFault) -> Folder {
        try record("createFolder")
        let folder = Folder(id: "folder-\(folders.count)", name: name, emoji: emoji, color: color)
        folders[folder.id] = folder
        return folder
    }

    func renameFolder(id: String, name: String, emoji: String?, color: String?) async throws(SyncFault) -> Folder {
        try record("renameFolder")
        let folder = Folder(id: id, name: name, emoji: emoji, color: color)
        folders[id] = folder
        return folder
    }

    func deleteFolder(id: String) async throws(SyncFault) {
        try record("deleteFolder")
        folders[id] = nil
    }

    func moveItem(id: String, toFolder folderId: String?) async throws(SyncFault) -> SavedItem {
        try record("moveItem")
        let summary = folderId.flatMap { fid in folders[fid] }.map {
            FolderSummary(id: $0.id, name: $0.name, emoji: $0.emoji, color: $0.color)
        }
        let updated = (items[id] ?? .fixture(id: id, isRead: false)).withFolder(summary)
        items[id] = updated
        return updated
    }
}

/// Captures the library's connectivity callback so a test can drive reachability
/// deterministically, with no live `NWPathMonitor`.
final class StubConnectivityMonitor: ConnectivityMonitoring {
    private var onChange: (@MainActor (Bool) -> Void)?

    func start(onChange: @escaping @MainActor (Bool) -> Void) {
        self.onChange = onChange
    }

    @MainActor func emit(_ isOnline: Bool) {
        onChange?(isOnline)
    }
}

// MARK: - Fixture

extension SavedItem {
    static func fixture(id: String, isRead: Bool, folderId: String? = nil, url: String? = nil) -> SavedItem {
        SavedItem(
            id: id,
            originalURL: url ?? "https://example.com/\(id)",
            normalizedURL: url ?? "https://example.com/\(id)",
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
            folder: folderId.map { FolderSummary(id: $0, name: "Work", emoji: nil, color: nil) },
            isRead: isRead,
            lastSavedAt: Date(timeIntervalSince1970: 1_700_000_000),
            createdAt: Date(timeIntervalSince1970: 1_700_000_000),
            updatedAt: Date(timeIntervalSince1970: 1_700_000_000)
        )
    }
}
