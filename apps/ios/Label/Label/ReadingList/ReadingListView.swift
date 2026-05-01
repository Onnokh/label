import SwiftUI

struct ReadingListView: View {
    @EnvironmentObject private var authStore: AuthStore
    @StateObject private var store: ReadingListStore

    init(session: AppSession) {
        _store = StateObject(wrappedValue: ReadingListStore(session: session))
    }

    var body: some View {
        Group {
            if store.isLoading && store.savedItems.isEmpty {
                ProgressView("Loading your reading list...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if store.savedItems.isEmpty {
                ContentUnavailableView(
                    "Nothing saved yet",
                    systemImage: "book.closed",
                    description: Text("Captured links will show up here once they land in Label.")
                )
            } else {
                List {
                    if let errorMessage = store.errorMessage {
                        Section {
                            Text(errorMessage)
                                .font(.footnote)
                                .foregroundStyle(.red)
                        }
                    }

                    ForEach(store.savedItems) { item in
                        SavedItemRow(item: item) {
                            await store.markOpened(item)
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
                    }
                }
                .listStyle(.plain)
                .refreshable {
                    await store.refresh()
                }
            }
        }
        .navigationTitle("Reading List")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Sign out") {
                    Task {
                        await authStore.signOut()
                    }
                }
            }
        }
        .task {
            await store.loadIfNeeded()
        }
    }
}

private struct SavedItemRow: View {
    let item: SavedItem
    let onOpen: () async -> Void

    var body: some View {
        Button {
            Task {
                await onOpen()
            }
        } label: {
            HStack(alignment: .top, spacing: 12) {
                Circle()
                    .fill(item.isRead ? Color.clear : Color.accentColor)
                    .frame(width: 8, height: 8)
                    .overlay {
                        if item.isRead {
                            Circle()
                                .stroke(Color.secondary.opacity(0.25), lineWidth: 1)
                        }
                    }
                    .padding(.top, 6)

                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(item.title ?? item.host)
                            .font(.headline)
                            .foregroundStyle(.primary)
                            .multilineTextAlignment(.leading)

                        if item.enrichmentStatus == .pending {
                            Text("Enriching")
                                .font(.caption.weight(.medium))
                                .foregroundStyle(.secondary)
                        } else if item.enrichmentStatus == .failed {
                            Text("Failed")
                                .font(.caption.weight(.medium))
                                .foregroundStyle(.orange)
                        }
                    }

                    Text(item.host)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)

                    if let summary = item.previewSummary ?? item.description {
                        Text(summary)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .lineLimit(3)
                            .multilineTextAlignment(.leading)
                    }

                    HStack(spacing: 8) {
                        if let generatedType = item.generatedType {
                            Text(generatedType.capitalized)
                        }

                        Text(item.lastSavedAt.formatted(date: .abbreviated, time: .omitted))
                    }
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                }

                Spacer(minLength: 0)
            }
            .contentShape(Rectangle())
            .padding(.vertical, 6)
        }
        .buttonStyle(.plain)
    }
}
