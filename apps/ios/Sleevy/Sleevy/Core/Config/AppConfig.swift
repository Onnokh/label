import Foundation

enum AppConfig {
    static let keychainService = "app.sleevy"
    static let keychainAccessGroup = Bundle.main.object(forInfoDictionaryKey: "SleevyKeychainAccessGroup") as? String
    /// Keychain account holding the bearer token. Shared with the share extension
    /// (which hard-codes the same string) so both targets read one token.
    static let keychainTokenAccount = "auth-token"
    static let appGroupIdentifier = "group.app.sleevy"
    static let sharedAppSessionKey = "app-session"
    static let apiSession: URLSession = {
        let configuration = URLSessionConfiguration.default
        configuration.waitsForConnectivity = false
        configuration.timeoutIntervalForRequest = 8
        configuration.timeoutIntervalForResource = 15
        return URLSession(configuration: configuration)
    }()

    static let remoteImageSession: URLSession = {
        let configuration = URLSessionConfiguration.default
        configuration.waitsForConnectivity = false
        configuration.timeoutIntervalForRequest = 4
        configuration.timeoutIntervalForResource = 8
        configuration.requestCachePolicy = .returnCacheDataElseLoad
        configuration.urlCache = .shared
        return URLSession(configuration: configuration)
    }()

    static let apiBaseURL = SleevyAPIEnvironment.baseURL
    static let apiOrigin = SleevyAPIEnvironment.origin

    static func userFacingNetworkMessage(for error: Error) -> String? {
        guard let urlError = error as? URLError else {
            return nil
        }

        switch urlError.code {
        case .notConnectedToInternet, .networkConnectionLost, .timedOut:
            return "You're offline right now. Sleevy will keep showing your last synced saved items until the connection comes back."
        case .cannotFindHost, .dnsLookupFailed:
            return """
            The Sleevy API host could not be resolved: \(apiBaseURL.absoluteString). \
            Check SLEEVY_API_BASE_URL in apps/ios/Sleevy/BuildConfig/Local.xcconfig and make sure the hostname exists in DNS.
            """
        case .cannotConnectToHost:
            return """
            The Sleevy API host is configured but could not be reached: \(apiBaseURL.absoluteString). \
            Check whether the API is running and whether you need VPN or local networking access.
            """
        default:
            return nil
        }
    }

    static func isOfflineNetworkError(_ error: Error) -> Bool {
        guard let urlError = error as? URLError else {
            return false
        }

        switch urlError.code {
        case .notConnectedToInternet, .networkConnectionLost, .timedOut:
            return true
        default:
            return false
        }
    }
}
