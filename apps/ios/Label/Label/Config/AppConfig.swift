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

    static func userFacingNetworkMessage(for error: Error) -> String? {
        guard let urlError = error as? URLError else {
            return nil
        }

        switch urlError.code {
        case .cannotFindHost, .dnsLookupFailed:
            return """
            The Label API host could not be resolved: \(apiBaseURL.absoluteString). \
            Check LABEL_API_BASE_URL in apps/ios/Label/BuildConfig/Local.xcconfig and make sure the hostname exists in DNS.
            """
        case .cannotConnectToHost:
            return """
            The Label API host is configured but could not be reached: \(apiBaseURL.absoluteString). \
            Check whether the API is running and whether you need VPN or local networking access.
            """
        default:
            return nil
        }
    }
}
