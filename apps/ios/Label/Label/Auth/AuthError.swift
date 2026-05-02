import Foundation

enum AuthError: LocalizedError {
    case invalidServerResponse
    case invalidTokenExchangeResponse
    case authenticationFailed(String)
    case sessionExpired
    case missingGoogleSignInIntegration
    case missingGoogleClientConfiguration(String)
    case unableToPresentGoogleSignIn

    var errorDescription: String? {
        switch self {
        case .invalidServerResponse:
            return "The server returned an unexpected authentication response."
        case .invalidTokenExchangeResponse:
            return "The server did not return a valid Label session."
        case .authenticationFailed(let reason):
            return "Authentication failed: \(reason)."
        case .sessionExpired:
            return "Your Label session expired. Please sign in again."
        case .missingGoogleSignInIntegration:
            return "Google Sign-In is not linked yet. Add the GoogleSignIn-iOS package to the Xcode project."
        case .missingGoogleClientConfiguration(let key):
            return "Google Sign-In is missing \(key) in Info.plist."
        case .unableToPresentGoogleSignIn:
            return "The app could not find a view controller to present Google Sign-In."
        }
    }
}
