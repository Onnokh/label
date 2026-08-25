import Foundation

nonisolated enum ProfileVisibility: String, Codable, Sendable {
    case `public`
    case `private`
}

/// Mirror of `GET /v1/profile` (`ProfileDto`): the Public Profile record — the
/// Account's Handle and its Profile Visibility, nothing else about the Account.
nonisolated struct Profile: Codable, Equatable, Sendable {
    let handle: String
    let visibility: ProfileVisibility
}

/// Mirror of `GET /v1/profile/handle-availability`. `handle` is the
/// normalized spelling the server checked, which is what a claim would store.
nonisolated struct HandleAvailability: Decodable, Equatable, Sendable {
    let handle: String
    let available: Bool
}
