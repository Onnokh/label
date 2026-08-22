import Foundation
import UIKit

enum SleevyThemePreference: String, CaseIterable, Identifiable {
    case system
    case light
    case dark

    var id: String { rawValue }

    var title: String {
        switch self {
        case .system:
            "System"
        case .light:
            "Light"
        case .dark:
            "Dark"
        }
    }
}

enum SleevyUserPreferences {
    static let appGroupIdentifier = "group.app.sleevy"
    static let themeKey = "settings.theme"
    static let sourceNameKey = "settings.source-name"
    static let profileHandleKey = "profile.handle"

    static let defaults = UserDefaults(suiteName: appGroupIdentifier) ?? .standard

    /// The signed-in account's profile handle. The app writes it after a
    /// session is established (the session payload itself has no handle) and
    /// clears it on sign-out; the widgets read it to key the public activity
    /// endpoint without their own credentials.
    static var profileHandle: String? {
        get {
            let value = defaults.string(forKey: profileHandleKey)?
                .trimmingCharacters(in: .whitespacesAndNewlines)

            guard let value, !value.isEmpty else { return nil }

            return value
        }
        set {
            if let newValue, !newValue.isEmpty {
                defaults.set(newValue, forKey: profileHandleKey)
            } else {
                defaults.removeObject(forKey: profileHandleKey)
            }
        }
    }

    static var defaultSourceName: String {
        UIDevice.current.name
    }

    static var sourceName: String {
        let storedValue = defaults.string(forKey: sourceNameKey)?
            .trimmingCharacters(in: .whitespacesAndNewlines)

        guard let storedValue, !storedValue.isEmpty else {
            return defaultSourceName
        }

        return storedValue
    }
}
