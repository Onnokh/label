import Foundation

/// The identity provider a session was established with.
///
/// The raw values are the wire/storage strings the API and the cached
/// `AppSession` use, so this decodes existing persisted sessions unchanged while
/// replacing the scattered `== "apple"` / `== "google"` comparisons with a
/// closed, exhaustive type.
enum AuthProvider: String, Codable, Equatable {
    case apple
    case google

    /// Human-readable name shown in Settings.
    var displayName: String {
        switch self {
        case .apple:
            return "Apple"
        case .google:
            return "Google"
        }
    }
}
