import Foundation

enum AppConfig {
    static let keychainService = "plowplow.Label"
    static let appGroupIdentifier = "group.plowplow.Label"
    static let sharedAuthTokenKey = "auth-token"

    static let apiBaseURL: URL = {
        if
            let value = Bundle.main.object(forInfoDictionaryKey: "LabelAPIBaseURL") as? String,
            let url = URL(string: value),
            !value.isEmpty,
            !value.contains("REPLACE_WITH")
        {
            return url
        }

        if
            let value = ProcessInfo.processInfo.environment["LABEL_API_BASE_URL"],
            let url = URL(string: value)
        {
            return url
        }

        return URL(string: "http://localhost:4001")!
    }()

    static let apiOrigin: String = {
        guard
            let scheme = apiBaseURL.scheme,
            let host = apiBaseURL.host
        else {
            return apiBaseURL.absoluteString
        }

        if let port = apiBaseURL.port {
            return "\(scheme)://\(host):\(port)"
        }

        return "\(scheme)://\(host)"
    }()

    static func endpoint(_ path: String) -> URL {
        var components = URLComponents(url: apiBaseURL, resolvingAgainstBaseURL: false)!
        components.path = path
        return components.url!
    }
}
