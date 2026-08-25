import Foundation

/// The `ReadingListNetworkPort` used in marketing-capture mode: it answers
/// every reading-list verb from `DemoMode` fixtures held in memory, so the
/// screenshot run never touches the API or a real account.
///
/// Mutations are honoured against the in-memory copy rather than rejected, so
/// a capture script can still drive the UI (toggle a read state, move an item)
/// and see the list react the way it would in production.
@MainActor
final class DemoReadingListAdapter: ReadingListNetworkPort {
    private var items: [SavedItem]
    private var folders: [Folder]

    init(items: [SavedItem] = DemoMode.savedItems, folders: [Folder] = DemoMode.folders) {
        self.items = items
        self.folders = folders
    }

    func loadSavedItems(_ request: SavedItemFetchRequest) async throws(SyncFault) -> [SavedItem] {
        switch request {
        case .completeLibrary:
            return items
        case .libraryRoot:
            return items.filter { $0.folder == nil }
        case .folder(let id):
            return items.filter { $0.folder?.id == id }
        }
    }

    func loadFolders() async throws(SyncFault) -> [Folder] {
        folders
    }

    func capture(url: String, sourceName: String?, captureChannel: String?) async throws(SyncFault) -> SavedItem {
        let host = URL(string: url)?.host ?? "example.com"
        let captured = SavedItem(
            id: "demo-capture-\(UUID().uuidString)",
            originalURL: url,
            normalizedURL: url,
            host: host,
            title: host,
            description: nil,
            siteName: host,
            faviconURL: "https://icons.duckduckgo.com/ip3/\(host).ico",
            faviconLightURL: nil,
            faviconDarkURL: nil,
            canonicalURL: url,
            previewSummary: nil,
            type: "article",
            tags: [],
            enrichmentStatus: .pending,
            sourceName: sourceName,
            captureChannel: captureChannel,
            folder: nil,
            isRead: false,
            lastSavedAt: Date(),
            createdAt: Date(),
            updatedAt: Date()
        )
        items.insert(captured, at: 0)
        return captured
    }

    func setReadState(itemId: String, isRead: Bool) async throws(SyncFault) -> SavedItem {
        try update(itemId) { $0.isRead = isRead }
    }

    func markOpened(itemId: String) async throws(SyncFault) -> SavedItem {
        try update(itemId) { $0.isRead = true }
    }

    func deleteItem(itemId: String) async throws(SyncFault) {
        items.removeAll { $0.id == itemId }
    }

    func createFolder(name: String, emoji: String?, color: String?) async throws(SyncFault) -> Folder {
        let folder = Folder(id: "demo-folder-\(UUID().uuidString)", name: name, emoji: emoji, color: color)
        folders.append(folder)
        return folder
    }

    func renameFolder(id: String, name: String, emoji: String?, color: String?) async throws(SyncFault) -> Folder {
        try updateFolder(id) {
            Folder(id: $0.id, name: name, emoji: emoji, color: color, isPublished: $0.isPublished)
        }
    }

    func setFolderPublished(id: String, isPublished: Bool) async throws(SyncFault) -> Folder {
        try updateFolder(id) {
            Folder(id: $0.id, name: $0.name, emoji: $0.emoji, color: $0.color, isPublished: isPublished)
        }
    }

    func deleteFolder(id: String) async throws(SyncFault) {
        folders.removeAll { $0.id == id }
        for index in items.indices where items[index].folder?.id == id {
            items[index].folder = nil
        }
    }

    func moveItem(id: String, toFolder folderId: String?) async throws(SyncFault) -> SavedItem {
        let destination = folders.first { $0.id == folderId }.map {
            FolderSummary(id: $0.id, name: $0.name, emoji: $0.emoji, color: $0.color)
        }
        return try update(id) { $0.folder = destination }
    }

    // MARK: - In-memory mutation

    private func update(_ itemId: String, _ change: (inout SavedItem) -> Void) throws(SyncFault) -> SavedItem {
        guard let index = items.firstIndex(where: { $0.id == itemId }) else {
            throw SyncFault.permanent(reason: "No demo Saved Item with id \(itemId).")
        }
        change(&items[index])
        items[index].updatedAt = Date()
        return items[index]
    }

    private func updateFolder(_ id: String, _ change: (Folder) -> Folder) throws(SyncFault) -> Folder {
        guard let index = folders.firstIndex(where: { $0.id == id }) else {
            throw SyncFault.permanent(reason: "No demo Folder with id \(id).")
        }
        folders[index] = change(folders[index])
        return folders[index]
    }
}
