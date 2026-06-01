import SwiftUI
import UIKit

struct ReadingListView: View {
    var store: ReadingListStore
    @State private var isCaptureCapsuleOpen = false
    @State private var captureDraft = ""
    @State private var shouldFocusCaptureDraft = false
    @State private var isSavingCapture = false
    @State private var captureErrorMessage: String?
    @State private var isReadingListScrolled = false
    @State private var capturePlacement: CapturePlacement = .inlineRow

    var body: some View {
        GeometryReader { geometry in
            readingList(emptyStateHeight: geometry.size.height)
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Color(uiColor: .systemBackground))
        .scrollBounceBehavior(.always, axes: .vertical)
        .refreshable {
            await store.refresh()
        }
        .navigationTitle("Inbox")
        .navigationBarTitleDisplayMode(.large)
        .modifier(NavigationSubtitleIfAvailable(subtitle: navigationSubtitleText))
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    toggleCaptureCapsule()
                } label: {
                    Image(systemName: isCaptureCapsuleOpen ? "xmark" : "plus")
                        .contentTransition(.symbolEffect(.replace))
                }
                .disabled(isSavingCapture)
                .accessibilityLabel(isCaptureCapsuleOpen ? "Close Capture" : "Add Link")
            }
        }
        .task {
            await store.loadIfNeeded()
        }
    }

    private func readingList(emptyStateHeight: CGFloat) -> some View {
        List {
            if store.isLoading && store.savedItems.isEmpty && store.pendingSavedItems.isEmpty {
                ReadingListLoadingRow(height: emptyStateHeight)
            } else if unreadItems.isEmpty && store.pendingSavedItems.isEmpty && !isCaptureCapsuleOpen {
                EmptyReadingListRow(height: emptyStateHeight)
            }

            if isCaptureCapsuleOpen && capturePlacement == .inlineRow {
                Section {
                    captureCapsule
                        .listRowInsets(EdgeInsets(top: 10, leading: 18, bottom: 8, trailing: 18))
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                        .transition(.move(edge: .top).combined(with: .opacity))
                }
            }

            if !store.pendingSavedItems.isEmpty {
                Section {
                    ForEach(store.pendingSavedItems) { item in
                        PendingSavedItemRow(item: item) {
                            store.removePendingSavedItem(item)
                        }
                        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                            Button(role: .destructive) {
                                store.removePendingSavedItem(item)
                            } label: {
                                Label("Remove", systemImage: "trash")
                            }
                        }
                        .listRowInsets(EdgeInsets(top: 0, leading: 18, bottom: 0, trailing: 18))
                        .listRowBackground(Color.clear)
                        .listRowSeparatorTint(.white.opacity(0.08))
                    }
                }
            }

            if let errorMessage = store.errorMessage {
                Section {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundStyle(.red)
                }
                .listRowBackground(Color.clear)
            }

            ForEach(unreadItems) { item in
                SavedItemRow(item: item, showsUnreadIndicator: false) {
                    await markOpened(item)
                } onToggleRead: {
                    await setRead(item, isRead: !item.isRead)
                } onDelete: {
                    await store.delete(item)
                }
                .swipeActions(edge: .leading, allowsFullSwipe: true) {
                    Button {
                        Task {
                            await setRead(item, isRead: !item.isRead)
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
        .safeAreaInset(edge: .top, spacing: 0) {
            if isCaptureCapsuleOpen && capturePlacement == .pinnedInset {
                captureCapsule
                .padding(.horizontal, 18)
                .padding(.top, 6)
                .padding(.bottom, 8)
                .background(.bar)
                .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .onScrollGeometryChange(for: Bool.self) { geometry in
            geometry.contentOffset.y > 8
        } action: { _, isScrolled in
            isReadingListScrolled = isScrolled
        }
        .animation(.snappy(duration: 0.24), value: isCaptureCapsuleOpen)
        .animation(.snappy(duration: 0.24), value: store.pendingSavedItems)
        .animation(.snappy(duration: 0.24), value: store.savedItems)
    }

    private var unreadItems: [SavedItem] {
        store.savedItems.filter { !$0.isRead }
    }

    private func markOpened(_ item: SavedItem) async {
        withAnimation(.snappy(duration: 0.26)) {
            store.prepareForAnimatedReadStateChange(item)
        }

        await store.markOpened(item)
    }

    private func setRead(_ item: SavedItem, isRead: Bool) async {
        withAnimation(.snappy(duration: 0.26)) {
            store.prepareForAnimatedReadStateChange(item)
        }

        await store.setRead(item, isRead: isRead)
    }

    private var captureCapsule: some View {
        CaptureCapsuleRow(
            urlText: $captureDraft,
            shouldFocus: shouldFocusCaptureDraft,
            isSaving: isSavingCapture,
            errorMessage: captureErrorMessage
        ) {
            await saveCaptureDraft()
        }
    }

    private func toggleCaptureCapsule() {
        guard !isSavingCapture else { return }

        withAnimation(.snappy(duration: 0.24)) {
            isCaptureCapsuleOpen.toggle()
        }

        if isCaptureCapsuleOpen {
            capturePlacement = isReadingListScrolled ? .pinnedInset : .inlineRow
            let clipboardURL = Self.clipboardURLString()
            captureDraft = clipboardURL ?? ""
            shouldFocusCaptureDraft = clipboardURL == nil
            captureErrorMessage = nil
        } else {
            captureDraft = ""
            shouldFocusCaptureDraft = false
            captureErrorMessage = nil
        }
    }

    private func saveCaptureDraft() async {
        let submittedURL = captureDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard Self.isLocallySubmittableURL(submittedURL), !isSavingCapture else { return }

        isSavingCapture = true
        captureErrorMessage = nil
        defer { isSavingCapture = false }

        do {
            _ = try await store.capture(submittedURL)
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            closeCaptureCapsule()
        } catch {
            UINotificationFeedbackGenerator().notificationOccurred(.error)
            captureErrorMessage = error.localizedDescription
        }
    }

    private func closeCaptureCapsule() {
        withAnimation(.snappy(duration: 0.24)) {
            isCaptureCapsuleOpen = false
        }
        captureDraft = ""
        shouldFocusCaptureDraft = false
        captureErrorMessage = nil
    }

    private var navigationSubtitleText: String? {
        if !store.isOnline { return "Offline" }
        if !store.isAPIReachable { return "Error reaching API" }
        if !unreadItems.isEmpty {
            return "\(unreadItems.count) unread"
        }

        return nil
    }

    private static func clipboardURLString() -> String? {
        if let url = UIPasteboard.general.url {
            return url.absoluteString
        }

        guard let text = UIPasteboard.general.string?.trimmingCharacters(in: .whitespacesAndNewlines),
              isLocallySubmittableURL(text)
        else {
            return nil
        }

        return text
    }

    private static func isLocallySubmittableURL(_ value: String) -> Bool {
        guard !value.isEmpty,
              let url = URL(string: value),
              url.scheme?.isEmpty == false
        else {
            return false
        }

        return true
    }
}

private enum CapturePlacement {
    case inlineRow
    case pinnedInset
}

private struct NavigationSubtitleIfAvailable: ViewModifier {
    let subtitle: String?

    func body(content: Content) -> some View {
        if #available(iOS 26.0, *), let subtitle {
            content.navigationSubtitle(subtitle)
        } else {
            content
        }
    }
}
