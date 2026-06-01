import Foundation

/// Resolves the Sleevy API base URL and request origin from the app's Info.plist
/// (`SleevyAPIBaseURL`) or the `SLEEVY_API_BASE_URL` environment variable.
///
/// Lives in `Shared/` so the main app and the share extension resolve the
/// endpoint — including the Release-only HTTPS requirement — through one
/// implementation instead of two copies that can drift. Both `AppConfig` and
/// `ShareViewController` read from here.
nonisolated enum SleevyAPIEnvironment {
    static let baseURL: URL = resolveBaseURL()
    static let origin: String = makeOrigin(for: baseURL)

    private static func resolveBaseURL() -> URL {
        if
            let value = Bundle.main.object(forInfoDictionaryKey: "SleevyAPIBaseURL") as? String,
            let url = URL(string: value),
            !value.isEmpty,
            !value.contains("REPLACE_WITH")
        {
            return validated(url)
        }

        if
            let value = ProcessInfo.processInfo.environment["SLEEVY_API_BASE_URL"],
            let url = URL(string: value)
        {
            return validated(url)
        }

        #if DEBUG
        return URL(string: "http://localhost:4001")!
        #else
        fatalError("SLEEVY_API_BASE_URL must be configured for Release builds.")
        #endif
    }

    private static func validated(_ url: URL) -> URL {
        #if DEBUG
        return url
        #else
        guard url.scheme == "https" else {
            fatalError("SLEEVY_API_BASE_URL must use HTTPS for Release builds.")
        }

        return url
        #endif
    }

    private static func makeOrigin(for url: URL) -> String {
        guard let scheme = url.scheme, let host = url.host else {
            return url.absoluteString
        }

        if let port = url.port {
            return "\(scheme)://\(host):\(port)"
        }

        return "\(scheme)://\(host)"
    }
}
