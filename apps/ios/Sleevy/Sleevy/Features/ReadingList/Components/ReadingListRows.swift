import SwiftUI
import UIKit

struct ReadingListLoadingRow: View {
    let height: CGFloat

    var body: some View {
        ProgressView("Loading your Sleevy...")
            .frame(maxWidth: .infinity, minHeight: height)
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
    }
}

struct EmptyReadingListRow: View {
    let height: CGFloat

    var body: some View {
        ContentUnavailableView(
            "All caught up",
            systemImage: "checkmark.circle",
            description: Text("Unread saves will appear here.")
        )
        .frame(maxWidth: .infinity, minHeight: height)
        .listRowInsets(EdgeInsets())
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
    }
}

struct CaptureCapsuleRow: View {
    @Binding var urlText: String
    let shouldFocus: Bool
    let isSaving: Bool
    let errorMessage: String?
    let onSave: () async -> Void

    @FocusState private var isURLFieldFocused: Bool

    private var canSave: Bool {
        let trimmed = urlText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty,
              let url = URL(string: trimmed),
              url.scheme?.isEmpty == false
        else {
            return false
        }

        return true
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Image(systemName: "link")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .frame(width: 20, height: 20)

                TextField("Paste or type URL", text: $urlText)
                    .focused($isURLFieldFocused)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.done)
                    .disabled(isSaving)
                    .font(.system(size: 15, weight: .medium))
                    .lineLimit(1)
                    .onSubmit {
                        guard canSave else { return }
                        Task {
                            await onSave()
                        }
                    }

                Button {
                    Task {
                        await onSave()
                    }
                } label: {
                    if isSaving {
                        ProgressView()
                            .controlSize(.small)
                            .frame(width: 38, height: 24)
                    } else {
                        Text("Save")
                            .font(.system(size: 14, weight: .semibold))
                            .frame(minWidth: 38, minHeight: 24)
                    }
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
                .disabled(!canSave || isSaving)
            }

            if let errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .fixedSize(horizontal: false, vertical: true)
                    .transition(.opacity)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Color(uiColor: .secondarySystemBackground), in: Capsule())
        .overlay {
            Capsule()
                .stroke(Color.secondary.opacity(0.16), lineWidth: 1)
        }
        .task {
            guard shouldFocus else { return }
            isURLFieldFocused = true
        }
    }
}

struct PendingSavedItemRow: View {
    let item: PendingSavedItem
    let onDelete: () -> Void

    var body: some View {
        Button {
            guard let url = item.url else { return }
            UIApplication.shared.open(url)
        } label: {
            HStack(alignment: .top, spacing: 12) {
                PendingSavedItemStatusIndicator()
                    .padding(.top, 12)

                PendingSavedItemMonogram(host: item.host)

                VStack(alignment: .leading, spacing: 6) {
                    Text(item.title)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .multilineTextAlignment(.leading)

                    Text(item.host)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(.tertiary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Text(item.queuedDateLabel)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
                    .padding(.top, 2)
            }
            .contentShape(Rectangle())
            .padding(.vertical, 14)
        }
        .buttonStyle(.plain)
        .contextMenu {
            if let url = item.url {
                Button {
                    UIPasteboard.general.url = url
                } label: {
                    Label("Copy Link", systemImage: "doc.on.doc")
                }

                ShareLink(
                    item: url,
                    preview: SharePreview(item.title)
                ) {
                    Label("Share", systemImage: "square.and.arrow.up")
                }

                Divider()
            }

            Button(role: .destructive) {
                onDelete()
            } label: {
                Label("Remove", systemImage: "trash")
            }
        }
    }
}

private struct PendingSavedItemStatusIndicator: View {
    var body: some View {
        Image(systemName: "tray.and.arrow.up")
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(.secondary)
            .frame(width: 10, height: 10)
    }
}

private struct PendingSavedItemMonogram: View {
    let host: String

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 11, style: .continuous)
                .fill(Color(uiColor: .secondarySystemFill))

            Text(String(host.prefix(1)).uppercased())
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.secondary)
        }
        .frame(width: 42, height: 42)
        .padding(.vertical, 4)
    }
}

struct SavedItemRow: View {
    let item: SavedItem
    var showsUnreadIndicator = true
    let onOpen: () async -> Void
    let onToggleRead: () async -> Void
    let onDelete: () async -> Void
    var onMove: (() -> Void)? = nil

    var body: some View {
        Button {
            Task {
                await onOpen()
            }
        } label: {
            HStack(alignment: .top, spacing: 12) {
                SavedItemFavicon(item: item)

                VStack(alignment: .leading, spacing: 6) {
                    Text(item.displayTitle)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                        .multilineTextAlignment(.leading)

                    Text(item.displayDomain)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                HStack(spacing: 7) {
                    if showsUnreadIndicator && !item.isRead {
                        Circle()
                            .fill(Color.secondary.opacity(0.55))
                            .frame(width: 7, height: 7)
                    }

                    Text(item.createdDateLabel)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                }
                .padding(.top, 2)
            }
            .contentShape(Rectangle())
            .padding(.vertical, 14)
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button {
                Task {
                    await onToggleRead()
                }
            } label: {
                Label(
                    item.isRead ? "Mark Unread" : "Mark Read",
                    systemImage: item.isRead ? "circle" : "checkmark.circle"
                )
            }

            if let shareURL = item.shareURL {
                Button {
                    copyLink(shareURL)
                } label: {
                    Label("Copy Link", systemImage: "doc.on.doc")
                }

                ShareLink(
                    item: shareURL,
                    preview: SharePreview(item.displayTitle)
                ) {
                    Label("Share", systemImage: "square.and.arrow.up")
                }

                Divider()
            }

            if let onMove {
                Button(action: onMove) {
                    Label("Move to Folder", systemImage: "folder")
                }

                Divider()
            }

            Button(role: .destructive) {
                Task {
                    await onDelete()
                }
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
        .accessibilityAction(named: "Copy Link") {
            guard let shareURL = item.shareURL else { return }
            copyLink(shareURL)
        }
    }

    private func copyLink(_ url: URL) {
        UIPasteboard.general.url = url
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        UIAccessibility.post(notification: .announcement, argument: "Link copied")
    }
}
