import Foundation

/// The single, transport-agnostic outcome every reading-list network operation
/// fails with. Adapters map their world — HTTP status codes, `URLError`s, decode
/// failures, domain errors — *into* one of these cases; they do **not** decide
/// what to do about it. `ReadingListStore` classifies a `SyncFault` into a sync
/// disposition in exactly one place (`classify(_:)`), which is what
/// makes "should I re-queue this?" have a single answer.
///
/// This replaces the three divergent `shouldRetry(after:)` implementations that
/// previously lived in `SleevyAPIClient`, `ReadStateQueue`, and
/// `PendingCaptureQueue` — where a misclassified error could silently drop a
/// user's pending change.
enum SyncFault: Error, Equatable {
    /// A self-resolving failure worth keeping queued and retrying later: offline,
    /// a timeout, `429`, `5xx`, or an unparseable response. Maps from `URLError`,
    /// `429`/`5xx`, and invalid-response decode failures.
    case transient(reason: String)

    /// The API surface is reachable but answered with something that isn't the
    /// API (e.g. an HTML proxy/CDN error page). Retriable like `.transient`, but
    /// kept distinct so the engine can flip `isAPIReachable` precisely rather
    /// than conflating "device offline" with "proxy is up but returning junk".
    case unreachable(reason: String)

    /// A definitive rejection the server will keep rejecting (`400`/`404`/`409`/
    /// `422`, a malformed request). The pending change is dropped — retrying it
    /// would never succeed.
    case permanent(reason: String)

    /// The bearer token is no longer valid (`401`/`403`). Draining stops and the
    /// session is invalidated.
    case authInvalid(reason: String)

    /// The human-facing reason carried by every case.
    var reason: String {
        switch self {
        case let .transient(reason),
             let .unreachable(reason),
             let .permanent(reason),
             let .authInvalid(reason):
            return reason
        }
    }
}
