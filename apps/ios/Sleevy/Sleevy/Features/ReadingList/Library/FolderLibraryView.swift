import SwiftUI

@MainActor
struct FolderLibraryView: View {
    let folder: Folder
    var store: Library
    @State private var filter = LibraryFilter()
    @State private var sort = LibrarySort.newest
    @State private var isShowingFilters = false
    @State private var itemToMove: SavedItem?
    @State private var headerScrollDistance: CGFloat = 0
    @State private var headerTopInsetBaseline: CGFloat = 0

    var body: some View {
        GeometryReader { geometry in
            // Shorter than the Inbox's 16:9 — a folder header only carries
            // the title and subtitle.
            folderList(
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
            LibraryFilterSheet(filter: $filter, tags: tagFilters, sources: sourceFilters, types: typeFilters)
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

    private func folderList(headerCardHeight: CGFloat, headerTopInset: CGFloat) -> some View {
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
                .listRowSeparatorTint(.primary.opacity(0.08))
                // No line between the header card and the first row.
                .listRowSeparator(item.id == visibleItems.first?.id ? .hidden : .automatic, edges: .top)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .scrollBounceBehavior(.always, axes: .vertical)
        // Same mechanics as the Inbox header card: the large title stays
        // native, the card is painted behind it, scrolls away with the
        // content, and stretches on pull-down. Here the card is a flat wash
        // of the folder's color, telling a folder apart from the Inbox.
        .contentMargins(.top, max(0, headerCardHeight - headerTopInset), for: .scrollContent)
        .background(alignment: .top) {
            FolderHeaderCard(
                tint: FolderAccentColor(rawValue: currentFolder.color ?? "")?.tint,
                height: headerCardHeight + max(0, -headerScrollDistance),
                subtitle: navigationSubtitleText
            )
            .offset(y: -max(0, headerScrollDistance))
            .ignoresSafeArea(edges: .top)
        }
        .onScrollGeometryChange(for: FolderHeaderScrollReading.self) { geometry in
            FolderHeaderScrollReading(
                offset: geometry.contentOffset.y,
                inset: geometry.contentInsets.top
            )
        } action: { _, reading in
            // See the Inbox: measure against a resting baseline so the
            // refresh spinner's transient inset never jolts the card.
            guard reading.inset > 0 else { return }

            if reading.inset <= headerTopInsetBaseline || headerScrollDistance >= 0 {
                headerTopInsetBaseline = reading.inset
            }
            headerScrollDistance = reading.offset + headerTopInsetBaseline
        }
    }

    private var currentFolder: Folder {
        store.folders.first(where: { $0.id == folder.id }) ?? folder
    }

    private var items: [SavedItem] {
        store.snapshot(for: .folder(currentFolder.id)).items
    }

    /// "12 saves · 3 unread", dropping the unread part once everything is
    /// read, and the whole subtitle while the folder is empty.
    private var navigationSubtitleText: String? {
        let total = items.count
        guard total > 0 else { return nil }

        let saves = total == 1 ? "1 save" : "\(total) saves"
        let unread = items.count { !$0.isRead }
        return unread > 0 ? "\(saves) · \(unread) unread" : saves
    }

    private var visibleItems: [SavedItem] {
        libraryItems.filtered(by: filter, sortedBy: sort)
    }
    private var tagFilters: [LibraryFilterOption] { libraryItems.options(for: .tag, order: .name) }
    private var sourceFilters: [LibraryFilterOption] { libraryItems.options(for: .source, order: .name) }
    private var typeFilters: [LibraryFilterOption] { libraryItems.options(for: .type, order: .name) }

    private var libraryItems: LibraryItems {
        LibraryItems(items: items)
    }
}

/// One folder in the folders grid: a large tinted folder icon, a three-dot
/// actions menu, the name, and how many Saved Items live inside. A folder
/// with an accent color tints the whole card; one without stays neutral.
struct FolderCard: View {
    let folder: Folder
    let itemCount: Int
    let onRename: @MainActor () -> Void
    let onDelete: @MainActor () -> Void

    @Environment(\.pushRoute) private var pushRoute

    private var accent: Color? {
        FolderAccentColor(rawValue: folder.color ?? "")?.tint
    }

    var body: some View {
        // Layered by hand, pushing through `pushRoute` instead of being a
        // NavigationLink (see the environment key for why). The clear button
        // is the tap target, the visuals ignore touches, and only the menu
        // floats above it.
        ZStack(alignment: .topTrailing) {
            Button {
                pushRoute(.folder(id: folder.id))
            } label: {
                Color.clear.contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(folder.name)
            .accessibilityValue(accessibilityCountLabel)

            VStack(alignment: .leading, spacing: 5) {
                FolderGlyph(
                    emoji: folder.emoji,
                    tint: accent ?? Color(uiColor: .systemGray)
                )
                .frame(width: 54, height: 48)

                Spacer(minLength: 14)

                Text(folder.name)
                    .font(.system(size: 23, weight: .bold))
                    .foregroundStyle(accent ?? Color.primary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)

                Text(countLabel)
                    .font(.system(size: 13, weight: .semibold))
                    .kerning(0.5)
                    .foregroundStyle(accent?.opacity(0.55) ?? Color.secondary)
            }
            .padding(18)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .allowsHitTesting(false)
            .accessibilityHidden(true)

            Menu {
                actions
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 17, weight: .semibold))
                    .rotationEffect(.degrees(90))
                    .foregroundStyle(accent?.opacity(0.75) ?? Color.secondary)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("Folder Actions")
            .padding(6)
        }
        .aspectRatio(1.15, contentMode: .fit)
        .background(
            accent?.opacity(0.12) ?? Color(uiColor: .secondarySystemBackground),
            in: RoundedRectangle(cornerRadius: 20, style: .continuous)
        )
        .contextMenu {
            actions
        }
    }

    @ViewBuilder
    private var actions: some View {
        Button(action: onRename) {
            Label("Rename", systemImage: "pencil")
        }

        Button(role: .destructive, action: onDelete) {
            Label("Delete", systemImage: "trash")
        }
    }

    private var countLabel: String {
        itemCount == 1 ? "1 SAVE" : "\(itemCount) SAVES"
    }

    private var accessibilityCountLabel: String {
        itemCount == 1 ? "1 saved item" : "\(itemCount) saved items"
    }
}

/// The two-column layout every folders grid shares.
enum FolderGrid {
    static let spacing: CGFloat = 12
    static let columns = [
        GridItem(.flexible(), spacing: spacing),
        GridItem(.flexible(), spacing: spacing),
    ]
}

struct AllFoldersView: View {
    var store: Library
    @State private var folderEditor: FolderEditor?
    @State private var folderToDelete: Folder?

    var body: some View {
        List {
            LazyVGrid(columns: FolderGrid.columns, spacing: FolderGrid.spacing) {
                ForEach(store.folders) { folder in
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
            .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
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

    private func folderCount(_ id: String) -> Int {
        store.snapshot(for: .completeLibrary).items.count { $0.folder?.id == id }
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

/// What the header card needs from the scroll geometry.
private struct FolderHeaderScrollReading: Equatable {
    var offset: CGFloat
    var inset: CGFloat
}

/// The card behind a folder's large title — the Inbox header card's sibling,
/// with a flat wash of the folder's accent color instead of the aurora
/// (neutral for a folder without one). The counts render inside the card:
/// `navigationSubtitle` on a pushed screen collapses the large title to
/// inline, so the system subtitle is not an option here.
private struct FolderHeaderCard: View {
    let tint: Color?
    let height: CGFloat
    let subtitle: String?

    var body: some View {
        Rectangle()
            .fill(tint?.opacity(0.2) ?? Color(uiColor: .secondarySystemBackground))
            .frame(height: height)
            .frame(maxWidth: .infinity)
            .overlay(alignment: .bottomLeading) {
                if let subtitle {
                    Text(subtitle)
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(.secondary)
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

/// The folder silhouette the cards use: a tabbed body with rounded corners.
/// `folder.fill` is too wide and flat for the card's hero position, so the
/// glyph is drawn by hand and given depth with a darker extruded lip.
private struct FolderGlyphShape: Shape {
    func path(in rect: CGRect) -> Path {
        let tabWidth = rect.width * 0.45
        let tabHeight = rect.height * 0.20
        let slant = rect.width * 0.10
        let bodyRadius = min(rect.width, rect.height) * 0.18
        let tabRadius = bodyRadius * 0.55

        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: rect.midY))
        path.addArc(
            tangent1End: CGPoint(x: rect.minX, y: rect.minY),
            tangent2End: CGPoint(x: rect.minX + tabWidth, y: rect.minY),
            radius: tabRadius
        )
        path.addArc(
            tangent1End: CGPoint(x: rect.minX + tabWidth, y: rect.minY),
            tangent2End: CGPoint(x: rect.minX + tabWidth + slant, y: rect.minY + tabHeight),
            radius: tabRadius
        )
        path.addArc(
            tangent1End: CGPoint(x: rect.minX + tabWidth + slant, y: rect.minY + tabHeight),
            tangent2End: CGPoint(x: rect.maxX, y: rect.minY + tabHeight),
            radius: tabRadius
        )
        path.addArc(
            tangent1End: CGPoint(x: rect.maxX, y: rect.minY + tabHeight),
            tangent2End: CGPoint(x: rect.maxX, y: rect.maxY),
            radius: tabRadius
        )
        path.addArc(
            tangent1End: CGPoint(x: rect.maxX, y: rect.maxY),
            tangent2End: CGPoint(x: rect.minX, y: rect.maxY),
            radius: bodyRadius
        )
        path.addArc(
            tangent1End: CGPoint(x: rect.minX, y: rect.maxY),
            tangent2End: CGPoint(x: rect.minX, y: rect.minY),
            radius: bodyRadius
        )
        path.closeSubpath()
        return path
    }
}

struct FolderGlyph: View {
    let emoji: String?
    let tint: Color

    var body: some View {
        GeometryReader { proxy in
            let size = proxy.size
            let lip = size.height * 0.10
            let glyph = CGRect(x: 0, y: 0, width: size.width, height: size.height - lip)

            ZStack(alignment: .topLeading) {
                FolderGlyphShape()
                    .path(in: glyph.offsetBy(dx: 0, dy: lip))
                    .fill(tint)
                    .brightness(-0.22)

                FolderGlyphShape()
                    .path(in: glyph)
                    .fill(tint)
                    .overlay {
                        LinearGradient(
                            colors: [Color.white.opacity(0.45), Color.white.opacity(0.02)],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                        .blendMode(.softLight)
                        .clipShape(FolderGlyphShape().path(in: glyph))
                    }

                if let emoji {
                    Text(emoji)
                        .font(.system(size: glyph.height * 0.42))
                        .frame(width: glyph.width, height: glyph.height * 0.8)
                        .offset(y: glyph.height * 0.2)
                }
            }
        }
        .accessibilityHidden(true)
    }
}

struct FolderIcon: View {
    let emoji: String?
    let color: FolderAccentColor?
    var fallbackTint: Color = .accentColor

    var body: some View {
        GeometryReader { proxy in
            let size = min(proxy.size.width, proxy.size.height)

            ZStack {
                Image(systemName: "folder.fill")
                    .resizable()
                    .scaledToFit()
                    .foregroundStyle((color?.tint ?? fallbackTint).gradient)

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
