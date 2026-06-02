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

    @Test func storeReflectsConnectivityTransitions() {
        let monitor = StubConnectivityMonitor()
        let store = Library(session: makeSession(), connectivityMonitor: monitor)

        #expect(store.isOnline == true) // default before any path update

        monitor.emit(false)
        #expect(store.isOnline == false)

        monitor.emit(true)
        #expect(store.isOnline == true)
    }

    private func makeSession() -> AppSession {
        AppSession(token: "t", userId: "connectivity-test-user", email: "a@b.c", name: "Tester", provider: nil)
    }
}
