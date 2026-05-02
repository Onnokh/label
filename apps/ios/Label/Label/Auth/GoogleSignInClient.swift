import Foundation

struct GoogleUserProfile: Equatable {
    let imageURL: URL?
}

@MainActor
protocol GoogleSignInClient {
    func signIn() async throws -> GoogleAuthTokens
    func restoreUserProfile() async -> GoogleUserProfile?
    func signOut()
}

@MainActor
struct UnimplementedGoogleSignInClient: GoogleSignInClient {
    func signIn() async throws -> GoogleAuthTokens {
        throw AuthError.missingGoogleSignInIntegration
    }

    func restoreUserProfile() async -> GoogleUserProfile? {
        nil
    }

    func signOut() {}
}

@MainActor
func makeGoogleSignInClient() -> any GoogleSignInClient {
#if canImport(GoogleSignIn)
    return LiveGoogleSignInClient()
#else
    return UnimplementedGoogleSignInClient()
#endif
}
