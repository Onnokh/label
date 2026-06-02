import Foundation

@MainActor
protocol AppleSignInClient {
    func signIn() async throws -> AppleAuthTokens
}

@MainActor
struct UnimplementedAppleSignInClient: AppleSignInClient {
    func signIn() async throws -> AppleAuthTokens {
        throw AuthError.missingAppleSignInIntegration
    }
}

@MainActor
func makeAppleSignInClient() -> any AppleSignInClient {
#if canImport(AuthenticationServices)
    return LiveAppleSignInClient()
#else
    return UnimplementedAppleSignInClient()
#endif
}
