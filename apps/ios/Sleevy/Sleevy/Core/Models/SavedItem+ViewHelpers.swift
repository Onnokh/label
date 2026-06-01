import SwiftUI

extension SavedItem {
    var shareURL: URL? {
        Self.safeRemoteURL(canonicalURL)
            ?? Self.safeRemoteURL(originalURL)
    }

    var displayTitle: String {
        title?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty
            ?? siteName?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty
            ?? displayDomain
    }

    var displayDomain: String {
        host.replacingOccurrences(
            of: #"^www\."#,
            with: "",
            options: .regularExpression
        )
    }

    var createdDateLabel: String {
        let interval = max(0, Date().timeIntervalSince(lastSavedAt))
        let minutes = Int(interval / 60)

        if minutes < 1 {
            return "now"
        }

        if minutes < 60 {
            return "\(minutes)m"
        }

        let hours = Int(interval / 3_600)
        if hours < 24 {
            return "\(hours)h"
        }

        return Calendar.current.isDate(lastSavedAt, equalTo: Date(), toGranularity: .year)
            ? Self.sameYearDateFormatter.string(from: lastSavedAt)
            : Self.crossYearDateFormatter.string(from: lastSavedAt)
    }

    var googleFaviconURL: URL? {
        var components = URLComponents(string: "https://t2.gstatic.com/faviconV2")
        components?.queryItems = [
            URLQueryItem(name: "client", value: "SOCIAL"),
            URLQueryItem(name: "type", value: "FAVICON"),
            URLQueryItem(name: "fallback_opts", value: "TYPE,SIZE,URL"),
            URLQueryItem(name: "url", value: "http://\(displayDomain)"),
            URLQueryItem(name: "size", value: "64"),
        ]
        return components?.url
    }

    func preferredFaviconURL(colorScheme: ColorScheme) -> URL? {
        let themeSpecificURLString = switch colorScheme {
        case .dark:
            faviconDarkURL ?? faviconURL ?? faviconLightURL
        default:
            faviconLightURL ?? faviconURL ?? faviconDarkURL
        }

        if let themeSpecificURL = Self.safeRemoteURL(themeSpecificURLString) {
            return themeSpecificURL
        }

        return Self.safeRemoteURL(faviconURL) ?? googleFaviconURL
    }

    var monogram: String {
        String(displayDomain.prefix(1)).uppercased()
    }

    private static let sameYearDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.setLocalizedDateFormatFromTemplate("MMM d")
        return formatter
    }()

    private static let crossYearDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.setLocalizedDateFormatFromTemplate("MMM d yyyy")
        return formatter
    }()

    private static func safeRemoteURL(_ value: String?) -> URL? {
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

extension PendingSavedItem {
    var queuedDateLabel: String {
        Self.queuedDateFormatter.string(from: queuedAt)
    }

    private static let queuedDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.setLocalizedDateFormatFromTemplate("d MMM")
        return formatter
    }()
}

extension String {
    var nonEmpty: String? {
        isEmpty ? nil : self
    }

    var initials: String {
        let components = split(whereSeparator: \.isWhitespace)
            .prefix(2)
            .compactMap { $0.first.map(String.init) }

        if components.isEmpty {
            return String(prefix(1)).uppercased()
        }

        return components.joined().uppercased()
    }
}
