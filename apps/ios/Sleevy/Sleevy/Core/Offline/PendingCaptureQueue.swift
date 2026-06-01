import Foundation

/// File-backed queue of captures made while offline (or that failed to sync),
/// persisted in the app group via `SleevyPendingCaptureStore` so the app and the
/// share extension stay aligned.
///
/// Owns the user-scoped queue operations, the `PendingSavedItem` projection the
/// inbox renders, and the retry policy. The network submission and applying
/// synced results stay with `ReadingListStore`, which drives the drain loop.
struct PendingCaptureQueue {
    let userId: String
    private let store: SleevyPendingCaptureStore

    init(userId: String, store: SleevyPendingCaptureStore) {
        self.userId = userId
        self.store = store
    }

    func load() -> [SleevyPendingCapture] {
        store.load(for: userId)
    }

    func pendingSavedItems() -> [PendingSavedItem] {
        load().map(PendingSavedItem.init)
    }

    func enqueue(url: String, sourceName: String?, captureChannel: String?) {
        try? store.enqueue(url: url, for: userId, sourceName: sourceName, captureChannel: captureChannel)
    }

    func remove(id: UUID) {
        store.remove(id: id, for: userId)
    }

    func persist(_ captures: [SleevyPendingCapture]) {
        try? store.persist(captures, for: userId)
    }

    func shouldRetry(after error: Error) -> Bool {
        if error is URLError {
            return true
        }

        if let captureError = error as? SleevyCaptureError {
            switch captureError {
            case .temporarilyUnavailable:
                return true
            case .sessionExpired:
                return false
            case .invalidServerResponse:
                return true
            case .failed:
                return false
            }
        }

        if let authError = error as? AuthError {
            switch authError {
            case .sessionExpired:
                return false
            default:
                break
            }
        }

        return false
    }
}

/// The inbox's projection of a queued capture, with a best-effort host/title
/// derived from the raw URL for display before the server enriches it.
struct PendingSavedItem: Identifiable, Equatable {
    let id: UUID
    let url: URL?
    let rawURL: String
    let host: String
    let title: String
    let queuedAt: Date

    init(pendingCapture: SleevyPendingCapture) {
        let resolvedURL = URL(string: pendingCapture.url)
        let sanitizedHost = resolvedURL?.host?
            .replacingOccurrences(of: #"^www\."#, with: "", options: .regularExpression)
        let trimmedURL = pendingCapture.url.trimmingCharacters(in: .whitespacesAndNewlines)
        let lastPathComponent = resolvedURL?.lastPathComponent.trimmingCharacters(in: .whitespacesAndNewlines)
        let preferredTitle: String

        if let lastPathComponent, !lastPathComponent.isEmpty, lastPathComponent != "/" {
            preferredTitle = lastPathComponent
        } else if let sanitizedHost, !sanitizedHost.isEmpty {
            preferredTitle = sanitizedHost
        } else {
            preferredTitle = trimmedURL
        }

        self.id = pendingCapture.id
        self.url = resolvedURL
        self.rawURL = pendingCapture.url
        self.host = (sanitizedHost?.isEmpty == false ? sanitizedHost : nil) ?? trimmedURL
        self.title = preferredTitle
        self.queuedAt = pendingCapture.queuedAt
    }
}
