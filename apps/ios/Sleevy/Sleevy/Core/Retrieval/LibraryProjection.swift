import Foundation

nonisolated struct LibraryFilter: Hashable, Sendable {
    var tag: String?
    var source: String?
    var type: String?

    var isActive: Bool {
        tag != nil || source != nil || type != nil
    }
}

nonisolated struct LibraryFilterOption: Identifiable, Hashable, Sendable {
    let value: String
    let count: Int

    var id: String { value }
}

private nonisolated enum LibraryFacet {
    case tag
    case source
    case type
}

nonisolated enum LibraryFacetOrder: Hashable, Sendable {
    case frequency
    case name
}

nonisolated enum LibrarySort: String, CaseIterable, Identifiable, Hashable, Sendable {
    case newest
    case oldest
    case title
    case unread

    var id: String { rawValue }

    var title: String {
        switch self {
        case .newest:
            "Newest First"
        case .oldest:
            "Oldest First"
        case .title:
            "Title A-Z"
        case .unread:
            "Unread First"
        }
    }
}

nonisolated struct LibraryProjectionKey: Hashable, Sendable {
    let request: RetrievalRequest
    let filter: LibraryFilter
    let sort: LibrarySort
    let facetOrder: LibraryFacetOrder
}

/// Everything one Library screen renders for a destination: the filtered,
/// sorted item list plus the facet options the filter sheet offers.
///
/// The counts and facets stay unfiltered on purpose — empty-state selection,
/// folder header subtitles, and the filter sheet describe the destination,
/// not the current filter's matches.
nonisolated struct LibraryProjection: Equatable, Sendable {
    let items: [SavedItem]
    let destinationCount: Int
    let unreadDestinationCount: Int
    let tags: [LibraryFilterOption]
    let sources: [LibraryFilterOption]
    let types: [LibraryFilterOption]
    let folderCounts: [String: Int]
}

extension RetrievalProjector {
    nonisolated static func libraryProjection(
        for request: RetrievalRequest,
        filter: LibraryFilter,
        sort: LibrarySort,
        facetOrder: LibraryFacetOrder,
        in index: RetrievalIndex
    ) -> LibraryProjection {
        let destinationItems = snapshot(for: request, in: index).items

        return LibraryProjection(
            items: destinationItems
                .filter { item in
                    (filter.tag == nil || item.tags.contains(filter.tag ?? ""))
                        && (filter.source == nil || item.sourceGroup == filter.source)
                        && (filter.type == nil || item.type == filter.type)
                }
                .sorted(using: sort),
            destinationCount: destinationItems.count,
            unreadDestinationCount: destinationItems.count { !$0.isRead },
            tags: options(for: .tag, in: destinationItems, order: facetOrder),
            sources: options(for: .source, in: destinationItems, order: facetOrder),
            types: options(for: .type, in: destinationItems, order: facetOrder),
            folderCounts: index.globalItems.reduce(into: [:]) { counts, item in
                guard let folderID = item.folder?.id else { return }
                counts[folderID, default: 0] += 1
            }
        )
    }

    private nonisolated static func options(
        for facet: LibraryFacet,
        in items: [SavedItem],
        order: LibraryFacetOrder
    ) -> [LibraryFilterOption] {
        let values = switch facet {
        case .tag:
            items.flatMap(\.tags)
        case .source:
            items.compactMap(\.sourceGroup)
        case .type:
            items.map(\.type)
        }
        let counts = values.reduce(into: [String: Int]()) { counts, value in
            let value = value.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !value.isEmpty else { return }
            counts[value, default: 0] += 1
        }
        let options = counts.map { LibraryFilterOption(value: $0.key, count: $0.value) }

        return options.sorted { lhs, rhs in
            if order == .frequency, lhs.count != rhs.count {
                lhs.count > rhs.count
            } else {
                lhs.value.localizedCaseInsensitiveCompare(rhs.value) == .orderedAscending
            }
        }
    }
}

private nonisolated extension Array where Element == SavedItem {
    func sorted(using sort: LibrarySort) -> [SavedItem] {
        switch sort {
        case .newest:
            sorted { ($0.lastSavedAt, $0.id) > ($1.lastSavedAt, $1.id) }
        case .oldest:
            sorted { ($0.lastSavedAt, $0.id) < ($1.lastSavedAt, $1.id) }
        case .title:
            sorted { lhs, rhs in
                let comparison = lhs.librarySortTitle.localizedCaseInsensitiveCompare(rhs.librarySortTitle)
                return comparison == .orderedSame ? lhs.id < rhs.id : comparison == .orderedAscending
            }
        case .unread:
            sorted { lhs, rhs in
                lhs.isRead == rhs.isRead
                    ? (lhs.lastSavedAt, lhs.id) > (rhs.lastSavedAt, rhs.id)
                    : !lhs.isRead && rhs.isRead
            }
        }
    }
}

private nonisolated extension SavedItem {
    var sourceGroup: String? {
        if let sourceName = sourceName?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmptyValue {
            return sourceName
        }

        guard let captureChannel else { return nil }

        switch captureChannel {
        case CaptureChannel.app.rawValue, CaptureChannel.shareExtension.rawValue:
            return "iOS"
        case "chrome-extension", "web-companion":
            return "Browser"
        case "raycast":
            return "Raycast"
        case "api":
            return "API"
        default:
            return captureChannel
        }
    }

    var librarySortTitle: String {
        title?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmptyValue
            ?? siteName?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmptyValue
            ?? host
    }
}

private nonisolated extension String {
    var nonEmptyValue: String? {
        isEmpty ? nil : self
    }
}
