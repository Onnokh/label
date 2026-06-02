import Foundation

/// One value carrying everything the status chrome needs, so views observe a
/// single property instead of five separate booleans/strings. Replaces the
/// scattered `isLoading` / `isOnline` / `isAPIReachable` / `lastSuccessfulSyncAt`
/// / `errorMessage` flags the store used to expose individually.
struct SyncStatus: Equatable {
    /// Network reachability, as reported by the connectivity monitor.
    var isOnline = true
    /// Whether the last attempt to reach the API actually got the API (vs. a
    /// proxy/CDN error page or a transport failure).
    var isAPIReachable = true
    /// Drives the full-screen spinner: true only during the very first fetch,
    /// when there is nothing to show yet.
    var isInitialLoad = false
    /// Timestamp of the last fully successful pull.
    var lastSuccessfulSyncAt: Date?
    /// A transient, user-facing message for a request error (capture/read/pull).
    var errorMessage: String?
    /// A user-facing message for a folder (library) error, surfaced separately so
    /// a folder-endpoint failure doesn't blank the whole inbox.
    var libraryErrorMessage: String?
}
