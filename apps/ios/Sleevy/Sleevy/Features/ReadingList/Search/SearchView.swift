import SwiftUI

@MainActor
struct SearchView: View {
    var store: Library
    @State private var query = ""
    @State private var isRetryingLoad = false

    var body: some View {
        Group {
            if store.isLoading && store.savedItems().isEmpty {
                ProgressView("Loading your Sleevy...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if store.savedItems().isEmpty, let loadFailureMessage {
                VStack(spacing: 16) {
                    ContentUnavailableView(
                        "Unable to Load Sleevy",
                        systemImage: "wifi.exclamationmark",
                        description: Text(loadFailureMessage)
                    )

                    Button {
                        Task {
                            await retryLoad()
                        }
                    } label: {
                        if isRetryingLoad {
                            ProgressView()
                        } else {
                            Label("Try Again", systemImage: "arrow.clockwise")
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(isRetryingLoad)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if trimmedQuery.isEmpty {
                ContentUnavailableView(
                    "Search Sleevy",
                    systemImage: "magnifyingglass",
                    description: Text("Search saved titles, domains, tags, and links.")
                )
            } else if filteredItems.isEmpty {
                ContentUnavailableView.search(text: trimmedQuery)
            } else {
                List(filteredItems) { item in
                    SavedItemRow(item: item) {
                        await store.markOpened(item)
                    } onToggleRead: {
                        await store.setRead(item, isRead: !item.isRead)
                    } onDelete: {
                        await store.delete(item)
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
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                .background(Color(uiColor: .systemBackground))
            }
        }
        .navigationTitle("Search")
        .navigationBarTitleDisplayMode(.large)
        .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always))
        .task {
            await store.loadIfNeeded()
        }
        .refreshable {
            await store.refresh()
        }
    }

    private var filteredItems: [SavedItem] {
        let query = trimmedQuery.lowercased()
        guard !query.isEmpty else { return [] }

        return store.savedItems().filter { item in
            item.searchableText.localizedCaseInsensitiveContains(query)
        }
    }

    private var trimmedQuery: String {
        query.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var loadFailureMessage: String? {
        if !store.isOnline {
            return "Connect to the internet, then try again."
        }

        if let errorMessage = store.errorMessage {
            return errorMessage
        }

        if !store.isAPIReachable {
            return "Sleevy could not reach the API. Try again in a moment."
        }

        return nil
    }

    private func retryLoad() async {
        guard !isRetryingLoad else { return }
        isRetryingLoad = true
        defer { isRetryingLoad = false }
        await store.retryLoad()
    }
}

private extension SavedItem {
    var searchTitle: String {
        title?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmptyValue
            ?? siteName?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmptyValue
            ?? searchDomain
    }

    var searchDomain: String {
        host.replacingOccurrences(
            of: #"^www\."#,
            with: "",
            options: .regularExpression
        )
    }

    var searchableText: String {
        [
            searchTitle,
            searchDomain,
            description,
            previewSummary,
            type,
            tags.joined(separator: " "),
            originalURL,
            canonicalURL,
        ]
        .compactMap { $0 }
        .joined(separator: " ")
    }

    var searchURL: URL? {
        Self.safeURL(canonicalURL) ?? Self.safeURL(originalURL)
    }

    var searchMonogram: String {
        String(searchDomain.prefix(1)).uppercased()
    }

    private static func safeURL(_ value: String?) -> URL? {
        guard
            let value,
            let url = URL(string: value),
            let scheme = url.scheme?.lowercased(),
            scheme == "http" || scheme == "https"
        else {
            return nil
        }

        return url
    }
}
