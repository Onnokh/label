import Foundation

/// One queued read-state change awaiting sync to the server.
struct PendingReadStateUpdate: Codable, Equatable {
    let itemId: String
    let isRead: Bool
    let queuedAt: Date
}

/// Outcome of trying to push a read-state change while draining the queue.
enum PendingReadStateSyncError: LocalizedError {
    case retriable(String)
    case unretriable(String)

    var errorDescription: String? {
        switch self {
        case .retriable(let message), .unretriable(let message):
            return message
        }
    }
}

/// File-backed queue of read-state changes made while offline (or that failed to
/// sync), persisted in the app group so the app and share extension stay aligned.
///
/// Owns persistence, the optimistic overrides applied to freshly loaded items,
/// and the retry policy. The network submission and applying synced results to
/// the in-memory item list stay with `Library`, which drives the loop.
struct ReadStateQueue {
    let userId: String
    private let fileURL: URL?

    /// - Parameter containerURL: the directory the queue file lives under — the
    ///   app group container in production, a temp directory in tests.
    init(userId: String, containerURL: URL?) {
        self.userId = userId
        self.fileURL = containerURL?
            .appendingPathComponent("PendingReadStateUpdates", isDirectory: true)
            .appendingPathComponent("\(userId).json", isDirectory: false)
    }

    func all() -> [PendingReadStateUpdate] {
        guard
            let fileURL,
            let data = try? Data(contentsOf: fileURL),
            let updates = try? JSONDecoder.sharedISO8601.decode([PendingReadStateUpdate].self, from: data)
        else {
            return []
        }

        return updates
    }

    var hasPending: Bool {
        !all().isEmpty
    }

    func override(for itemId: String) -> Bool? {
        all().first(where: { $0.itemId == itemId })?.isRead
    }

    /// Applies any queued read state on top of `items`, leaving items with no
    /// pending change (or whose pending state already matches) untouched.
    func apply(to items: [SavedItem]) -> [SavedItem] {
        let pendingStates = Dictionary(
            uniqueKeysWithValues: all().map { ($0.itemId, $0.isRead) }
        )

        return items.map { item in
            guard let pendingIsRead = pendingStates[item.id], item.isRead != pendingIsRead else {
                return item
            }

            return item.withReadState(pendingIsRead)
        }
    }

    func enqueue(itemId: String, isRead: Bool) {
        var updates = all()
        updates.removeAll { $0.itemId == itemId }
        updates.append(
            PendingReadStateUpdate(
                itemId: itemId,
                isRead: isRead,
                queuedAt: Date()
            )
        )
        persist(updates)
    }

    func remove(itemId: String) {
        persist(all().filter { $0.itemId != itemId })
    }

    func persist(_ updates: [PendingReadStateUpdate]) {
        guard let fileURL else { return }

        do {
            try FileManager.default.createDirectory(
                at: fileURL.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )

            if updates.isEmpty {
                try? FileManager.default.removeItem(at: fileURL)
                return
            }

            let data = try JSONEncoder.sharedISO8601.encode(updates)
            try data.write(to: fileURL, options: .atomic)
        } catch {
            // Queue persistence is best-effort and should not break the main reading flow.
        }
    }

    func shouldRetry(after error: Error) -> Bool {
        if error is URLError {
            return true
        }

        if let authError = error as? AuthError {
            switch authError {
            case .sessionExpired:
                return false
            default:
                break
            }
        }

        if let syncError = error as? PendingReadStateSyncError {
            switch syncError {
            case .retriable:
                return true
            case .unretriable:
                return false
            }
        }

        return false
    }
}
