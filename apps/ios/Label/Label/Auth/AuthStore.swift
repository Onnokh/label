import Combine
import Foundation

@MainActor
final class AuthStore: ObservableObject {
    @Published private(set) var session: AppSession?
    @Published private(set) var googleUserProfile: GoogleUserProfile?
    @Published private(set) var isRestoringSession = false
    @Published private(set) var isSigningIn = false
    @Published var errorMessage: String?

    private let keychain = KeychainStore(service: AppConfig.keychainService)
    private let tokenAccount = "auth-token"
    private let googleSignInClient: any GoogleSignInClient
    private let sharedDefaults = UserDefaults(suiteName: AppConfig.appGroupIdentifier)
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    init() {
        self.googleSignInClient = makeGoogleSignInClient()
    }

    init(googleSignInClient: any GoogleSignInClient) {
        self.googleSignInClient = googleSignInClient
    }

    func restoreSession() async {
        guard !isRestoringSession else { return }

        isRestoringSession = true
        errorMessage = nil
        defer { isRestoringSession = false }

        let cachedSession = readCachedSession()

        do {
            guard let token = try keychain.read(account: tokenAccount), !token.isEmpty else {
                clearPersistedSession()
                session = nil
                googleUserProfile = nil
                return
            }

            if let cachedSession {
                session = cachedSession
            }

            googleUserProfile = await googleSignInClient.restoreUserProfile()
            let restoredSession = try await fetchSession(token: token)
            session = restoredSession
            cache(session: restoredSession)
            sharedDefaults?.set(token, forKey: AppConfig.sharedAuthTokenKey)
        } catch {
            if shouldDiscardSession(for: error) {
                clearPersistedSession()
                session = nil
                googleUserProfile = nil
            } else {
                session = cachedSession
            }

            errorMessage = AppConfig.userFacingNetworkMessage(for: error) ?? error.localizedDescription
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
            cache(session: session)
            googleUserProfile = await googleSignInClient.restoreUserProfile()
            self.session = session
        } catch {
            errorMessage = AppConfig.userFacingNetworkMessage(for: error) ?? error.localizedDescription
        }
    }

    func signOut() async {
        let token = session?.token ?? (try? keychain.read(account: tokenAccount))
        session = nil
        googleUserProfile = nil
        errorMessage = nil
        clearPersistedSession()

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

        if httpResponse.statusCode == 401 || httpResponse.statusCode == 403 {
            throw AuthError.sessionExpired
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

    private func readCachedSession() -> AppSession? {
        guard
            let data = sharedDefaults?.data(forKey: AppConfig.sharedAppSessionKey)
        else {
            return nil
        }

        return try? decoder.decode(AppSession.self, from: data)
    }

    private func cache(session: AppSession) {
        guard let data = try? encoder.encode(session) else { return }
        sharedDefaults?.set(data, forKey: AppConfig.sharedAppSessionKey)
    }

    private func clearPersistedSession() {
        try? keychain.delete(account: tokenAccount)
        sharedDefaults?.removeObject(forKey: AppConfig.sharedAuthTokenKey)
        sharedDefaults?.removeObject(forKey: AppConfig.sharedAppSessionKey)
    }

    private func shouldDiscardSession(for error: Error) -> Bool {
        guard let authError = error as? AuthError else { return false }

        switch authError {
        case .sessionExpired:
            return true
        default:
            return false
        }
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
