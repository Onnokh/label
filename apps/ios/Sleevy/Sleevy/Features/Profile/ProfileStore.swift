import Foundation
import Observation
import WidgetKit

/// The signed-in account's Public Profile record — its Handle and Profile
/// Visibility — and the verbs that change it. This is the authed counterpart
/// of `PublicProfileLoader`, which reads only what an anonymous visitor sees.
///
/// One instance lives in `SignedInTabView` and reaches views through the
/// environment: the profile page drives its publicize controls off it, and
/// folder cards read it to know whether a published marker means anything
/// (a Published Folder is invisible while the profile is private).
@MainActor
@Observable
final class ProfileStore {
    enum Phase: Equatable {
        case loading
        case loaded
        case failed(String)
    }

    private(set) var phase = Phase.loading
    /// `nil` after a successful load means no Handle is claimed yet.
    private(set) var profile: Profile?

    private let api: SleevyAPIClient
    /// Marketing-capture mode: the record comes from `DemoMode` and the
    /// publicize verbs stay in memory, so a screenshot run can show a public
    /// profile without touching a real account.
    private let isDemo: Bool

    init(api: SleevyAPIClient, isDemo: Bool = false) {
        self.api = api
        self.isDemo = isDemo
    }

    static func live(tokenStore: SessionTokenStore) -> ProfileStore {
        ProfileStore(api: .live(tokenStore: tokenStore))
    }

    static func demo() -> ProfileStore {
        ProfileStore(
            api: .live(tokenStore: SessionTokenStore(initial: DemoMode.session.token)),
            isDemo: true
        )
    }

    var isPublic: Bool {
        profile?.visibility == .public
    }

    func load() async {
        if isDemo {
            profile = DemoMode.profile
            phase = .loaded
            return
        }

        if profile == nil { phase = .loading }

        do {
            profile = try await api.loadProfile()
            phase = .loaded
        } catch {
            // A failed refresh keeps showing the last known profile.
            if profile == nil { phase = .failed(error.localizedDescription) }
        }
    }

    func checkHandleAvailability(_ handle: String) async throws -> HandleAvailability {
        try await api.checkHandleAvailability(handle)
    }

    func claimHandle(_ handle: String) async throws {
        apply(try await api.claimHandle(handle))
    }

    func renameHandle(_ handle: String) async throws {
        apply(try await api.renameHandle(handle))
    }

    func setVisibility(_ visibility: ProfileVisibility) async throws {
        if isDemo {
            apply(Profile(handle: profile?.handle ?? DemoMode.profile.handle, visibility: visibility))
            return
        }

        apply(try await api.setProfileVisibility(visibility))
    }

    private func apply(_ profile: Profile) {
        self.profile = profile
        phase = .loaded

        // The widgets key the public activity endpoint by the shared handle,
        // so a claim or rename here must reach them the same way sign-in does.
        if SleevyUserPreferences.profileHandle != profile.handle {
            SleevyUserPreferences.profileHandle = profile.handle
            WidgetCenter.shared.reloadTimelines(ofKind: "ReadingActivityWidget")
        }
    }
}

/// The Handle rules, mirrored from the API (`Handle.ts`) like the web client
/// mirrors them: local validation answers while typing, and the server stays
/// the authority on submit.
nonisolated enum HandleRules {
    static let minLength = 3
    static let maxLength = 30
    static let hint = "3 to 30 characters: letters a-z, digits, hyphen, and underscore."

    private static let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyz0123456789_-")
    private static let reserved: Set<String> = [
        "api", "docs", "settings", "inbox", "library", "connect", "oauth",
        "support", "privacy", "admin", "u", "user", "sleevy",
    ]

    static func normalize(_ raw: String) -> String {
        raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    /// Why a handle cannot be claimed, or `nil` when it is well-formed.
    static func problem(_ handle: String) -> String? {
        if handle.count < minLength || handle.count > maxLength {
            return "Use 3 to 30 characters."
        }
        if handle.unicodeScalars.contains(where: { !allowed.contains($0) }) {
            return "Use only letters a-z, digits, hyphen, and underscore."
        }
        if reserved.contains(handle) {
            return "Sleevy keeps this name for itself. Choose another one."
        }
        return nil
    }

    /// The Public Profile page address. The canonical host is fixed: unlike
    /// the web client there is no request origin to derive it from.
    static func publicProfileURL(handle: String) -> URL {
        URL(string: "https://sleevy.app/u/\(handle)")!
    }

    /// The address as shown to the user, scheme stripped like the web does.
    static func displayProfileURL(handle: String) -> String {
        "sleevy.app/u/\(handle)"
    }
}
