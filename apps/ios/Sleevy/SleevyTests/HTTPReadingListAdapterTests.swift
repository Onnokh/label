import Foundation
import Testing
@testable import Sleevy

/// Tests the single transport-error → `SyncFault` mapping. This is the one place
/// the retry taxonomy lives now (formerly three divergent `shouldRetry`s), so it
/// is the highest-value thing to pin down: a misclassification here is what could
/// silently drop a user's pending change.
struct HTTPReadingListAdapterTests {

    @Test func offlineURLErrorsAreSuppressedTransient() {
        for code: URLError.Code in [.notConnectedToInternet, .networkConnectionLost, .timedOut] {
            #expect(HTTPReadingListAdapter.fault(from: URLError(code)) == .transient(reason: ""))
        }
    }

    @Test func resolvableHostURLErrorCarriesADiagnostic() {
        let fault = HTTPReadingListAdapter.fault(from: URLError(.cannotFindHost))
        guard case .transient(let reason) = fault else {
            Issue.record("expected .transient, got \(fault)")
            return
        }
        #expect(reason.isEmpty == false)
    }

    @Test func authErrorsClassify() {
        #expect(HTTPReadingListAdapter.fault(from: AuthError.sessionExpired) == .authInvalid(reason: AuthError.sessionExpired.localizedDescription))
        #expect(HTTPReadingListAdapter.fault(from: AuthError.authenticationFailed("nope")) == .permanent(reason: "nope"))
        #expect(HTTPReadingListAdapter.fault(from: AuthError.invalidServerResponse) == .transient(reason: AuthError.invalidServerResponse.localizedDescription))
    }

    @Test func malformedSuccessfulResponseIsTransient() {
        let error = DecodingError.dataCorrupted(
            .init(codingPath: [], debugDescription: "malformed 2xx response")
        )

        guard case .transient = HTTPReadingListAdapter.fault(from: error) else {
            Issue.record("expected malformed response to remain retriable")
            return
        }
    }

    @Test func unknownErrorsAreTransient() {
        let error = NSError(domain: "HTTPReadingListAdapterTests", code: 1)

        guard case .transient = HTTPReadingListAdapter.fault(from: error) else {
            Issue.record("expected unknown error to remain retriable")
            return
        }
    }

    @Test func apiUnreachableMapsToUnreachable() {
        guard case .unreachable = HTTPReadingListAdapter.fault(from: APIError.unreachable) else {
            Issue.record("expected .unreachable")
            return
        }
    }

    @Test func readStateSyncErrorsSplitRetriability() {
        #expect(HTTPReadingListAdapter.fault(from: PendingReadStateSyncError.retriable("busy")) == .transient(reason: "busy"))
        #expect(HTTPReadingListAdapter.fault(from: PendingReadStateSyncError.unretriable("bad")) == .permanent(reason: "bad"))
    }

    @Test func captureErrorsSplitRetriability() {
        #expect(HTTPReadingListAdapter.fault(from: SleevyCaptureError.sessionExpired) == .authInvalid(reason: SleevyCaptureError.sessionExpired.localizedDescription))
        #expect(HTTPReadingListAdapter.fault(from: SleevyCaptureError.temporarilyUnavailable("later")) == .transient(reason: "later"))
        #expect(HTTPReadingListAdapter.fault(from: SleevyCaptureError.invalidServerResponse) == .transient(reason: SleevyCaptureError.invalidServerResponse.localizedDescription))
        #expect(HTTPReadingListAdapter.fault(from: SleevyCaptureError.failed("dead")) == .permanent(reason: "dead"))
    }
}
