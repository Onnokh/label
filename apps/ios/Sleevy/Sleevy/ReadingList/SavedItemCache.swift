import Foundation

/// On-disk cache of the inbox's saved items so the list renders instantly on
/// launch, before the network refresh completes.
///
/// Stored under a per-user file. Reads and writes are best-effort: a failure
/// simply falls back to network-backed loading.
struct SavedItemCache {
    private let fileURL: URL
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    /// - Parameter directory: the base directory the cache lives under —
    ///   Application Support in production, a temp directory in tests.
    init(userId: String, directory: URL, encoder: JSONEncoder, decoder: JSONDecoder) {
        self.fileURL = directory
            .appendingPathComponent("ReadingListCache", isDirectory: true)
            .appendingPathComponent("\(userId).json", isDirectory: false)
        self.encoder = encoder
        self.decoder = decoder
    }

    func load() -> [SavedItem]? {
        guard
            let data = try? Data(contentsOf: fileURL),
            let cachedItems = try? decoder.decode([SavedItem].self, from: data)
        else {
            return nil
        }

        return cachedItems
    }

    func save(_ items: [SavedItem]) {
        do {
            try FileManager.default.createDirectory(
                at: fileURL.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )

            let data = try encoder.encode(items)
            try data.write(to: fileURL, options: .atomic)
        } catch {
            // Cache writes are best-effort so network-backed usage still works.
        }
    }
}
