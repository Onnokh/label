import Foundation

nonisolated enum SavedItemFetchRequest: Hashable, Sendable {
    case completeLibrary
    case libraryRoot
    case folder(String)
}

/// The reading-list verbs `Library` needs, expressed in domain terms. The
/// production adapter (`HTTPReadingListAdapter`) wraps `SleevyAPIClient` and maps
/// its errors into `SyncFault`; the test adapter is an in-memory dictionary.
///
/// Every verb fails with a typed `SyncFault` so the coordinator can classify in
/// one place — an adapter physically cannot leak an unclassified `Error`. HTTP
/// status codes and `URLError`s never cross this boundary, and token rotation is
/// internal to the adapter, so the coordinator never sees a bearer token.
@MainActor
protocol ReadingListNetworkPort {
    func loadSavedItems(_ request: SavedItemFetchRequest) async throws(SyncFault) -> [SavedItem]
    func loadFolders() async throws(SyncFault) -> [Folder]

    func capture(url: String, sourceName: String?, captureChannel: String?) async throws(SyncFault) -> SavedItem
    func setReadState(itemId: String, isRead: Bool) async throws(SyncFault) -> SavedItem
    func markOpened(itemId: String) async throws(SyncFault) -> SavedItem
    func deleteItem(itemId: String) async throws(SyncFault)

    func createFolder(name: String, emoji: String?, color: String?) async throws(SyncFault) -> Folder
    func renameFolder(id: String, name: String, emoji: String?, color: String?) async throws(SyncFault) -> Folder
    func deleteFolder(id: String) async throws(SyncFault)
    func moveItem(id: String, toFolder folderId: String?) async throws(SyncFault) -> SavedItem
}
