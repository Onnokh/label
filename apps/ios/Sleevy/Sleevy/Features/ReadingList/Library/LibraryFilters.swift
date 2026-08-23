import SwiftUI

struct LibraryFilter: Equatable {
    var tag: String?
    var source: String?
    var type: String?

    var isActive: Bool {
        tag != nil || source != nil || type != nil
    }
}

struct LibraryFilterOption: Identifiable, Hashable {
    let value: String
    let count: Int

    var id: String { value }
}

enum LibraryFacet {
    case tag
    case source
    case type
}

enum LibraryFacetOrder {
    case frequency
    case name
}

struct LibraryItems {
    let items: [SavedItem]

    func filtered(by filter: LibraryFilter, sortedBy sort: LibrarySort) -> [SavedItem] {
        items
            .filter { item in
                (filter.tag == nil || item.tags.contains(filter.tag ?? ""))
                    && (filter.source == nil || item.sourceGroup == filter.source)
                    && (filter.type == nil || item.type == filter.type)
            }
            .sorted(using: sort)
    }

    func options(for facet: LibraryFacet, order: LibraryFacetOrder) -> [LibraryFilterOption] {
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

        switch order {
        case .frequency:
            return options.sorted { lhs, rhs in
                if lhs.count == rhs.count {
                    lhs.value.localizedCaseInsensitiveCompare(rhs.value) == .orderedAscending
                } else {
                    lhs.count > rhs.count
                }
            }
        case .name:
            return options.sorted {
                $0.value.localizedCaseInsensitiveCompare($1.value) == .orderedAscending
            }
        }
    }
}

enum LibrarySort: String, CaseIterable, Identifiable {
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

extension Array where Element == SavedItem {
    func sorted(using sort: LibrarySort) -> [SavedItem] {
        switch sort {
        case .newest:
            sorted { lhs, rhs in lhs.lastSavedAt > rhs.lastSavedAt }
        case .oldest:
            sorted { lhs, rhs in lhs.lastSavedAt < rhs.lastSavedAt }
        case .title:
            sorted { lhs, rhs in lhs.librarySortTitle.localizedCaseInsensitiveCompare(rhs.librarySortTitle) == .orderedAscending }
        case .unread:
            sorted { lhs, rhs in
                if lhs.isRead == rhs.isRead {
                    lhs.lastSavedAt > rhs.lastSavedAt
                } else {
                    !lhs.isRead && rhs.isRead
                }
            }
        }
    }
}

struct LibraryFilterSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var filter: LibraryFilter
    let tags: [LibraryFilterOption]
    let sources: [LibraryFilterOption]
    let types: [LibraryFilterOption]

    var body: some View {
        NavigationStack {
            List {
                filterSection("Tags", options: tags, selection: $filter.tag, systemImage: "number")
                filterSection("Sources", options: sources, selection: $filter.source, systemImage: "tray.and.arrow.down")
                filterSection("Types", options: types, selection: $filter.type, systemImage: "doc.text")

                if filter.isActive {
                    Section {
                        Button(role: .destructive) {
                            filter = LibraryFilter()
                        } label: {
                            Label("Clear Filters", systemImage: "xmark.circle")
                        }
                    }
                }
            }
            .navigationTitle("Filters")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    @ViewBuilder
    private func filterSection(
        _ title: String,
        options: [LibraryFilterOption],
        selection: Binding<String?>,
        systemImage: String
    ) -> some View {
        if !options.isEmpty {
            Section(title) {
                ForEach(options) { option in
                    Button {
                        selection.wrappedValue = selection.wrappedValue == option.value ? nil : option.value
                    } label: {
                        HStack(spacing: 12) {
                            Label(option.value, systemImage: systemImage)
                                .labelStyle(.titleAndIcon)

                            Spacer()

                            Text(option.count, format: .number)
                                .font(.footnote.monospacedDigit())
                                .foregroundStyle(.secondary)

                            if selection.wrappedValue == option.value {
                                Image(systemName: "checkmark")
                                    .font(.body.weight(.semibold))
                                    .foregroundStyle(.tint)
                            }
                        }
                    }
                    .foregroundStyle(.primary)
                }
            }
        }
    }
}

struct ActiveLibraryFilters: View {
    @Binding var filter: LibraryFilter

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                if let tag = filter.tag {
                    FilterChip(label: "Tag", value: tag) {
                        filter.tag = nil
                    }
                }

                if let source = filter.source {
                    FilterChip(label: "Source", value: source) {
                        filter.source = nil
                    }
                }

                if let type = filter.type {
                    FilterChip(label: "Type", value: type) {
                        filter.type = nil
                    }
                }
            }
        }
    }
}

private struct FilterChip: View {
    let label: String
    let value: String
    let onRemove: () -> Void

    var body: some View {
        Button {
            onRemove()
        } label: {
            HStack(spacing: 6) {
                Text(label)
                    .foregroundStyle(.secondary)
                Text(value)
                    .foregroundStyle(.primary)
                Image(systemName: "xmark.circle.fill")
                    .foregroundStyle(.secondary)
            }
            .font(.footnote.weight(.medium))
            .lineLimit(1)
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(Color(uiColor: .secondarySystemFill), in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Remove \(label) filter \(value)")
    }
}

extension SavedItem {
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

extension String {
    var nonEmptyValue: String? {
        isEmpty ? nil : self
    }
}
