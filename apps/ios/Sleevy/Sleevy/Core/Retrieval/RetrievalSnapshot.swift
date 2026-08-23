import Foundation

nonisolated enum RetrievalRequest: Hashable, Sendable {
    case readingQueue
    case completeLibrary
    case libraryRoot
    case folder(String)
}

nonisolated enum RetrievalCoverage: String, Codable, Equatable, Sendable {
    case notRequested
    case cached
    case loading
    case complete
    case failed
    case stale
}

nonisolated struct RetrievalSnapshot: Equatable, Sendable {
    let items: [SavedItem]
    let coverage: RetrievalCoverage

    static let notRequested = RetrievalSnapshot(items: [], coverage: .notRequested)
}

nonisolated struct SearchSnapshot: Equatable, Sendable {
    let items: [SavedItem]
    let coverage: RetrievalCoverage
    let hasSavedItems: Bool

    static let notRequested = SearchSnapshot(
        items: [],
        coverage: .notRequested,
        hasSavedItems: false
    )
}

nonisolated struct RetrievalIndex: Equatable, Sendable {
    private var itemsByID: [String: SavedItem]
    private var searchContentByID: [String: SearchContent]
    private var globalIDs: Set<String>
    private var scopedIDs: [SavedItemFetchRequest: Set<String>] = [:]
    private var scopedCoverage: [SavedItemFetchRequest: RetrievalCoverage] = [:]
    var globalCoverage: RetrievalCoverage
    private(set) var searchContentBuildCount: Int
    private(set) var itemRevision = 0

    init(
        globalItems: [SavedItem] = [],
        globalCoverage: RetrievalCoverage = .notRequested
    ) {
        itemsByID = Dictionary(globalItems.map { ($0.id, $0) }, uniquingKeysWith: { _, newest in newest })
        searchContentByID = itemsByID.mapValues(SearchContent.init)
        globalIDs = Set(globalItems.map(\.id))
        self.globalCoverage = globalCoverage
        searchContentBuildCount = itemsByID.count
    }

    var globalItems: [SavedItem] {
        globalIDs.compactMap { itemsByID[$0] }
    }

    var isEmpty: Bool {
        globalIDs.isEmpty
    }

    func contains(id: String) -> Bool {
        globalIDs.contains(id)
    }

    func item(id: String) -> SavedItem? {
        guard globalIDs.contains(id) else { return nil }
        return itemsByID[id]
    }

    func searchItems(matching query: String) -> [SavedItem] {
        let query = Self.normalizedSearchQuery(query)
        guard !query.isEmpty else { return [] }

        return globalIDs.compactMap { id in
            guard searchContentByID[id]?.text.contains(query) == true else { return nil }
            return itemsByID[id]
        }
        .sortedNewest()
    }

    func items(for request: SavedItemFetchRequest) -> [SavedItem] {
        let ids = scopedIDs[request]
            ?? Set(globalItems.lazy.filter { request.includes($0) }.map(\.id))
        return ids.compactMap { itemsByID[$0] }
    }

    func coverage(for request: SavedItemFetchRequest) -> RetrievalCoverage {
        switch request {
        case .completeLibrary:
            globalCoverage
        case .libraryRoot, .folder:
            scopedCoverage[request] ?? .notRequested
        }
    }

    mutating func replaceGlobal(
        with items: [SavedItem],
        coverage: RetrievalCoverage
    ) {
        let replacementIDs = Set(items.map(\.id))
        for id in globalIDs.subtracting(replacementIDs) {
            itemsByID[id] = nil
            searchContentByID[id] = nil
            itemRevision &+= 1
        }
        for item in items {
            store(item)
        }
        globalIDs = replacementIDs
        globalCoverage = coverage
        refreshKnownScopes()
    }

    mutating func replace(
        with items: [SavedItem],
        for request: SavedItemFetchRequest,
        coverage: RetrievalCoverage
    ) {
        guard request != .completeLibrary else {
            replaceGlobal(with: items, coverage: coverage)
            return
        }

        for item in items {
            store(item)
            globalIDs.insert(item.id)
            refreshKnownScopes(for: item)
        }
        scopedIDs[request] = Set(items.map(\.id))
        scopedCoverage[request] = coverage
    }

    mutating func upsert(_ items: [SavedItem]) {
        for item in items {
            store(item)
            globalIDs.insert(item.id)
            refreshKnownScopes(for: item)
        }
    }

    mutating func remove(id: String) {
        guard globalIDs.contains(id) else { return }
        globalIDs.remove(id)
        itemsByID[id] = nil
        searchContentByID[id] = nil
        itemRevision &+= 1
        for request in Array(scopedIDs.keys) {
            scopedIDs[request]?.remove(id)
        }
    }

    mutating func mutate(
        where predicate: (SavedItem) -> Bool,
        transform: (inout SavedItem) -> Void
    ) {
        for id in globalIDs {
            guard var item = itemsByID[id], predicate(item) else { continue }
            transform(&item)
            store(item)
            refreshKnownScopes(for: item)
        }
    }

    mutating func setCoverage(_ coverage: RetrievalCoverage, for request: SavedItemFetchRequest) {
        if request == .completeLibrary {
            globalCoverage = coverage
        } else {
            scopedCoverage[request] = coverage
        }
    }

    private mutating func refreshKnownScopes() {
        for request in Array(scopedIDs.keys) {
            scopedIDs[request] = Set(globalItems.lazy.filter { request.includes($0) }.map(\.id))
        }
    }

    private mutating func refreshKnownScopes(for item: SavedItem) {
        for request in Array(scopedIDs.keys) {
            if request.includes(item) {
                scopedIDs[request]?.insert(item.id)
            } else {
                scopedIDs[request]?.remove(item.id)
            }
        }
    }

    private mutating func store(_ item: SavedItem) {
        if itemsByID[item.id] != item {
            itemRevision &+= 1
        }
        let fields = SearchContent.Fields(item)
        if searchContentByID[item.id]?.fields != fields {
            searchContentByID[item.id] = SearchContent(fields: fields)
            searchContentBuildCount += 1
        }
        itemsByID[item.id] = item
    }

    private static func normalizedSearchQuery(_ query: String) -> String {
        query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }
}

nonisolated enum RetrievalProjector {
    static func snapshot(
        for request: RetrievalRequest,
        in index: RetrievalIndex
    ) -> RetrievalSnapshot {
        switch request {
        case .readingQueue:
            return RetrievalSnapshot(
                items: index.globalItems
                    .filter { !$0.isRead }
                    .sorted { ($0.lastSavedAt, $0.id) > ($1.lastSavedAt, $1.id) },
                coverage: index.globalCoverage
            )
        case .completeLibrary:
            return RetrievalSnapshot(
                items: index.globalItems.sortedNewest(),
                coverage: index.globalCoverage
            )
        case .libraryRoot:
            return RetrievalSnapshot(
                items: index.items(for: .libraryRoot).sortedNewest(),
                coverage: index.coverage(for: .libraryRoot)
            )
        case .folder(let id):
            return RetrievalSnapshot(
                items: index.items(for: .folder(id)).sortedNewest(),
                coverage: index.coverage(for: .folder(id))
            )
        }
    }

    static func searchSnapshot(
        for query: String,
        in index: RetrievalIndex
    ) -> SearchSnapshot {
        SearchSnapshot(
            items: index.searchItems(matching: query),
            coverage: index.globalCoverage,
            hasSavedItems: !index.isEmpty
        )
    }
}

private nonisolated struct SearchContent: Equatable, Sendable {
    struct Fields: Equatable, Sendable {
        let title: String?
        let siteName: String?
        let domain: String
        let description: String?
        let previewSummary: String?
        let type: String
        let tags: [String]
        let originalURL: String
        let canonicalURL: String?
        let sourceName: String?
        let captureChannel: String?

        init(_ item: SavedItem) {
            title = item.title
            siteName = item.siteName
            domain = item.host.replacingOccurrences(
                of: #"^www\."#,
                with: "",
                options: .regularExpression
            )
            description = item.description
            previewSummary = item.previewSummary
            type = item.type
            tags = item.tags
            originalURL = item.originalURL
            canonicalURL = item.canonicalURL
            sourceName = item.sourceName
            captureChannel = item.captureChannel
        }
    }

    let fields: Fields
    let text: String

    init(_ item: SavedItem) {
        self.init(fields: Fields(item))
    }

    init(fields: Fields) {
        self.fields = fields
        text = [
            fields.title,
            fields.siteName,
            fields.domain,
            fields.description,
            fields.previewSummary,
            fields.type,
            fields.tags.joined(separator: " "),
            fields.originalURL,
            fields.canonicalURL,
            fields.sourceName,
            fields.captureChannel,
        ]
        .compactMap { $0 }
        .joined(separator: " ")
        .lowercased()
    }
}

private nonisolated extension SavedItemFetchRequest {
    func includes(_ item: SavedItem) -> Bool {
        switch self {
        case .completeLibrary:
            true
        case .libraryRoot:
            item.folder == nil
        case .folder(let id):
            item.folder?.id == id
        }
    }
}

nonisolated extension Sequence where Element == SavedItem {
    /// Reproduces the server's canonical "newest" ordering: `desc(lastSavedAt, id)`.
    func sortedNewest() -> [SavedItem] {
        sorted { ($0.lastSavedAt, $0.id) > ($1.lastSavedAt, $1.id) }
    }
}
