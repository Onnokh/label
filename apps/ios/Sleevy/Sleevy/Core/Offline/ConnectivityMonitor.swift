import Network

/// Reports network reachability transitions. Abstracted behind a protocol so the
/// store can be driven with a fake in tests instead of a live `NWPathMonitor`.
protocol ConnectivityMonitoring {
    /// Starts monitoring. `onChange` is invoked on the main actor with the latest
    /// reachability whenever the network path changes.
    func start(onChange: @escaping @MainActor (Bool) -> Void)
}

/// Production `ConnectivityMonitoring` backed by `NWPathMonitor`.
nonisolated final class LiveConnectivityMonitor: ConnectivityMonitoring {
    private let pathMonitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "app.sleevy.ConnectivityMonitor")

    func start(onChange: @escaping @MainActor (Bool) -> Void) {
        pathMonitor.pathUpdateHandler = { path in
            let isOnline = path.status == .satisfied
            Task { @MainActor in
                onChange(isOnline)
            }
        }
        pathMonitor.start(queue: queue)
    }

    deinit {
        pathMonitor.cancel()
    }
}
