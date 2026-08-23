import Foundation

/// A Retrieval Index restored through Cached Viewing.
nonisolated struct CachedRetrievalIndex: Equatable, Sendable {
    let index: RetrievalIndex
    let storedCoverage: RetrievalCoverage
    let savedAt: Date
    let scopeUpdatedAt: Date
}

/// Per-Account disk cache for the canonical Retrieval Index.
///
/// The actor keeps file and JSON work off `ReadingListStore`'s MainActor. Reads and
/// writes are best-effort, so Cached Viewing never blocks network-backed use.
actor RetrievalIndexCache {
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

    func load() -> CachedRetrievalIndex? {
        guard let data = try? Data(contentsOf: fileURL) else { return nil }

        if let envelope = try? decoder.decode(Envelope.self, from: data) {
            guard envelope.version == Envelope.currentVersion else { return nil }
            return envelope.cachedIndex
        }

        guard let items = try? decoder.decode([SavedItem].self, from: data) else {
            return nil
        }

        let timestamp = modificationDate ?? Date()
        let cached = CachedRetrievalIndex(
            index: RetrievalIndex(globalItems: items, globalCoverage: .cached),
            storedCoverage: .cached,
            savedAt: timestamp,
            scopeUpdatedAt: timestamp
        )
        save(cached.index, savedAt: timestamp, scopeUpdatedAt: timestamp)
        return cached
    }

    func save(
        _ index: RetrievalIndex,
        savedAt: Date = Date(),
        scopeUpdatedAt: Date = Date()
    ) {
        do {
            try FileManager.default.createDirectory(
                at: fileURL.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )

            let data = try encoder.encode(
                Envelope(index: index, savedAt: savedAt, scopeUpdatedAt: scopeUpdatedAt)
            )
            try data.write(to: fileURL, options: .atomic)
        } catch {
            // Cache writes are best-effort so network-backed usage still works.
        }
    }

    private var modificationDate: Date? {
        try? fileURL.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate
    }
}

nonisolated private struct Envelope: Codable {
    static let currentVersion = 1

    let version: Int
    let savedAt: Date
    let canonicalItems: [SavedItem]
    let globalScope: Scope

    init(index: RetrievalIndex, savedAt: Date, scopeUpdatedAt: Date) {
        version = Self.currentVersion
        self.savedAt = savedAt
        canonicalItems = index.globalItems.sorted { $0.id < $1.id }
        globalScope = Scope(
            itemIDs: canonicalItems.map(\.id),
            coverage: index.globalCoverage,
            updatedAt: scopeUpdatedAt
        )
    }

    var cachedIndex: CachedRetrievalIndex {
        let itemsByID = Dictionary(
            canonicalItems.map { ($0.id, $0) },
            uniquingKeysWith: { _, newest in newest }
        )
        let items = globalScope.itemIDs.compactMap { itemsByID[$0] }
        return CachedRetrievalIndex(
            index: RetrievalIndex(globalItems: items, globalCoverage: .cached),
            storedCoverage: globalScope.coverage,
            savedAt: savedAt,
            scopeUpdatedAt: globalScope.updatedAt
        )
    }
}

nonisolated private struct Scope: Codable {
    let itemIDs: [String]
    let coverage: RetrievalCoverage
    let updatedAt: Date
}
