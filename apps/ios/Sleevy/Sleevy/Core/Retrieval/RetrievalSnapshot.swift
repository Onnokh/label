import Foundation

enum RetrievalRequest: Hashable {
    case readingQueue
}

enum RetrievalCoverage: Equatable {
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

struct RetrievalIndex: Equatable {
    private var itemsByID: [String: SavedItem]
    private var globalIDs: Set<String>
    var globalCoverage: RetrievalCoverage

    init(
        globalItems: [SavedItem] = [],
        globalCoverage: RetrievalCoverage = .notRequested
    ) {
        itemsByID = Dictionary(globalItems.map { ($0.id, $0) }, uniquingKeysWith: { _, newest in newest })
        globalIDs = Set(globalItems.map(\.id))
        self.globalCoverage = globalCoverage
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

    mutating func replaceGlobal(
        with items: [SavedItem],
        coverage: RetrievalCoverage
    ) {
        let replacementIDs = Set(items.map(\.id))
        for id in globalIDs.subtracting(replacementIDs) {
            itemsByID[id] = nil
        }
        for item in items {
            itemsByID[item.id] = item
        }
        globalIDs = replacementIDs
        globalCoverage = coverage
    }

    mutating func upsert(_ items: [SavedItem]) {
        for item in items {
            itemsByID[item.id] = item
            globalIDs.insert(item.id)
        }
    }

    mutating func remove(id: String) {
        globalIDs.remove(id)
        itemsByID[id] = nil
    }

    mutating func mutate(
        where predicate: (SavedItem) -> Bool,
        transform: (inout SavedItem) -> Void
    ) {
        for id in globalIDs {
            guard var item = itemsByID[id], predicate(item) else { continue }
            transform(&item)
            itemsByID[id] = item
        }
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
}
