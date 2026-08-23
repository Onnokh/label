import SwiftUI
import UIKit

// MARK: - Contract

/// Mirror of `GET /v1/public/profiles/:handle` (`PublicProfileDto`).
struct PublicProfile: Decodable {
    let handle: String
    let joinedAt: Date
    let publicSavedItemCount: Int
    let isIndexable: Bool
}

/// Mirror of one entry of `GET /v1/public/profiles/:handle/saved-items`
/// (`PublicSavedItemDto`). A profile publishes a Link at most once, so the
/// original URL identifies the row.
struct PublicSavedItem: Decodable, Identifiable, Equatable {
    let originalUrl: String
    let host: String
    let title: String?
    let faviconUrl: String?
    let imageUrl: String?
    let authorName: String?
    let authorHandle: String?
    let type: String
    let tags: [String]
    let previewSummary: String?
    let savedAt: Date

    var id: String { originalUrl }
}

private struct PublicSavedItemsPage: Decodable {
    let savedItems: [PublicSavedItem]
    let page: Int
    let pageSize: Int
    let totalPages: Int
}

// MARK: - Loader

/// Loads the signed-in account's Public Profile through the same public
/// endpoints the web page uses, keyed by the handle the app shares through
/// the app group at sign-in. No credentials are involved: this page shows
/// exactly what a visitor of /u/{handle} sees.
///
/// One instance lives in `SignedInTabView` and reaches the page through the
/// environment, so content survives pops of the profile page: revisits show
/// the cached page immediately while `load()` revalidates behind it.
@MainActor
@Observable
final class PublicProfileLoader {
    enum Phase: Equatable {
        case loading
        case loaded
        case missingHandle
        case unavailable
    }

    private(set) var phase = Phase.loading
    private(set) var handle: String?
    private(set) var profile: PublicProfile?
    private(set) var items: [PublicSavedItem] = []
    private(set) var isLoadingMore = false
    private var page = 0
    private var totalPages = 1

    func load() async {
        guard let handle = SleevyUserPreferences.profileHandle else {
            phase = .missingHandle
            return
        }

        // Content cached for another handle (a rename, or a different account
        // after re-sign-in) must not flash before the fresh fetch.
        if handle != self.handle {
            profile = nil
            items = []
            page = 0
            totalPages = 1
        }

        self.handle = handle
        if profile == nil { phase = .loading }

        do {
            async let profileFetch: PublicProfile = Self.get("/v1/public/profiles/\(handle)")
            async let itemsFetch: PublicSavedItemsPage = Self.get("/v1/public/profiles/\(handle)/saved-items")

            let (profile, firstPage) = try await (profileFetch, itemsFetch)

            self.profile = profile
            items = firstPage.savedItems
            page = firstPage.page
            totalPages = firstPage.totalPages
            phase = .loaded
        } catch {
            // The endpoint answers a private profile with the same not-found
            // it gives an unknown handle, so both land here.
            if profile == nil { phase = .unavailable }
        }
    }

    func loadMoreIfNeeded(current item: PublicSavedItem) async {
        guard
            item.id == items.last?.id,
            page < totalPages,
            !isLoadingMore
        else { return }

        guard let handle else { return }

        isLoadingMore = true
        defer { isLoadingMore = false }

        do {
            let next: PublicSavedItemsPage = try await Self.get(
                "/v1/public/profiles/\(handle)/saved-items",
                query: [URLQueryItem(name: "page", value: String(page + 1))]
            )
            let known = Set(items.map(\.id))
            items.append(contentsOf: next.savedItems.filter { !known.contains($0.id) })
            page = next.page
            totalPages = next.totalPages
        } catch {
            // A failed page keeps the current list; scrolling retries.
        }
    }

    private static func get<Response: Decodable>(
        _ path: String,
        query: [URLQueryItem] = []
    ) async throws -> Response {
        var components = URLComponents(
            url: AppConfig.apiBaseURL.appendingPathComponent(path),
            resolvingAgainstBaseURL: false
        )
        if !query.isEmpty { components?.queryItems = query }

        guard let url = components?.url else { throw URLError(.badURL) }

        var request = URLRequest(url: url)
        request.httpShouldHandleCookies = false

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200 ..< 300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }

        return try JSONDecoder.sharedISO8601.decode(Response.self, from: data)
    }
}

// MARK: - View

/// The in-app twin of the web's /u/{handle} page: the sleeved count, the
/// member-since date, the Reading Activity grid, and the published Saved
/// Items grouped by month.
@MainActor
struct MyProfileView: View {
    /// Breathing room between the large title (already part of the top safe
    /// area on this screen) and the avatar below it.
    private static let titleAllowance: CGFloat = 16

    @Environment(PublicProfileLoader.self) private var loader
    @Environment(AuthStore.self) private var authStore
    let session: AppSession
    @State private var headerScrollDistance: CGFloat = 0
    @State private var headerTopInsetBaseline: CGFloat = 0

    var body: some View {
        GeometryReader { geometry in
            switch loader.phase {
            case .loading:
                ProgressView("Loading your profile...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            case .missingHandle:
                ContentUnavailableView(
                    "No Profile Yet",
                    systemImage: "person.crop.circle.badge.questionmark",
                    description: Text("Your profile handle has not loaded yet. Pull to retry.")
                )
            case .unavailable:
                ContentUnavailableView(
                    "Profile is Private",
                    systemImage: "lock",
                    description: Text("Only public profiles have a page. You can make yours public on the web.")
                )
            case .loaded:
                profileList(headerTopInset: geometry.safeAreaInsets.top)
            }
        }
        // Outside the header-card background, so the card paints on top of it.
        .background(Color(uiColor: .systemBackground))
        .navigationTitle("My Profile")
        .navigationBarTitleDisplayMode(.large)
        .task {
            await loader.load()
        }
        .refreshable {
            await loader.load()
        }
    }

    private func profileList(headerTopInset: CGFloat) -> some View {
        // The card ends halfway down the avatar, which straddles the card's
        // bottom edge like a traditional profile header.
        let headerCardHeight = headerTopInset + Self.titleAllowance + profileAvatarSize / 2

        return List {
            Section {
                VStack(spacing: 4) {
                    if let handle = loader.handle {
                        Text("@\(handle)")
                            .font(.system(size: 24, weight: .bold))
                    }

                    if let count = loader.profile?.publicSavedItemCount {
                        Text("\(count) Sleeved")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(.secondary)
                    }
                }
                .frame(maxWidth: .infinity)
                .listRowInsets(EdgeInsets(top: 0, leading: 18, bottom: 14, trailing: 18))
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
            }

            ForEach(monthSections, id: \.title) { section in
                Section {
                    ForEach(section.items) { item in
                        PublicSavedItemRow(item: item)
                            .listRowInsets(EdgeInsets(top: 0, leading: 18, bottom: 0, trailing: 18))
                            .listRowBackground(Color.clear)
                            .listRowSeparatorTint(.primary.opacity(0.08))
                            .task {
                                await loader.loadMoreIfNeeded(current: item)
                            }
                    }
                } header: {
                    Text(section.title)
                        .font(.system(size: 13, weight: .semibold))
                        .kerning(1.1)
                        .foregroundStyle(.secondary)
                }
            }

            if loader.isLoadingMore {
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .scrollBounceBehavior(.always, axes: .vertical)
        // Same mechanics as the Inbox and folder header cards: the large
        // title stays native, the card paints behind it from the top edge,
        // scrolls away with the content, and stretches on pull-down. The
        // content margin also clears the avatar's bottom half.
        .contentMargins(
            .top,
            max(0, headerCardHeight - headerTopInset) + profileAvatarSize / 2 + 14,
            for: .scrollContent
        )
        .background(alignment: .top) {
            ProfileHeroCard(height: headerCardHeight + max(0, -headerScrollDistance)) {
                ProfileAvatar(
                    name: session.displayName,
                    imageURL: session.provider == .google ? authStore.googleUserProfile?.imageURL : nil
                )
            }
            .offset(y: -max(0, headerScrollDistance))
            .ignoresSafeArea(edges: .top)
        }
        .onScrollGeometryChange(for: ProfileHeaderScrollReading.self) { geometry in
            ProfileHeaderScrollReading(
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

    private struct MonthSection {
        let title: String
        let items: [PublicSavedItem]
    }

    /// The published items grouped into "AUGUST 2026"-style sections, newest
    /// month first; the API already orders items newest first within it.
    private var monthSections: [MonthSection] {
        var sections: [MonthSection] = []
        var currentKey: String?

        for item in loader.items {
            let title = item.savedAt.formatted(.dateTime.month(.wide).year()).uppercased()
            if title != currentKey {
                sections.append(MonthSection(title: title, items: []))
                currentKey = title
            }
            sections[sections.count - 1] = MonthSection(
                title: title,
                items: sections[sections.count - 1].items + [item]
            )
        }

        return sections
    }
}

// MARK: - Header pieces

private struct ProfileHeaderScrollReading: Equatable {
    var offset: CGFloat
    var inset: CGFloat
}

/// The avatar's diameter; the header card ends at its vertical center.
private let profileAvatarSize: CGFloat = 96

/// The card behind the profile's large title — the Inbox and folder header
/// cards' sibling, full-bleed from the top and side edges with rounded
/// bottom corners. The avatar overlays the card's bottom edge, half in and
/// half out, so it rides along when a pull-down stretches the card.
private struct ProfileHeroCard<Avatar: View>: View {
    let height: CGFloat
    @ViewBuilder let avatar: Avatar

    var body: some View {
        Rectangle()
            .fill(Color(uiColor: .secondarySystemBackground))
            .frame(height: height)
            .frame(maxWidth: .infinity)
            .clipShape(.rect(
                bottomLeadingRadius: 28,
                bottomTrailingRadius: 28,
                style: .continuous
            ))
            // After the clip, so the hanging half is not cut off.
            .overlay(alignment: .bottom) {
                avatar.offset(y: profileAvatarSize / 2)
            }
    }
}

/// The circular avatar that straddles the header card's bottom edge, ringed
/// so it reads as sitting on top of the card, like a traditional profile.
private struct ProfileAvatar: View {
    let name: String
    let imageURL: URL?

    var body: some View {
        ZStack {
            Circle()
                .fill(Color(uiColor: .tertiarySystemFill))

            if let imageURL {
                AsyncImage(url: imageURL) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    monogram
                }
            } else {
                monogram
            }
        }
        .frame(width: profileAvatarSize, height: profileAvatarSize)
        .clipShape(Circle())
        .overlay(
            Circle().strokeBorder(Color(uiColor: .systemBackground), lineWidth: 4)
        )
        .accessibilityHidden(true)
    }

    private var monogram: some View {
        Text(name.initials)
            .font(.system(size: 30, weight: .semibold))
            .foregroundStyle(.secondary)
    }
}


// MARK: - Item row

private struct PublicSavedItemRow: View {
    let item: PublicSavedItem

    var body: some View {
        Button {
            guard let url = URL(string: item.originalUrl) else { return }
            UIApplication.shared.open(url)
        } label: {
            HStack(alignment: .top, spacing: 12) {
                PublicSavedItemFavicon(host: item.host, faviconUrl: item.faviconUrl)

                VStack(alignment: .leading, spacing: 5) {
                    if let authorName = item.authorName {
                        Text(authorLine(authorName))
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }

                    Text(item.title ?? item.originalUrl)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.primary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)

                    if let summary = item.previewSummary {
                        Text(summary)
                            .font(.system(size: 13))
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                    }

                    HStack(spacing: 6) {
                        Text(item.host)
                        Text("·")
                        Text(item.savedAt.formatted(.dateTime.month(.abbreviated).day()))
                    }
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.tertiary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                if let imageUrl = item.imageUrl.flatMap(URL.init(string:)) {
                    AsyncImage(url: imageUrl) { image in
                        image.resizable().scaledToFill()
                    } placeholder: {
                        Color(uiColor: .secondarySystemFill)
                    }
                    .frame(width: 56, height: 56)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
            }
            .contentShape(Rectangle())
            .padding(.vertical, 12)
        }
        .buttonStyle(.plain)
        .contextMenu {
            if let url = URL(string: item.originalUrl) {
                Button {
                    UIPasteboard.general.url = url
                } label: {
                    Label("Copy Link", systemImage: "doc.on.doc")
                }

                ShareLink(item: url, preview: SharePreview(item.title ?? item.host)) {
                    Label("Share", systemImage: "square.and.arrow.up")
                }
            }
        }
    }

    private func authorLine(_ name: String) -> String {
        guard let handle = item.authorHandle else { return name }
        // Providers differ on whether the handle already carries the "@".
        let bare = handle.hasPrefix("@") ? String(handle.dropFirst()) : handle
        return "\(name) @\(bare)"
    }
}

private struct PublicSavedItemFavicon: View {
    let host: String
    let faviconUrl: String?

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 11, style: .continuous)
                .fill(Color(uiColor: .secondarySystemFill))

            if let url = faviconUrl.flatMap(URL.init(string:)) {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFit()
                        .frame(width: 20, height: 20)
                        .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                } placeholder: {
                    monogram
                }
            } else {
                monogram
            }
        }
        .frame(width: 42, height: 42)
        .padding(.vertical, 2)
        .accessibilityHidden(true)
    }

    private var monogram: some View {
        Text(String(host.prefix(1)).uppercased())
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(.secondary)
    }
}
