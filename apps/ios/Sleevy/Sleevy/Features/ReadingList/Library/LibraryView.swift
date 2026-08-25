import SwiftUI

@MainActor
struct LibraryView: View {
    var store: ReadingListStore
    @State private var filter = LibraryFilter()
    @State private var sort = LibrarySort.newest
    @State private var isShowingFilters = false
    @State private var folderEditor: FolderEditor?
    @State private var folderToDelete: Folder?
    @State private var itemToMove: SavedItem?
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        let projection = store.libraryProjection(
            for: .libraryRoot,
            filter: filter,
            sort: sort,
            facetOrder: .frequency
        )

        Group {
            if store.isLoading && projection.destinationCount == 0 && store.folders.isEmpty {
                ProgressView("Loading your library...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if projection.destinationCount == 0 && store.folders.isEmpty && store.libraryErrorMessage == nil {
                ContentUnavailableView(
                    "Library",
                    systemImage: "books.vertical",
                    description: Text("Saved reads you organize will appear here.")
                )
            } else {
                libraryList(projection: projection)
            }
        }
        .navigationTitle("Library")
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    folderEditor = .create
                } label: {
                    Image(systemName: "plus")
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
                tags: projection.tags,
                sources: projection.sources,
                types: projection.types
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
        // Favicons warm as soon as items arrive, off the scroll path.
        .task(id: projection.items) {
            await FaviconPrefetcher.warm(items: projection.items, colorScheme: colorScheme)
        }
        .refreshable {
            await store.refresh(.libraryRoot)
        }
    }

    private func libraryList(projection: LibraryProjection) -> some View {
        List {
            Section {
                // A stack of slim corona rows, one per folder — full width,
                // so each folder's field gets room to fan out. Each card is
                // its own list row: cards sharing a row makes a long-press
                // lift the whole stack and resolve the first card's menu.
                ForEach(store.folders) { folder in
                    FolderCard(
                        folder: folder,
                        itemCount: projection.folderCounts[folder.id, default: 0]
                    ) {
                        folderEditor = .rename(folder)
                    } onDelete: {
                        folderToDelete = folder
                    } onSetPublished: { isPublished in
                        Task {
                            do {
                                try await store.setFolderPublished(folder, isPublished: isPublished)
                            } catch {
                                store.libraryErrorMessage = error.localizedDescription
                            }
                        }
                    }
                    .listRowInsets(EdgeInsets(
                        top: folder.id == store.folders.first?.id ? 0 : 12,
                        leading: 16,
                        bottom: 0,
                        trailing: 16
                    ))
                    .listRowSeparator(.hidden)
                    .listRowBackground(Color.clear)
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

            if projection.items.isEmpty {
                ContentUnavailableView(
                    filter.isActive ? "No Matching Items" : "Library is Empty",
                    systemImage: filter.isActive ? "line.3.horizontal.decrease.circle" : "books.vertical",
                    description: Text(filter.isActive ? "Try changing or clearing your filters." : "Items without a folder appear here.")
                )
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
            }

            if !projection.items.isEmpty {
                Section {
                    ForEach(projection.items) { item in
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
        // One shared distance between the large title and the first content,
        // matched with Settings so the screens share a rhythm.
        .contentMargins(.top, ScreenLayout.contentTopSpacing, for: .scrollContent)
        .background(Color(uiColor: .systemBackground))
    }

}
