import SwiftUI
import UIKit

// MARK: - Contract

/// Mirror of `GET /v1/public/profiles/:handle` (`PublicProfileDto`).
private struct PublicProfile: Decodable {
    let handle: String
    let joinedAt: Date
    let publicSavedItemCount: Int
    let isIndexable: Bool
}

/// Mirror of `GET /v1/public/profiles/:handle/activity`
/// (`ReadingActivityResponse`): only days with at least one save appear in
/// `days`; every other day in the window counts as zero.
private struct PublicActivity: Decodable {
    struct Day: Decodable {
        let date: String
        let count: Int
    }

    let handle: String
    let from: String
    let to: String
    let days: [Day]
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
@MainActor
@Observable
private final class PublicProfileLoader {
    enum Phase: Equatable {
        case loading
        case loaded
        case missingHandle
        case unavailable
    }

    private(set) var phase = Phase.loading
    private(set) var handle: String?
    private(set) var profile: PublicProfile?
    private(set) var activityCounts: [String: Int] = [:]
    private(set) var activityFrom: Date?
    private(set) var activityTo: Date?
    private(set) var items: [PublicSavedItem] = []
    private(set) var isLoadingMore = false
    private var page = 0
    private var totalPages = 1

    func load() async {
        guard let handle = SleevyUserPreferences.profileHandle else {
            phase = .missingHandle
            return
        }

        self.handle = handle
        if profile == nil { phase = .loading }

        do {
            async let profileFetch: PublicProfile = Self.get("/v1/public/profiles/\(handle)")
            async let activityFetch: PublicActivity = Self.get("/v1/public/profiles/\(handle)/activity")
            async let itemsFetch: PublicSavedItemsPage = Self.get("/v1/public/profiles/\(handle)/saved-items")

            let (profile, activity, firstPage) = try await (profileFetch, activityFetch, itemsFetch)

            self.profile = profile
            activityCounts = Dictionary(
                activity.days.map { ($0.date, $0.count) },
                uniquingKeysWith: { first, _ in first }
            )
            activityFrom = Self.utcDay(activity.from)
            activityTo = Self.utcDay(activity.to)
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

    private static func utcDay(_ value: String) -> Date? {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.date(from: value)
    }
}

// MARK: - View

/// The in-app twin of the web's /u/{handle} page: the sleeved count, the
/// member-since date, the Reading Activity grid, and the published Saved
/// Items grouped by month.
@MainActor
struct MyProfileView: View {
    @State private var loader = PublicProfileLoader()

    var body: some View {
        Group {
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
                profileList
            }
        }
        .navigationTitle(loader.handle.map { "@\($0)" } ?? "My Profile")
        .navigationBarTitleDisplayMode(.large)
        .task {
            await loader.load()
        }
        .refreshable {
            await loader.load()
        }
    }

    private var profileList: some View {
        List {
            Section {
                if let profile = loader.profile {
                    ProfileStatsRow(profile: profile)
                        .listRowInsets(EdgeInsets(top: 8, leading: 18, bottom: 8, trailing: 18))
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                }

                if let from = loader.activityFrom, let to = loader.activityTo {
                    ProfileActivityGrid(counts: loader.activityCounts, from: from, to: to)
                        .listRowInsets(EdgeInsets(top: 8, leading: 18, bottom: 12, trailing: 18))
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                }
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
        .background(Color(uiColor: .systemBackground))
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

private struct ProfileStatsRow: View {
    let profile: PublicProfile

    var body: some View {
        HStack(spacing: 20) {
            stat(
                value: "\(profile.publicSavedItemCount)",
                label: "Sleeved"
            )

            Rectangle()
                .fill(Color.primary.opacity(0.08))
                .frame(width: 1, height: 40)

            stat(
                value: profile.joinedAt.formatted(.dateTime.month(.abbreviated).year()),
                label: "Member Since"
            )

            Spacer()
        }
    }

    private func stat(value: String, label: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(value)
                .font(.system(size: 24, weight: .bold))
                .monospacedDigit()

            Text(label)
                .font(.system(size: 11, weight: .semibold))
                .kerning(1.0)
                .textCase(.uppercase)
                .foregroundStyle(.secondary)
        }
    }
}

/// The web profile's Reading Activity grid: 7 rows (Monday on top), one
/// column per week across the whole 52-week window, sized to the width.
private struct ProfileActivityGrid: View {
    let counts: [String: Int]
    let from: Date
    let to: Date

    private static let gap: CGFloat = 2.5
    private static let rows = 7

    var body: some View {
        let columns = weekColumns

        GeometryReader { geometry in
            let gap = Self.gap
            let tile = (geometry.size.width - gap * CGFloat(columns.count - 1)) / CGFloat(columns.count)

            HStack(alignment: .top, spacing: gap) {
                ForEach(0 ..< columns.count, id: \.self) { columnIndex in
                    VStack(spacing: gap) {
                        ForEach(0 ..< Self.rows, id: \.self) { rowIndex in
                            RoundedRectangle(cornerRadius: tile * 0.3, style: .continuous)
                                .fill(fill(column: columns[columnIndex], row: rowIndex))
                                .frame(width: tile, height: tile)
                        }
                    }
                }
            }
        }
        .aspectRatio(aspectRatio, contentMode: .fit)
        .accessibilityLabel("Reading activity for the last year")
    }

    private var aspectRatio: CGFloat {
        let columns = CGFloat(weekColumns.count)
        let rows = CGFloat(Self.rows)
        // tile*columns + gap*(columns-1) wide by tile*rows + gap*(rows-1)
        // tall; gaps are small enough that tile ratio dominates.
        return (columns + Self.gap / 10 * (columns - 1)) / (rows + Self.gap / 10 * (rows - 1))
    }

    /// One cell per UTC day, Monday-aligned like the home-screen widget:
    /// leading pads put the first day on its weekday row, trailing future
    /// days render as empty tiles.
    private var weekColumns: [[Int?]] {
        var cells: [Int?] = []

        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!

        let weekday = calendar.component(.weekday, from: from)
        let mondayIndex = (weekday + 5) % 7
        cells.append(contentsOf: Array(repeating: nil, count: mondayIndex))

        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "yyyy-MM-dd"

        var day = from
        while day <= to {
            cells.append(counts[formatter.string(from: day)] ?? 0)
            day = day.addingTimeInterval(24 * 60 * 60)
        }

        var weeks: [[Int?]] = []
        var index = 0
        while index < cells.count {
            weeks.append(Array(cells[index ..< min(index + Self.rows, cells.count)]))
            index += Self.rows
        }

        return weeks
    }

    /// The web page's palette: one indigo hue, four alpha steps, and a faint
    /// neutral for empty days.
    private func fill(column: [Int?], row: Int) -> Color {
        let indigo = Color(red: 129 / 255, green: 140 / 255, blue: 248 / 255)

        guard row < column.count, let count = column[row], count > 0 else {
            return .primary.opacity(0.06)
        }

        switch count {
        case 1: return indigo.opacity(0.35)
        case 2 ... 3: return indigo.opacity(0.55)
        case 4 ... 6: return indigo.opacity(0.75)
        default: return indigo
        }
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
