import Foundation

/// Production `ReadingListNetworkPort`: wraps `SleevyAPIClient` and maps every
/// error it can throw — `URLError`, `DecodingError`, `AuthError`, `APIError`,
/// `PendingReadStateSyncError`, `SleevyCaptureError` — into a single `SyncFault`.
///
/// This is the one place the transport's error taxonomy lives. The three
/// scattered `shouldRetry(after:)` policies (formerly in `SleevyAPIClient`,
/// `ReadStateQueue`, and `PendingCaptureQueue`) collapse into `fault(from:)`
/// here; the engine then makes the retain/drop/sign-out decision from the fault.
/// Token rotation stays inside `SleevyAPIClient`/`SessionTokenStore`, so the
/// engine never sees a bearer token.
struct HTTPReadingListAdapter: ReadingListNetworkPort {
    private let api: SleevyAPIClient

    init(api: SleevyAPIClient) {
        self.api = api
    }

    func loadSavedItems() async throws(SyncFault) -> [SavedItem] {
        do { return try await api.loadSavedItems() } catch { throw Self.fault(from: error) }
    }

    func loadFolders() async throws(SyncFault) -> [Folder] {
        do { return try await api.loadFolders() } catch { throw Self.fault(from: error) }
    }

    func capture(url: String, sourceName: String?, captureChannel: String?) async throws(SyncFault) -> SavedItem {
        do { return try await api.capture(url: url, sourceName: sourceName, captureChannel: captureChannel) }
        catch { throw Self.fault(from: error) }
    }

    func setReadState(itemId: String, isRead: Bool) async throws(SyncFault) -> SavedItem {
        do { return try await api.setReadState(itemId: itemId, isRead: isRead) } catch { throw Self.fault(from: error) }
    }

    func markOpened(itemId: String) async throws(SyncFault) -> SavedItem {
        do { return try await api.markOpened(id: itemId) } catch { throw Self.fault(from: error) }
    }

    func deleteItem(itemId: String) async throws(SyncFault) {
        do { try await api.deleteItem(id: itemId) } catch { throw Self.fault(from: error) }
    }

    func createFolder(name: String, emoji: String?, color: String?) async throws(SyncFault) -> Folder {
        do { return try await api.createFolder(name: name, emoji: emoji, color: color) } catch { throw Self.fault(from: error) }
    }

    func renameFolder(id: String, name: String, emoji: String?, color: String?) async throws(SyncFault) -> Folder {
        do { return try await api.renameFolder(id: id, name: name, emoji: emoji, color: color) }
        catch { throw Self.fault(from: error) }
    }

    func deleteFolder(id: String) async throws(SyncFault) {
        do { try await api.deleteFolder(id: id) } catch { throw Self.fault(from: error) }
    }

    func moveItem(id: String, toFolder folderId: String?) async throws(SyncFault) -> SavedItem {
        do { return try await api.moveItem(id: id, toFolder: folderId) } catch { throw Self.fault(from: error) }
    }

    /// The single transport-error → `SyncFault` map. Preserves the per-endpoint
    /// retriability the underlying client already encodes in its error *types*:
    /// `429`/`5xx` arrive as `.temporarilyUnavailable`/`.retriable` (→
    /// `.transient`), permanent rejections as `.failed`/`.unretriable` (→
    /// `.permanent`), and `401`/`403` as `.sessionExpired` (→ `.authInvalid`).
    static func fault(from error: Error) -> SyncFault {
        switch error {
        case let urlError as URLError:
            // Offline transport failures are suppressed in the UI (empty reason);
            // resolvable-host failures carry a diagnostic message.
            if AppConfig.isOfflineNetworkError(urlError) {
                return .transient(reason: "")
            }
            return .transient(reason: AppConfig.userFacingNetworkMessage(for: urlError) ?? urlError.localizedDescription)

        case let authError as AuthError:
            switch authError {
            case .sessionExpired:
                return .authInvalid(reason: authError.localizedDescription)
            case .invalidServerResponse:
                return .transient(reason: authError.localizedDescription)
            case .authenticationFailed(let message):
                return .permanent(reason: message)
            default:
                return .permanent(reason: authError.localizedDescription)
            }

        case is APIError:
            return .unreachable(reason: "The Sleevy API is unreachable right now.")

        case let syncError as PendingReadStateSyncError:
            switch syncError {
            case .retriable(let message):
                return .transient(reason: message)
            case .unretriable(let message):
                return .permanent(reason: message)
            }

        case let captureError as SleevyCaptureError:
            switch captureError {
            case .sessionExpired:
                return .authInvalid(reason: captureError.localizedDescription)
            case .temporarilyUnavailable(let message):
                return .transient(reason: message)
            case .invalidServerResponse:
                return .transient(reason: captureError.localizedDescription)
            case .failed(let message):
                return .permanent(reason: message)
            }

        default:
            // Only an explicit server rejection is safe to drop. An unknown
            // failure may clear on a later build or response, so keep the work.
            return .transient(reason: error.localizedDescription)
        }
    }
}
