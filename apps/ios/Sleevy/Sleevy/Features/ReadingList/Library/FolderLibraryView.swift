import SwiftUI

@MainActor
struct FolderLibraryView: View {
    let folder: Folder
    var store: Library
    @State private var filter = LibraryFilter()
    @State private var sort = LibrarySort.newest
    @State private var isShowingFilters = false
    @State private var itemToMove: SavedItem?

    var body: some View {
        List {
            if filter.isActive {
                ActiveLibraryFilters(filter: $filter)
                    .listRowInsets(EdgeInsets(top: 8, leading: 18, bottom: 8, trailing: 18))
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            }

            if let errorMessage = store.libraryErrorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .listRowBackground(Color.clear)
            }

            if visibleItems.isEmpty {
                ContentUnavailableView(
                    filter.isActive ? "No Matching Items" : "Folder is Empty",
                    systemImage: filter.isActive ? "line.3.horizontal.decrease.circle" : "folder",
                    description: Text(filter.isActive ? "Try changing or clearing your filters." : "Move saved items here from your Library.")
                )
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
            }

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
                        Task { await store.setRead(item, isRead: !item.isRead) }
                    } label: {
                        Label(item.isRead ? "Unread" : "Read", systemImage: item.isRead ? "circle" : "checkmark.circle")
                    }
                    .tint(item.isRead ? .orange : .green)
                }
                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                    Button(role: .destructive) {
                        Task { await store.delete(item) }
                    } label: {
                        Label("Delete", systemImage: "trash")
                    }
                }
                .listRowInsets(EdgeInsets(top: 0, leading: 18, bottom: 0, trailing: 18))
                .listRowBackground(Color.clear)
            }
        }
        .listStyle(.plain)
        .navigationTitle(folder.name)
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Picker("Sort", selection: $sort) {
                        ForEach(LibrarySort.allCases) { sort in
                            Text(sort.title).tag(sort)
                        }
                    }
                    Button {
                        isShowingFilters = true
                    } label: {
                        Label("Filters", systemImage: "line.3.horizontal.decrease.circle")
                    }
                } label: {
                    Image(systemName: filter.isActive ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle")
                }
            }
        }
        .sheet(isPresented: $isShowingFilters) {
            LibraryFilterSheet(filter: $filter, tags: tagFilters, sources: sourceFilters, types: typeFilters)
        }
        .sheet(item: $itemToMove) { item in
            MoveToFolderSheet(item: item, folders: store.folders) { destination in
                try await store.move(item, to: destination)
            }
        }
        .task(id: folder.id) {
            await store.loadIfNeeded()
        }
        .refreshable {
            await store.refresh()
        }
    }

    private var items: [SavedItem] { store.savedItems(.folder(folder.id)) }
    private var visibleItems: [SavedItem] {
        items.filter {
            (filter.tag == nil || $0.tags.contains(filter.tag ?? ""))
                && (filter.source == nil || $0.sourceGroup == filter.source)
                && (filter.type == nil || $0.type == filter.type)
        }
        .sorted(using: sort)
    }
    private var tagFilters: [LibraryFilterOption] { countedOptions(items.flatMap(\.tags)) }
    private var sourceFilters: [LibraryFilterOption] { countedOptions(items.compactMap(\.sourceGroup)) }
    private var typeFilters: [LibraryFilterOption] { countedOptions(items.map(\.type)) }

    private func countedOptions(_ values: [String]) -> [LibraryFilterOption] {
        let counts = values.reduce(into: [String: Int]()) { result, value in
            let value = value.trimmingCharacters(in: .whitespacesAndNewlines)
            if !value.isEmpty { result[value, default: 0] += 1 }
        }
        return counts.map { LibraryFilterOption(value: $0.key, count: $0.value) }
            .sorted { $0.value.localizedCaseInsensitiveCompare($1.value) == .orderedAscending }
    }
}

private struct FolderRow: View {
    let folder: Folder

    var body: some View {
        HStack(spacing: 12) {
            FolderIcon(emoji: folder.emoji, color: FolderAccentColor(rawValue: folder.color ?? ""))
                .frame(width: 32, height: 30)

            Text(folder.name)
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(.primary)
                .lineLimit(1)

            Spacer(minLength: 8)
        }
        .contentShape(Rectangle())
        .padding(.vertical, 8)
    }
}

struct FolderListRow: View {
    let folder: Folder
    let onRename: @MainActor () -> Void
    let onDelete: @MainActor () -> Void

    var body: some View {
        NavigationLink(value: AppRoute.folder(folder)) {
            FolderRow(folder: folder)
        }
        .contextMenu {
            Button(action: onRename) {
                Label("Rename", systemImage: "pencil")
            }

            Button(role: .destructive, action: onDelete) {
                Label("Delete", systemImage: "trash")
            }
        }
        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
            Button(role: .destructive, action: onDelete) {
                Label("Delete", systemImage: "trash")
            }

            Button(action: onRename) {
                Label("Rename", systemImage: "pencil")
            }
            .tint(.blue)
        }
    }
}

struct AllFoldersView: View {
    var store: Library
    @State private var folderEditor: FolderEditor?
    @State private var folderToDelete: Folder?

    var body: some View {
        List {
            ForEach(store.folders) { folder in
                FolderListRow(folder: folder) {
                    folderEditor = .rename(folder)
                } onDelete: {
                    folderToDelete = folder
                }
                .listRowInsets(EdgeInsets(top: 0, leading: 18, bottom: 0, trailing: 18))
                .listRowBackground(Color.clear)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Color(uiColor: .systemBackground))
        .navigationTitle("Folders")
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
        }
        .folderActions(store: store, editor: $folderEditor, folderToDelete: $folderToDelete)
        .refreshable {
            await store.refresh()
        }
    }
}

private struct FolderActionsModifier: ViewModifier {
    var store: Library
    @Binding var editor: FolderEditor?
    @Binding var folderToDelete: Folder?

    func body(content: Content) -> some View {
        content
            .sheet(item: $editor) { editor in
                FolderEditorSheet(editor: editor) { draft in
                    switch editor {
                    case .create:
                        try await store.createFolder(named: draft.name, emoji: draft.emoji, color: draft.color?.rawValue)
                    case .rename(let folder):
                        try await store.renameFolder(folder, to: draft.name, emoji: draft.emoji, color: draft.color?.rawValue)
                    }
                }
            }
            .alert(
                "Delete \(folderToDelete?.name ?? "Folder")?",
                isPresented: Binding(
                    get: { folderToDelete != nil },
                    set: { if !$0 { folderToDelete = nil } }
                ),
                presenting: folderToDelete
            ) { folder in
                Button("Cancel", role: .cancel) {}
                Button("Delete Folder", role: .destructive) {
                    Task {
                        do {
                            try await store.deleteFolder(folder)
                        } catch {
                            store.libraryErrorMessage = error.localizedDescription
                        }
                        folderToDelete = nil
                    }
                }
            } message: { _ in
                Text("Saved items in this folder are kept in your Library.")
            }
    }
}

extension View {
    func folderActions(
        store: Library,
        editor: Binding<FolderEditor?>,
        folderToDelete: Binding<Folder?>
    ) -> some View {
        modifier(FolderActionsModifier(store: store, editor: editor, folderToDelete: folderToDelete))
    }
}

struct MoveToFolderSheet: View {
    @Environment(\.dismiss) private var dismiss
    let item: SavedItem
    let folders: [Folder]
    let onMove: @MainActor (Folder?) async throws -> Void
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            List {
                if item.folder != nil {
                    destinationButton(title: "Library", systemImage: "books.vertical", folder: nil)
                }
                ForEach(folders.filter { $0.id != item.folder?.id }) { folder in
                    destinationButton(title: folder.name, systemImage: "folder", folder: folder)
                }
                if let errorMessage {
                    Text(errorMessage).font(.footnote).foregroundStyle(.red)
                }
            }
            .navigationTitle("Move to Folder")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func destinationButton(title: String, systemImage: String, folder: Folder?) -> some View {
        Button {
            Task {
                do {
                    try await onMove(folder)
                    dismiss()
                } catch {
                    errorMessage = error.localizedDescription
                }
            }
        } label: {
            Label(title, systemImage: systemImage)
        }
    }
}

struct FolderIcon: View {
    let emoji: String?
    let color: FolderAccentColor?

    var body: some View {
        GeometryReader { proxy in
            let size = min(proxy.size.width, proxy.size.height)

            ZStack {
                Image(systemName: "folder.fill")
                    .resizable()
                    .scaledToFit()
                    .foregroundStyle((color?.tint ?? .accentColor).gradient)

                if let emoji {
                    Text(emoji)
                        .font(.system(size: size * 0.35))
                        .offset(y: size * 0.09)
                }
            }
        }
        .accessibilityHidden(true)
    }
}
