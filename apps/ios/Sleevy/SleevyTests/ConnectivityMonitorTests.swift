import Foundation
import Testing
@testable import Sleevy

@MainActor
struct ConnectivityMonitorTests {

    /// Test double that captures the store's callback so the test can drive
    /// reachability transitions deterministically, with no live NWPathMonitor.
    nonisolated final class StubConnectivityMonitor: ConnectivityMonitoring {
        private var onChange: (@MainActor (Bool) -> Void)?

        func start(onChange: @escaping @MainActor (Bool) -> Void) {
            self.onChange = onChange
        }

        @MainActor func emit(_ isOnline: Bool) {
            onChange?(isOnline)
        }
    }

    @Test func storeReflectsConnectivityTransitions() async {
        let monitor = StubConnectivityMonitor()
        let container = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        let userId = "connectivity-test-user"
        let store = ReadingListStore(
            userId: userId,
            network: InMemoryNetworkAdapter(),
            cache: RetrievalIndexCache(
                userId: userId,
                directory: container,
                encoder: .sharedISO8601,
                decoder: .sharedISO8601
            ),
            readStateQueue: ReadStateQueue(userId: userId, containerURL: container),
            pendingCaptureQueue: PendingCaptureQueue(
                userId: userId,
                store: SleevyPendingCaptureStore(
                    appGroupIdentifier: "group.test",
                    containerURLOverride: container
                )
            ),
            statusDefaults: UserDefaults(suiteName: "connectivity-test-\(UUID().uuidString)")!,
            connectivity: monitor
        )
        await store.loadIfNeeded()

        #expect(store.isOnline == true) // default before any path update

        monitor.emit(false)
        #expect(store.isOnline == false)

        monitor.emit(true)
        #expect(store.isOnline == true)
    }

}
