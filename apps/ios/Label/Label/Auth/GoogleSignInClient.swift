import Foundation

@MainActor
protocol GoogleSignInClient {
    func signIn() async throws -> GoogleAuthTokens
    func signOut()
}

@MainActor
struct UnimplementedGoogleSignInClient: GoogleSignInClient {
    func signIn() async throws -> GoogleAuthTokens {
        throw AuthError.missingGoogleSignInIntegration
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
