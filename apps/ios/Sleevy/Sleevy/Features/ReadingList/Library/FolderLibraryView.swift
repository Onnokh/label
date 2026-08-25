import SwiftUI

@MainActor
struct FolderLibraryView: View {
    let folder: Folder
    var store: ReadingListStore
    @State private var filter = LibraryFilter()
    @State private var sort = LibrarySort.newest
    @State private var isShowingFilters = false
    @State private var itemToMove: SavedItem?
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        let projection = store.libraryProjection(
            for: .folder(currentFolder.id),
            filter: filter,
            sort: sort,
            facetOrder: .name
        )

        GeometryReader { geometry in
            // Shorter than the Inbox's 16:9 — a folder header only carries
            // the title and subtitle.
            folderList(
                projection: projection,
                headerCardHeight: geometry.size.width * 0.46,
                headerTopInset: geometry.safeAreaInsets.top
            )
        }
        // Outside the header-card background, so the card paints on top of it.
        .background(Color(uiColor: .systemBackground))
        .navigationTitle(currentFolder.name)
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
        .task(id: currentFolder.id) {
            await store.loadIfNeeded(for: .folder(currentFolder.id))
        }
        .refreshable {
            await store.refresh(.folder(currentFolder.id))
        }
    }

    private func folderList(
        projection: LibraryProjection,
        headerCardHeight: CGFloat,
        headerTopInset: CGFloat
    ) -> some View {
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

            if projection.items.isEmpty {
                ContentUnavailableView(
                    filter.isActive ? "No Matching Items" : "Folder is Empty",
                    systemImage: filter.isActive ? "line.3.horizontal.decrease.circle" : "folder",
                    description: Text(filter.isActive ? "Try changing or clearing your filters." : "Move saved items here from your Library.")
                )
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
            }

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
                .listRowSeparatorTint(.primary.opacity(0.08))
                // No line between the header card and the first row.
                .listRowSeparator(item.id == projection.items.first?.id ? .hidden : .automatic, edges: .top)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .scrollBounceBehavior(.always, axes: .vertical)
        // The shared header-card mechanic (see `stretchyHeaderCard`); here
        // the card is the folder's own corona field, telling a folder apart
        // from the Inbox's aurora.
        .stretchyHeaderCard(height: headerCardHeight, topInset: headerTopInset) { context in
            FolderHeaderCard(
                folder: currentFolder,
                height: context.height,
                subtitle: navigationSubtitleText(
                    total: projection.destinationCount,
                    unread: projection.unreadDestinationCount
                ),
                isVisible: context.isVisible
            )
        }
        // No forced scheme: the corona field is a dark slab only in dark
        // mode, and see-through pastel in light mode, so the large title and
        // back button read correctly from the real scheme.
        // Favicons warm as soon as items arrive, off the scroll path.
        .task(id: projection.items) {
            await FaviconPrefetcher.warm(items: projection.items, colorScheme: colorScheme)
        }
    }

    private var currentFolder: Folder {
        store.folders.first(where: { $0.id == folder.id }) ?? folder
    }

    /// "12 saves · 3 unread", dropping the unread part once everything is
    /// read, and the whole subtitle while the folder is empty.
    private func navigationSubtitleText(total: Int, unread: Int) -> String? {
        guard total > 0 else { return nil }

        let saves = total == 1 ? "1 save" : "\(total) saves"
        return unread > 0 ? "\(saves) · \(unread) unread" : saves
    }
}

/// One folder in the folders stack: a slim horizontal row over the folder's
/// corona field, name on the left, bare count on the right. The gradient
/// carries the folder's accent colour; a folder without one wears the
/// neutral palette. Tap opens the folder; every other action lives behind
/// a long-press.
struct FolderCard: View {
    let folder: Folder
    let itemCount: Int
    let onRename: @MainActor () -> Void
    let onDelete: @MainActor () -> Void
    let onSetPublished: @MainActor (Bool) -> Void

    @Environment(\.pushRoute) private var pushRoute
    @Environment(\.colorScheme) private var colorScheme

    private var palette: FolderCardPalette {
        FolderAccentColor(rawValue: folder.color ?? "")?.cardPalette ?? .neutral
    }

    /// The card's field is a dark slab in dark mode and see-through pastel
    /// in light mode, so its labels cannot be a fixed white.
    private var labelColor: Color {
        colorScheme == .light ? .primary : .white
    }

    var body: some View {
        // Layered by hand, pushing through `pushRoute` instead of being a
        // NavigationLink (see the environment key for why). The clear button
        // is the tap target; the visuals ignore touches.
        ZStack {
            Button {
                pushRoute(.folder(id: folder.id))
            } label: {
                Color.clear.contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(folder.name)
            .accessibilityValue(accessibilityCountLabel)

            HStack {
                Text(folder.name)
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(labelColor)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)

                Spacer()

                HStack(spacing: 8) {
                    if folder.isPublished {
                        Image(systemName: "person.crop.circle")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(labelColor.opacity(0.7))

                        Rectangle()
                            .fill(labelColor.opacity(0.25))
                            .frame(width: 1, height: 12)
                    }

                    Text("\(itemCount)")
                        .font(.system(size: 16, weight: .semibold))
                        .monospacedDigit()
                        .foregroundStyle(labelColor.opacity(0.7))
                }
            }
            .padding(.horizontal, 18)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
        .aspectRatio(5.0, contentMode: .fit)
        .background(
            FolderCardGradient(
                palette: palette,
                shape: FolderCardGradient.shape(for: folder.id),
                seed: FolderCardGradient.seed(for: folder.id)
            )
            .allowsHitTesting(false)
        )
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        // Dark mode's field is an opaque slab and is the card's edge. Light
        // mode's is see-through, so a pale fan on a white list would leave
        // the row with no shape — a hairline is enough to give it one,
        // without putting a grey slab back under the field.
        .overlay {
            if colorScheme == .light {
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .strokeBorder(Color.primary.opacity(0.08), lineWidth: 0.75)
                    .allowsHitTesting(false)
            }
        }
        // Without this the long-press lift snapshots the row's square
        // bounds; with it the lifted card keeps its rounded shape.
        .contentShape(.contextMenuPreview, RoundedRectangle(cornerRadius: 20, style: .continuous))
        .contextMenu {
            actions
        }
    }

    @ViewBuilder
    private var actions: some View {
        Button(action: onRename) {
            Label("Edit", systemImage: "pencil")
        }

        // The label states what the action does next, so the stored state
        // stays legible even while Profile Visibility is private and the
        // card shows no marker.
        Button {
            onSetPublished(!folder.isPublished)
        } label: {
            Label(
                folder.isPublished ? "Remove from Profile" : "Publish to Profile",
                systemImage: "person.crop.circle"
            )
        }

        Button(role: .destructive, action: onDelete) {
            Label("Delete", systemImage: "trash")
        }
    }

    private var accessibilityCountLabel: String {
        let count = itemCount == 1 ? "1 saved item" : "\(itemCount) saved items"
        return folder.isPublished ? "\(count), on your public profile" : count
    }
}

private struct FolderActionsModifier: ViewModifier {
    var store: ReadingListStore
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
        store: ReadingListStore,
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

/// The card behind a folder's large title — the Inbox header card's sibling,
/// with the folder's own corona field instead of the aurora (neutral for a
/// folder without one). The counts render inside the card:
/// `navigationSubtitle` on a pushed screen collapses the large title to
/// inline, so the system subtitle is not an option here.
private struct FolderHeaderCard: View {
    let folder: Folder
    let height: CGFloat
    let subtitle: String?
    var isVisible = true

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        FolderCardGradient(
            palette: FolderAccentColor(rawValue: folder.color ?? "")?.cardPalette ?? .neutral,
            shape: FolderCardGradient.shape(for: folder.id),
            seed: FolderCardGradient.seed(for: folder.id),
            // The one card on screen: the same frozen fan the folder's row
            // wears, drifting slowly like the Inbox aurora — with every ray
            // ending above the card's bottom edge on this tall canvas.
            animated: isVisible,
            bottomFade: 1
        )
        .frame(height: height)
        .frame(maxWidth: .infinity)
        .overlay(alignment: .bottomLeading) {
            if let subtitle {
                Text(subtitle)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(
                        colorScheme == .light ? AnyShapeStyle(.secondary) : AnyShapeStyle(.white.opacity(0.75))
                    )
                    .padding(.leading, 20)
                    .padding(.bottom, 14)
            }
        }
        .clipShape(.rect(
            bottomLeadingRadius: 28,
            bottomTrailingRadius: 28,
            style: .continuous
        ))
    }
}
