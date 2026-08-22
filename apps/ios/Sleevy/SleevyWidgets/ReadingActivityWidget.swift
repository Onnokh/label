import AppIntents
import SwiftUI
import WidgetKit

// MARK: - Configuration

/// The reading-activity endpoint is public and keyed by profile handle, so the
/// widget holds no credentials. By default it follows the signed-in account:
/// the app fetches the handle and shares it through the app group. The
/// parameter is only an override, for showing someone else's grid.
struct ReadingActivityConfigurationIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource { "Reading Activity" }
    static var description: IntentDescription {
        IntentDescription("Shows a year of sleeved links from a public profile.")
    }

    @Parameter(title: "Profile Handle (optional)")
    var handle: String?
}

// MARK: - Contract

/// Mirror of the API's `ReadingActivityResponse`
/// (`GET /v1/public/profiles/:handle/activity`). Only days with at least one
/// save appear in `days`; everything else in the window counts as zero.
private struct ReadingActivityResponse: Decodable {
    struct Day: Decodable {
        let date: String
        let count: Int
    }

    let handle: String
    let from: String
    let to: String
    let days: [Day]
}

// MARK: - Timeline

struct ReadingActivityEntry: TimelineEntry {
    enum State {
        case grid(cells: [ActivityCell], handle: String)
        case needsHandle
        case unavailable(handle: String)
    }

    let date: Date
    let state: State
}

/// One tile. `count` is nil for the leading pads that align the first day to
/// its weekday row (Sunday is row zero, as on the web profile).
struct ActivityCell: Hashable {
    let count: Int?
}

struct ReadingActivityProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> ReadingActivityEntry {
        ReadingActivityEntry(date: .now, state: .grid(cells: Self.sampleCells(), handle: "sleevy"))
    }

    func snapshot(for configuration: ReadingActivityConfigurationIntent, in context: Context) async -> ReadingActivityEntry {
        if context.isPreview {
            return placeholder(in: context)
        }

        return await entry(for: configuration)
    }

    func timeline(for configuration: ReadingActivityConfigurationIntent, in context: Context) async -> Timeline<ReadingActivityEntry> {
        let entry = await entry(for: configuration)

        // The server caches the response for five minutes and the grid moves
        // at day granularity, so a few hours between fetches is plenty.
        return Timeline(entries: [entry], policy: .after(.now.addingTimeInterval(3 * 60 * 60)))
    }

    private func entry(for configuration: ReadingActivityConfigurationIntent) async -> ReadingActivityEntry {
        // A handle set on the widget wins; otherwise follow the signed-in
        // account, whose handle the app shares through the app group.
        let configured = Self.normalizedHandle(configuration.handle)
        let signedIn = Self.normalizedHandle(SleevyUserPreferences.profileHandle)

        guard let handle = configured ?? signedIn else {
            return ReadingActivityEntry(date: .now, state: .needsHandle)
        }

        do {
            let activity = try await Self.fetchActivity(handle: handle)
            let cells = Self.cells(for: activity)
            return ReadingActivityEntry(date: .now, state: .grid(cells: cells, handle: activity.handle))
        } catch {
            return ReadingActivityEntry(date: .now, state: .unavailable(handle: handle))
        }
    }

    private static func normalizedHandle(_ raw: String?) -> String? {
        guard let raw else { return nil }

        let handle = raw
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .trimmingCharacters(in: CharacterSet(charactersIn: "@"))
            .lowercased()

        return handle.isEmpty ? nil : handle
    }

    private static func fetchActivity(handle: String) async throws -> ReadingActivityResponse {
        let escaped = handle.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? handle
        let url = SleevyAPIEnvironment.baseURL.appendingPathComponent("/v1/public/profiles/\(escaped)/activity")

        var request = URLRequest(url: url)
        request.httpShouldHandleCookies = false

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let http = response as? HTTPURLResponse, (200 ..< 300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }

        return try JSONDecoder().decode(ReadingActivityResponse.self, from: data)
    }

    /// Builds the cell sequence week-aligned with Monday as the top row:
    /// leading pads put the first day on its weekday row, then one cell per
    /// UTC day from `from` through `to`, defaulting missing days to zero.
    private static func cells(for activity: ReadingActivityResponse) -> [ActivityCell] {
        guard
            let start = parseUTCDay(activity.from),
            let end = parseUTCDay(activity.to)
        else { return [] }

        let countsByDate = Dictionary(
            activity.days.map { ($0.date, $0.count) },
            uniquingKeysWith: { first, _ in first }
        )

        var cells: [ActivityCell] = []

        // `weekday` is 1 for Sunday; shift so Monday is index 0.
        let weekday = utcCalendar.component(.weekday, from: start)
        let mondayIndex = (weekday + 5) % 7
        for _ in 0 ..< mondayIndex {
            cells.append(ActivityCell(count: nil))
        }

        var day = start
        while day <= end {
            cells.append(ActivityCell(count: countsByDate[formatUTCDay(day)] ?? 0))
            day = day.addingTimeInterval(24 * 60 * 60)
        }

        return cells
    }

    private static func sampleCells() -> [ActivityCell] {
        // Deterministic pseudo-random counts, so the widget gallery shows a
        // lively grid without a network call.
        (0 ..< 364).map { index in
            let roll = (index * 31 + 17) % 23
            let count = roll > 16 ? roll - 16 : 0
            return ActivityCell(count: count)
        }
    }

    private static let utcCalendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }()

    private static let dayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    private static func parseUTCDay(_ value: String) -> Date? {
        dayFormatter.date(from: value)
    }

    private static func formatUTCDay(_ date: Date) -> String {
        dayFormatter.string(from: date)
    }
}

// MARK: - Views

/// The web profile's activity colors: one indigo hue, four alpha steps, and a
/// faint neutral for empty days (`public-profile-page.module.scss`).
private enum ActivityPalette {
    static let indigo = Color(red: 129 / 255, green: 140 / 255, blue: 248 / 255)

    static func fill(for count: Int?) -> Color {
        guard let count, count > 0 else {
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

struct ReadingActivityWidgetView: View {
    let entry: ReadingActivityEntry

    var body: some View {
        Group {
            switch entry.state {
            case .grid(let cells, _):
                ActivityGridView(cells: cells)
            case .needsHandle:
                message(
                    title: "No profile yet",
                    detail: "Open Sleevy and sign in, or edit this widget to set a handle."
                )
            case .unavailable(let handle):
                message(
                    title: "@\(handle) is unavailable",
                    detail: "Check the handle, and that the profile is public."
                )
            }
        }
        .containerBackground(Color(uiColor: .systemBackground), for: .widget)
    }

    private func message(title: String, detail: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.headline)
            Text(detail)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

/// The web grid is 7 rows (Sunday first) with one column per week and the
/// current week at the trailing edge. A medium widget cannot fit 52 legible
/// weeks, so it sizes tiles from the available height and shows as many
/// trailing weeks as fit.
struct ActivityGridView: View {
    let cells: [ActivityCell]

    private static let gap: CGFloat = 3
    private static let rows = 7

    var body: some View {
        GeometryReader { geometry in
            let gap = Self.gap
            let tileHeight = (geometry.size.height - gap * CGFloat(Self.rows - 1)) / CGFloat(Self.rows)

            // Whole week-columns only, sized from the height: seven fit the
            // small family, sixteen the medium. The tiles stretch a hair so
            // the grid fills the inner rect exactly and the frame stays even.
            let columnCount = max(1, Int((geometry.size.width + gap) / (tileHeight + gap)))
            let tileWidth = (geometry.size.width - gap * CGFloat(columnCount - 1)) / CGFloat(columnCount)
            let columns = trailingColumns(count: columnCount)

            HStack(alignment: .top, spacing: gap) {
                ForEach(0 ..< columns.count, id: \.self) { columnIndex in
                    VStack(spacing: gap) {
                        ForEach(0 ..< Self.rows, id: \.self) { rowIndex in
                            // Square tiles: the only rounding is the
                            // container-concentric clip at the grid corners.
                            Rectangle()
                                .fill(fill(column: columns[columnIndex], row: rowIndex))
                                .frame(width: tileWidth, height: tileHeight)
                        }
                    }
                }
            }
            // Clip the grid as a whole along the widget's own corner curve:
            // resolved once for the full grid, the shape is concentric with
            // this inset, so the corner tiles get cut exactly like GitHub's
            // on every device.
            .clipShape(ContainerRelativeShape())
        }
    }

    /// The trailing calendar weeks, Monday on top. The current week is the
    /// last column; its days after today render as empty tiles so the
    /// rectangle never breaks. A young account pads the front with empty
    /// weeks for the same reason.
    private func trailingColumns(count: Int) -> [[ActivityCell]] {
        var weeks: [[ActivityCell]] = []
        var index = 0
        while index < cells.count {
            weeks.append(Array(cells[index ..< min(index + Self.rows, cells.count)]))
            index += Self.rows
        }

        var trailing = Array(weeks.suffix(count))
        while trailing.count < count {
            trailing.insert([], at: 0)
        }

        return trailing
    }

    private func fill(column: [ActivityCell], row: Int) -> Color {
        guard row < column.count else {
            return ActivityPalette.fill(for: 0)
        }

        return ActivityPalette.fill(for: column[row].count ?? 0)
    }
}

// MARK: - Widget

struct ReadingActivityWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(
            kind: "ReadingActivityWidget",
            intent: ReadingActivityConfigurationIntent.self,
            provider: ReadingActivityProvider()
        ) { entry in
            ReadingActivityWidgetView(entry: entry)
        }
        .configurationDisplayName("Reading Activity")
        .description("Sleeved links, one tile per day. The small widget shows the last seven weeks, the medium one the last sixteen.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
