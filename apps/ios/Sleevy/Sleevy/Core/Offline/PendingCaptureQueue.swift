import Foundation

/// File-backed queue of captures made while offline (or that failed to sync),
/// persisted in the app group via `SleevyPendingCaptureStore` so the app and the
/// share extension stay aligned.
///
/// Owns the user-scoped queue operations and the `PendingSavedItem` projection
/// the inbox renders. Retry classification lives in one place
/// (`HTTPReadingListAdapter` → `SyncFault` → `ReadingListStore`); the network submission
/// and applying synced results stay with `ReadingListStore`.
struct PendingCaptureQueue {
    let userId: String
    private let store: SleevyPendingCaptureStore

    init(userId: String, store: SleevyPendingCaptureStore) {
        self.userId = userId
        self.store = store
    }

    func load() throws -> [SleevyPendingCapture] {
        try store.load(for: userId)
    }

    func pendingSavedItems() throws -> [PendingSavedItem] {
        try load().map(PendingSavedItem.init)
    }

    func enqueue(url: String, sourceName: String?, captureChannel: String?) throws {
        try store.enqueue(url: url, for: userId, sourceName: sourceName, captureChannel: captureChannel)
    }

    func remove(id: UUID) throws {
        try store.remove(id: id, for: userId)
    }

    /// Removes confirmed captures without dropping captures added during a drain.
    func removeProcessed(ids: Set<UUID>) throws {
        try store.removeProcessed(ids: ids, for: userId)
    }

    func persist(_ captures: [SleevyPendingCapture]) throws {
        try store.persist(captures, for: userId)
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
