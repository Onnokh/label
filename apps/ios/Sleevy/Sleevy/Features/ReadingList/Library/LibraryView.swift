import SwiftUI

@MainActor
struct LibraryView: View {
    var store: Library
    @State private var filter = LibraryFilter()
    @State private var sort = LibrarySort.newest
    @State private var isShowingFilters = false
    @State private var folderEditor: FolderEditor?
    @State private var folderToDelete: Folder?
    @State private var itemToMove: SavedItem?

    var body: some View {
        Group {
            if store.isLoading && store.savedItems(.unfiled).isEmpty && store.folders.isEmpty {
                ProgressView("Loading your library...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if store.savedItems(.unfiled).isEmpty && store.folders.isEmpty && store.libraryErrorMessage == nil {
                ContentUnavailableView(
                    "Library",
                    systemImage: "books.vertical",
                    description: Text("Saved reads you organize will appear here.")
                )
            } else {
                libraryList
            }
        }
        .navigationTitle("Library")
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    folderEditor = .create
                } label: {
                    Image(systemName: "folder.badge.plus")
                }
                .accessibilityLabel("New Folder")
            }

            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Picker("Sort", selection: $sort) {
                        ForEach(LibrarySort.allCases) { sort in
                            Text(sort.title).tag(sort)
                        }
                    }

                    Divider()

                    Button {
                        isShowingFilters = true
                    } label: {
                        Label("Filters", systemImage: "line.3.horizontal.decrease.circle")
                    }

                    if filter.isActive {
                        Button(role: .destructive) {
                            filter = LibraryFilter()
                        } label: {
                            Label("Clear Filters", systemImage: "xmark.circle")
                        }
                    }
                } label: {
                    Image(systemName: filter.isActive ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle")
                        .contentTransition(.symbolEffect(.replace))
                }
                .accessibilityLabel(filter.isActive ? "Filters Active" : "Filters")
            }
        }
        .sheet(isPresented: $isShowingFilters) {
            LibraryFilterSheet(
                filter: $filter,
                tags: tagFilters,
                sources: sourceFilters,
                types: typeFilters
            )
        }
        .sheet(item: $itemToMove) { item in
            MoveToFolderSheet(item: item, folders: store.folders) { destination in
                try await store.move(item, to: destination)
            }
        }
        .folderActions(store: store, editor: $folderEditor, folderToDelete: $folderToDelete)
        .task {
            await store.loadIfNeeded()
        }
        .refreshable {
            await store.refresh()
        }
    }

    private var libraryList: some View {
        libraryItemsList
    }

    private let folderPreviewLimit = 3

    private var previewFolders: [Folder] {
        Array(store.folders.prefix(folderPreviewLimit))
    }

    private var libraryItemsList: some View {
        List {
            if !store.folders.isEmpty {
                Section {
                    ForEach(Array(previewFolders.enumerated()), id: \.element.id) { index, folder in
                        FolderListRow(folder: folder) {
                            folderEditor = .rename(folder)
                        } onDelete: {
                            folderToDelete = folder
                        }
                        .listRowInsets(EdgeInsets(top: 0, leading: 30, bottom: 0, trailing: 30))
                        .listRowSeparator(.hidden)
                        .listRowBackground(
                            GroupedSectionRowBackground(
                                isFirst: index == 0,
                                isLast: index == previewFolders.count - 1,
                                separatorLeadingInset: 58
                            )
                        )
                    }
                } header: {
                    HStack(alignment: .firstTextBaseline) {
                        Text("Folders")

                        Spacer()

                        if store.folders.count > folderPreviewLimit {
                            NavigationLink(value: AppRoute.allFolders) {
                                Text("Show all (\(store.folders.count))")
                                    .font(.footnote.weight(.semibold))
                                    .textCase(nil)
                                    .foregroundStyle(Color.accentColor)
                            }
                        }
                    }
                }
            }

            if filter.isActive {
                Section {
                    ActiveLibraryFilters(filter: $filter)
                        .listRowInsets(EdgeInsets(top: 8, leading: 18, bottom: 8, trailing: 18))
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                }
            }

            if let errorMessage = store.libraryErrorMessage {
                Section {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundStyle(.red)
                }
                .listRowBackground(Color.clear)
            }

            if visibleItems.isEmpty {
                ContentUnavailableView(
                    filter.isActive ? "No Matching Items" : "Library is Empty",
                    systemImage: filter.isActive ? "line.3.horizontal.decrease.circle" : "books.vertical",
                    description: Text(filter.isActive ? "Try changing or clearing your filters." : "Items without a folder appear here.")
                )
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
            }

            if !visibleItems.isEmpty {
                Section {
                    ForEach(visibleItems) { item in
                        SavedItemRow(item: item) {
                            await store.markOpened(item)
                        } onToggleRead: {
                            await store.setRead(item, isRead: !item.isRead)
                        } onDelete: {
                            await store.delete(item)
                        } onMove: {
                            itemToMove = item
                        }
                        .swipeActions(edge: .leading, allowsFullSwipe: true) {
                            Button {
                                Task {
                                    await store.setRead(item, isRead: !item.isRead)
                                }
                            } label: {
                                Label(
                                    item.isRead ? "Unread" : "Read",
                                    systemImage: item.isRead ? "circle" : "checkmark.circle"
                                )
                            }
                            .tint(item.isRead ? .orange : .green)
                        }
                        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                            Button(role: .destructive) {
                                Task {
                                    await store.delete(item)
                                }
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                        .listRowInsets(EdgeInsets(top: 0, leading: 18, bottom: 0, trailing: 18))
                        .listRowBackground(Color.clear)
                        .listRowSeparatorTint(.white.opacity(0.08))
                    }
                }
            }
        }
        .listStyle(.plain)
        .listSectionSpacing(16)
        .defaultScrollAnchor(.top)
        .scrollContentBackground(.hidden)
        .background(Color(uiColor: .systemBackground))
    }

    private var visibleItems: [SavedItem] {
        store.savedItems(.unfiled)
            .filter { item in
                (filter.tag == nil || item.tags.contains(filter.tag ?? ""))
                    && (filter.source == nil || item.sourceGroup == filter.source)
                    && (filter.type == nil || item.type == filter.type)
            }
            .sorted(using: sort)
    }

    private var tagFilters: [LibraryFilterOption] {
        countedOptions(store.savedItems(.unfiled).flatMap(\.tags))
    }

    private var sourceFilters: [LibraryFilterOption] {
        countedOptions(store.savedItems(.unfiled).compactMap(\.sourceGroup))
    }

    private var typeFilters: [LibraryFilterOption] {
        countedOptions(store.savedItems(.unfiled).map(\.type))
    }

    private func countedOptions(_ values: [String]) -> [LibraryFilterOption] {
        let counts = values.reduce(into: [String: Int]()) { counts, value in
            let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { return }
            counts[trimmed, default: 0] += 1
        }

        return counts
            .map { LibraryFilterOption(value: $0.key, count: $0.value) }
            .sorted { lhs, rhs in
                if lhs.count == rhs.count {
                    lhs.value.localizedCaseInsensitiveCompare(rhs.value) == .orderedAscending
                } else {
                    lhs.count > rhs.count
                }
            }
    }
}

private struct GroupedSectionRowBackground: View {
    let isFirst: Bool
    let isLast: Bool
    var separatorLeadingInset: CGFloat = 0

    var body: some View {
        let radius: CGFloat = 12

        ZStack(alignment: .bottom) {
            UnevenRoundedRectangle(
                topLeadingRadius: isFirst ? radius : 0,
                bottomLeadingRadius: isLast ? radius : 0,
                bottomTrailingRadius: isLast ? radius : 0,
                topTrailingRadius: isFirst ? radius : 0,
                style: .continuous
            )
            .fill(Color(uiColor: .secondarySystemBackground))

            if !isLast {
                Rectangle()
                    .fill(Color.primary.opacity(0.08))
                    .frame(height: 0.5)
                    .padding(.leading, separatorLeadingInset)
            }
        }
        .padding(.horizontal, 16)
    }
}
