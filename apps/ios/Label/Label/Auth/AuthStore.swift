import Combine
import Foundation

@MainActor
final class AuthStore: ObservableObject {
    @Published private(set) var session: AppSession?
    @Published private(set) var isRestoringSession = false
    @Published private(set) var isSigningIn = false
    @Published var errorMessage: String?

    private let keychain = KeychainStore(service: AppConfig.keychainService)
    private let tokenAccount = "auth-token"
    private let googleSignInClient: any GoogleSignInClient
    private let sharedDefaults = UserDefaults(suiteName: AppConfig.appGroupIdentifier)

    init() {
        self.googleSignInClient = makeGoogleSignInClient()
    }

    init(googleSignInClient: any GoogleSignInClient) {
        self.googleSignInClient = googleSignInClient
    }

    func restoreSession() async {
        guard !isRestoringSession else { return }

        isRestoringSession = true
        defer { isRestoringSession = false }

        do {
            guard let token = try keychain.read(account: tokenAccount), !token.isEmpty else {
                sharedDefaults?.removeObject(forKey: AppConfig.sharedAuthTokenKey)
                session = nil
                return
            }

            session = try await fetchSession(token: token)
            sharedDefaults?.set(token, forKey: AppConfig.sharedAuthTokenKey)
        } catch {
            try? keychain.delete(account: tokenAccount)
            sharedDefaults?.removeObject(forKey: AppConfig.sharedAuthTokenKey)
            session = nil
            errorMessage = error.localizedDescription
        }
    }

    func signInWithGoogle() async {
        guard !isSigningIn else { return }

        isSigningIn = true
        errorMessage = nil
        defer { isSigningIn = false }

        do {
            let googleTokens = try await googleSignInClient.signIn()
            let session = try await exchangeGoogleTokensForSession(googleTokens)
            try keychain.write(session.token, account: tokenAccount)
            sharedDefaults?.set(session.token, forKey: AppConfig.sharedAuthTokenKey)
            self.session = session
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func signOut() async {
        let token = session?.token ?? (try? keychain.read(account: tokenAccount))
        session = nil
        errorMessage = nil
        try? keychain.delete(account: tokenAccount)
        sharedDefaults?.removeObject(forKey: AppConfig.sharedAuthTokenKey)

        guard let token else {
            googleSignInClient.signOut()
            return
        }

        var request = URLRequest(url: AppConfig.endpoint("/api/auth/sign-out"))
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue(AppConfig.apiOrigin, forHTTPHeaderField: "Origin")
        request.httpShouldHandleCookies = false

        _ = try? await URLSession.shared.data(for: request)
        googleSignInClient.signOut()
    }

    private func exchangeGoogleTokensForSession(_ googleTokens: GoogleAuthTokens) async throws -> AppSession {
        var request = URLRequest(url: AppConfig.endpoint("/api/auth/sign-in/social"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(AppConfig.apiOrigin, forHTTPHeaderField: "Origin")
        request.httpShouldHandleCookies = false
        request.httpBody = try JSONEncoder().encode(
            NativeGoogleSignInRequest(
                provider: "google",
                disableRedirect: true,
                idToken: .init(
                    token: googleTokens.idToken,
                    accessToken: googleTokens.accessToken
                )
            )
        )

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw AuthError.invalidServerResponse
        }

        guard (200 ..< 300).contains(httpResponse.statusCode) else {
            throw authError(from: data, fallback: .invalidServerResponse)
        }

        let payload = try JSONDecoder().decode(NativeGoogleSignInResponse.self, from: data)
        if payload.redirect {
            if let url = payload.url, !url.isEmpty {
                throw AuthError.authenticationFailed("The server tried to start a browser redirect instead of returning a native session.")
            }
            throw AuthError.invalidTokenExchangeResponse
        }

        guard let token = payload.token, let user = payload.user else {
            throw AuthError.invalidTokenExchangeResponse
        }
        return AppSession(
            token: token,
            userId: user.id,
            email: user.email,
            name: user.name ?? user.email
        )
    }

    private func fetchSession(token: String) async throws -> AppSession {
        var request = URLRequest(url: AppConfig.endpoint("/api/auth/get-session"))
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue(AppConfig.apiOrigin, forHTTPHeaderField: "Origin")
        request.httpShouldHandleCookies = false

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw AuthError.invalidServerResponse
        }

        guard httpResponse.statusCode == 200 else {
            throw authError(from: data, fallback: .invalidServerResponse)
        }

        let payload = try JSONDecoder().decode(AuthSessionResponse.self, from: data)
        return AppSession(
            token: token,
            userId: payload.user.id,
            email: payload.user.email,
            name: payload.user.name ?? payload.user.email
        )
    }

    private func authError(from data: Data, fallback: AuthError) -> AuthError {
        guard
            let payload = try? JSONDecoder().decode(AuthErrorResponse.self, from: data),
            let message = payload.message,
            !message.isEmpty
        else {
            return fallback
        }

        return .authenticationFailed(message)
    }
}

private struct NativeGoogleSignInRequest: Encodable {
    let provider: String
    let disableRedirect: Bool
    let idToken: IdTokenPayload

    struct IdTokenPayload: Encodable {
        let token: String
        let accessToken: String?
    }
}
