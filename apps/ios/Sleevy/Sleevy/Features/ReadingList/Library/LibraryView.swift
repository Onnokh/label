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
            if store.isLoading && rootItems.isEmpty && store.folders.isEmpty {
                ProgressView("Loading your library...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if rootItems.isEmpty && store.folders.isEmpty && store.libraryErrorMessage == nil {
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
            // Once folders exist their section header carries the add button,
            // so the toolbar only needs it for creating the first one.
            if store.folders.isEmpty {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        folderEditor = .create
                    } label: {
                        Image(systemName: "folder.badge.plus")
                    }
                    .accessibilityLabel("New Folder")
                }
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
            await store.loadIfNeeded(for: .libraryRoot)
        }
        .refreshable {
            await store.refresh(.libraryRoot)
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
                    LazyVGrid(columns: FolderGrid.columns, spacing: FolderGrid.spacing) {
                        ForEach(previewFolders) { folder in
                            FolderCard(
                                folder: folder,
                                itemCount: folderCount(folder.id)
                            ) {
                                folderEditor = .rename(folder)
                            } onDelete: {
                                folderToDelete = folder
                            }
                        }
                    }
                    .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
                } header: {
                    HStack {
                        Text("Folders")
                            .font(.system(size: 14, weight: .semibold))
                            .kerning(1.1)
                            .textCase(.uppercase)
                            .foregroundStyle(.secondary)

                        Spacer()

                        if store.folders.count > folderPreviewLimit {
                            NavigationLink(value: AppRoute.allFolders) {
                                Text("Show all (\(store.folders.count))")
                                    .font(.footnote.weight(.semibold))
                                    .textCase(nil)
                                    .foregroundStyle(Color.accentColor)
                            }
                        }

                        Button {
                            folderEditor = .create
                        } label: {
                            Image(systemName: "folder.badge.plus")
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundStyle(Color.primary)
                        }
                        .accessibilityLabel("New Folder")
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
        libraryItems.filtered(by: filter, sortedBy: sort)
    }

    private var tagFilters: [LibraryFilterOption] {
        libraryItems.options(for: .tag, order: .frequency)
    }

    private var sourceFilters: [LibraryFilterOption] {
        libraryItems.options(for: .source, order: .frequency)
    }

    private var typeFilters: [LibraryFilterOption] {
        libraryItems.options(for: .type, order: .frequency)
    }

    private var libraryItems: LibraryItems {
        LibraryItems(items: rootItems)
    }

    private var rootItems: [SavedItem] {
        store.snapshot(for: .libraryRoot).items
    }

    private func folderCount(_ id: String) -> Int {
        store.snapshot(for: .completeLibrary).items.count { $0.folder?.id == id }
    }
}
