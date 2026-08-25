import Foundation

/// Marketing-capture mode: a fabricated Account, Saved Items, Folders, and
/// Public Profile that stand in for the signed-in account so App Store
/// screenshots never show a real reader's library.
///
/// Enabled only when the app is launched with `SLEEVY_DEMO_MODE=1`, which the
/// screenshot run passes through `simctl launch`. Nothing here reaches the API:
/// `DemoReadingListAdapter` answers every reading-list verb from these
/// fixtures, and `AuthStore`, `ProfileStore`, and `PublicProfileLoader`
/// short-circuit to the demo record. Release builds still compile it in, but
/// the environment variable is absent, so the flag stays false.
nonisolated enum DemoMode {
    static var isEnabled: Bool {
        ProcessInfo.processInfo.environment["SLEEVY_DEMO_MODE"] == "1"
    }

    /// A demo Account. `provider` is Apple on purpose: the account toolbar only
    /// reads a remote avatar for Google sessions, so the demo avatar stays a
    /// generated monogram rather than a real person's photo.
    static let session = AppSession(
        token: "demo-session-token",
        userId: "demo-maya",
        email: "maya@example.com",
        name: "Maya Chen",
        provider: .apple
    )

    static let profile = Profile(handle: "maya", visibility: .public)

    /// Mirrors the flag into the shared app group so the share extension —
    /// which never sees the launch environment — captures in demo mode too.
    /// Always writes, so a normal launch clears a flag left by a capture run.
    static func publishSharedFlag() {
        DemoCaptureFlag.isOn = isEnabled
    }
}

// MARK: - Folders

nonisolated extension DemoMode {
    static let folders: [Folder] = [
        Folder(id: "demo-folder-design", name: "Design", emoji: "🎨", color: "purple", isPublished: true),
        Folder(id: "demo-folder-engineering", name: "Engineering", emoji: "⚙️", color: "blue", isPublished: true),
        Folder(id: "demo-folder-longreads", name: "Longreads", emoji: "📖", color: "orange", isPublished: true),
        Folder(id: "demo-folder-recipes", name: "Recipes", emoji: "🍜", color: "green", isPublished: false),
        Folder(id: "demo-folder-travel", name: "Travel", emoji: "✈️", color: "teal", isPublished: false),
    ]

    private static func folderSummary(_ id: String) -> FolderSummary? {
        guard let folder = folders.first(where: { $0.id == id }) else { return nil }
        return FolderSummary(id: folder.id, name: folder.name, emoji: folder.emoji, color: folder.color)
    }
}

// MARK: - Saved Items

nonisolated extension DemoMode {
    /// Every demo Saved Item. The Inbox projects the unread ones, the Library
    /// root projects the unfiled ones, and each Folder projects its own — all
    /// from this one list, exactly like the real retrieval index does.
    static let savedItems: [SavedItem] = [
        // Unfiled and unread — the top of the Inbox.
        item("craigmod.com", "Fast Software, the Best Software",
             "Software that responds instantly respects the person using it.",
             minutes: 35),
        item("paulgraham.com", "How to Do Great Work",
             "Choose work you have a natural aptitude for and a deep interest in.",
             hours: 2),
        item("swiftbysundell.com", "Observation in SwiftUI, explained",
             "How the Observation framework changes the way views track state.",
             hours: 3, folder: "demo-folder-engineering"),
        item("quantamagazine.org", "The Year in Math",
             "Proofs that reshaped how mathematicians think about old problems.",
             hours: 4),
        item("rauno.me", "Invisible Details of Interaction Design",
             "The small decisions nobody notices until they are missing.",
             hours: 6, folder: "demo-folder-design"),
        item("theverge.com", "The quiet return of the personal website",
             "People are leaving the feeds and building small homes on the web again.",
             hours: 8),
        item("interconnected.org", "Notes on ambient computing",
             "What happens when the computer stops asking for your attention.",
             hours: 12),
        item("newyorker.com", "The Art of Doing Nothing",
             "A case for the unscheduled hour.",
             days: 1, folder: "demo-folder-longreads"),
        item("css-tricks.com", "Modern CSS Layout Patterns",
             "Container queries, subgrid, and the end of the layout hack.",
             days: 1, folder: "demo-folder-design"),
        item("developer.apple.com", "Meet Liquid Glass",
             "The new material that carries depth across the system.",
             days: 1, folder: "demo-folder-engineering"),
        item("arstechnica.com", "The physics of a good espresso",
             "Pressure, grind, and the surprisingly deep science of a small cup.",
             days: 1),
        item("kottke.org", "A Field Guide to Reading Slowly",
             "Notes on finishing what you start.",
             days: 2),
        item("waitbutwhy.com", "The Tail End",
             "Counting the time you have left with the people you love.",
             days: 2),
        item("37signals.com", "Shipping is a feature",
             "The work is not done until someone else can use it.",
             days: 2, folder: "demo-folder-engineering"),
        item("seriouseats.com", "The Best Weeknight Ragu",
             "Deep flavour in forty minutes, not four hours.",
             days: 2, folder: "demo-folder-recipes"),
        item("longreads.com", "The Last Bookstore in Town",
             "One shop, one street, and forty years of readers.",
             days: 3, folder: "demo-folder-longreads"),
        item("nytimes.com", "A Walk Across the City at Dawn",
             "What a place looks like before it wakes up.",
             days: 4, folder: "demo-folder-longreads"),
        item("atlasobscura.com", "Twelve Hidden Courtyards of Lisbon",
             "Behind the doors the tour groups walk past.",
             days: 5, folder: "demo-folder-travel"),
        item("nationalgeographic.com", "Slow Trains Through the Alps",
             "The route worth taking when you are not in a hurry.",
             days: 6, folder: "demo-folder-travel"),

        // Already read — depth for the Library and the read/unread contrast.
        item("stratechery.com", "The Attention Economy, Revisited",
             "Where the incentives of the feed break down.",
             days: 3, isRead: true),
        item("smashingmagazine.com", "Designing for Focus",
             "Interfaces that get out of the way of the work.",
             days: 4, isRead: true, folder: "demo-folder-design"),
        item("daringfireball.net", "On Interface Craft",
             "Why the details are the product.",
             days: 5, isRead: true, folder: "demo-folder-design"),
        item("github.blog", "How we cut build times in half",
             "Caching, parallelism, and measuring the right thing.",
             days: 6, isRead: true, folder: "demo-folder-engineering"),
        item("theguardian.com", "The people who log off",
             "Life after the notification.",
             days: 7, isRead: true, folder: "demo-folder-longreads"),
        item("bonappetit.com", "Miso Butter Everything",
             "One compound butter, a dozen dinners.",
             days: 8, isRead: true, folder: "demo-folder-recipes"),
        item("seriouseats.com", "Perfect Rice, Every Time",
             "Ratios, rest, and the lid you should not lift.",
             days: 9, isRead: true, folder: "demo-folder-recipes"),
        item("economist.com", "Why cities are getting quieter",
             "Electric engines are changing how a street sounds.",
             days: 10, isRead: true, folder: "demo-folder-travel"),
        item("wired.com", "The Web We Lost",
             "An argument for the open, linkable internet.",
             days: 11, isRead: true),
        item("hey.com", "Email should be calm",
             "Rethinking the inbox from the ground up.",
             days: 12, isRead: true),
    ]

    /// Builds one fixture Saved Item. The favicon points at a public icon
    /// service so real, recognizable marks appear in the rows; a failed fetch
    /// falls back to the host monogram exactly like a live item does.
    private static func item(
        _ host: String,
        _ title: String,
        _ summary: String,
        minutes: Int = 0,
        hours: Int = 0,
        days: Int = 0,
        isRead: Bool = false,
        folder folderID: String? = nil
    ) -> SavedItem {
        let age = TimeInterval(minutes) * 60 + TimeInterval(hours) * 3600 + TimeInterval(days) * 86_400
        let savedAt = referenceDate.addingTimeInterval(-age)
        let slug = title
            .lowercased()
            .replacingOccurrences(of: "[^a-z0-9]+", with: "-", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
        let url = "https://\(host)/\(slug)"

        return SavedItem(
            id: "demo-\(host)-\(slug)",
            originalURL: url,
            normalizedURL: url,
            host: host,
            title: title,
            description: summary,
            siteName: host,
            faviconURL: "https://icons.duckduckgo.com/ip3/\(host).ico",
            faviconLightURL: nil,
            faviconDarkURL: nil,
            canonicalURL: url,
            previewSummary: summary,
            type: "article",
            tags: [],
            enrichmentStatus: .enriched,
            sourceName: host,
            captureChannel: "ios-share",
            folder: folderID.flatMap(folderSummary(_:)),
            isRead: isRead,
            lastSavedAt: savedAt,
            createdAt: savedAt,
            updatedAt: savedAt
        )
    }

    /// Anchors every fixture timestamp to launch time, so the relative dates in
    /// the rows ("35m", "2h", "Yesterday") read correctly on any capture day.
    private static let referenceDate = Date()
}

// MARK: - Public Profile

nonisolated extension DemoMode {
    /// What a visitor of `sleevy.app/u/maya` sees: the Saved Items that sit in
    /// a Published Folder, newest first.
    static var publicSavedItems: [PublicSavedItem] {
        let publishedFolderIDs = Set(folders.lazy.filter(\.isPublished).map(\.id))

        return savedItems
            .filter { item in
                guard let folderID = item.folder?.id else { return false }
                return publishedFolderIDs.contains(folderID)
            }
            .sorted { $0.lastSavedAt > $1.lastSavedAt }
            .map { item in
                PublicSavedItem(
                    originalUrl: item.originalURL,
                    host: item.host,
                    title: item.title,
                    faviconUrl: item.faviconURL,
                    imageUrl: nil,
                    authorName: nil,
                    authorHandle: nil,
                    type: item.type,
                    tags: item.tags,
                    previewSummary: item.previewSummary,
                    savedAt: item.lastSavedAt
                )
            }
    }

    static var publicProfile: PublicProfile {
        PublicProfile(
            handle: profile.handle,
            joinedAt: Calendar.current.date(byAdding: .month, value: -8, to: Date()) ?? Date(),
            publicSavedItemCount: publicSavedItems.count,
            isIndexable: true
        )
    }
}

// MARK: - Capture harness

nonisolated extension DemoMode {
    /// Which screen the app opens on, read from `SLEEVY_DEMO_SCREEN`. The
    /// screenshot run sets one value per launch instead of driving taps, so a
    /// capture is reproducible and never depends on where a control happens to
    /// sit on a given device size.
    enum Screen: String {
        case inbox
        case library
        case folder
        case profile
        case search
    }

    static var initialScreen: Screen? {
        guard isEnabled else { return nil }
        return ProcessInfo.processInfo.environment["SLEEVY_DEMO_SCREEN"].flatMap(Screen.init(rawValue:))
    }

    /// The Folder the `folder` screen opens: the first Published Folder, so the
    /// capture shows a Folder that also appears on the Public Profile.
    static var featuredFolderID: String? {
        folders.first(where: \.isPublished)?.id
    }
}
