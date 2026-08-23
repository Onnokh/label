import Foundation

enum RetrievalRequest: Hashable {
    case readingQueue
}

nonisolated enum RetrievalCoverage: String, Codable, Equatable, Sendable {
    case notRequested
    case cached
    case loading
    case complete
    case failed
    case stale
}

struct RetrievalSnapshot: Equatable {
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
        .sorted { ($0.lastSavedAt, $0.id) > ($1.lastSavedAt, $1.id) }
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
    }

    mutating func upsert(_ items: [SavedItem]) {
        for item in items {
            store(item)
            globalIDs.insert(item.id)
        }
    }

    mutating func remove(id: String) {
        guard globalIDs.contains(id) else { return }
        globalIDs.remove(id)
        itemsByID[id] = nil
        searchContentByID[id] = nil
        itemRevision &+= 1
    }

    mutating func mutate(
        where predicate: (SavedItem) -> Bool,
        transform: (inout SavedItem) -> Void
    ) {
        for id in globalIDs {
            guard var item = itemsByID[id], predicate(item) else { continue }
            transform(&item)
            store(item)
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

enum RetrievalProjector {
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
