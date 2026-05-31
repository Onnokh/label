import Combine
import Foundation

@MainActor
final class AuthStore: ObservableObject {
    @Published private(set) var session: AppSession?
    @Published private(set) var googleUserProfile: GoogleUserProfile?
    @Published private(set) var isRestoringSession = false
    @Published private(set) var isSigningIn = false
    @Published var errorMessage: String?

    private let keychain = KeychainStore(
        service: AppConfig.keychainService,
        accessGroup: AppConfig.keychainAccessGroup
    )
    private let tokenAccount = "auth-token"
    private let googleSignInClient: any GoogleSignInClient
    private let appleSignInClient: any AppleSignInClient
    private let sharedDefaults = UserDefaults(suiteName: AppConfig.appGroupIdentifier)
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()
    private let api: APIClient

    init() {
        self.googleSignInClient = makeGoogleSignInClient()
        self.appleSignInClient = makeAppleSignInClient()
        self.api = Self.makeAPIClient(encoder: encoder, decoder: decoder)
    }

    init(
        googleSignInClient: any GoogleSignInClient,
        appleSignInClient: (any AppleSignInClient)? = nil
    ) {
        self.googleSignInClient = googleSignInClient
        self.appleSignInClient = appleSignInClient ?? UnimplementedAppleSignInClient()
        self.api = Self.makeAPIClient(encoder: encoder, decoder: decoder)
    }

    private static func makeAPIClient(encoder: JSONEncoder, decoder: JSONDecoder) -> APIClient {
        APIClient(
            baseURL: AppConfig.apiBaseURL,
            origin: AppConfig.apiOrigin,
            session: AppConfig.apiSession,
            encoder: encoder,
            decoder: decoder
        )
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
            prefetchProfileImage(googleUserProfile)
            let restoredSession = try await fetchSession(token: token)
            let sessionProvider = restoredSession.provider ?? cachedSession?.provider
            let displaySession = restoredSession.withProvider(sessionProvider)
            if restoredSession.token != token {
                try keychain.write(restoredSession.token, account: tokenAccount)
            }
            session = displaySession
            cache(session: displaySession)
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
            let session = try await exchangeSocialTokensForSession(
                provider: "google",
                idToken: googleTokens.idToken,
                accessToken: googleTokens.accessToken
            )
            try keychain.write(session.token, account: tokenAccount)
            cache(session: session)
            googleUserProfile = await googleSignInClient.restoreUserProfile()
            prefetchProfileImage(googleUserProfile)
            self.session = session
        } catch {
            errorMessage = AppConfig.userFacingNetworkMessage(for: error) ?? error.localizedDescription
        }
    }

    func signInWithApple() async {
        guard !isSigningIn else { return }

        isSigningIn = true
        errorMessage = nil
        defer { isSigningIn = false }

        do {
            let appleTokens = try await appleSignInClient.signIn()
            let session = try await exchangeSocialTokensForSession(
                provider: "apple",
                idToken: appleTokens.idToken,
                nonce: appleTokens.nonce
            )
            try keychain.write(session.token, account: tokenAccount)
            cache(session: session)
            googleUserProfile = nil
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

        _ = try? await api.send("/api/auth/sign-out", method: .post, token: token)
        googleSignInClient.signOut()
    }

    func invalidateSession(message: String = "Your Sleevy session expired. Please sign in again.") {
        session = nil
        googleUserProfile = nil
        errorMessage = message
        clearPersistedSession()
        googleSignInClient.signOut()
    }

    func deleteAccount() async throws {
        guard let token = session?.token ?? (try? keychain.read(account: tokenAccount)) else {
            throw AuthError.sessionExpired
        }

        do {
            _ = try await api.send("/api/auth/delete-user", method: .post, token: token, httpBody: Data("{}".utf8))
        } catch let APIClientError.unacceptableStatus(_, data) {
            throw authError(from: data, fallback: .invalidServerResponse)
        } catch APIClientError.invalidResponse {
            throw AuthError.invalidServerResponse
        }

        session = nil
        googleUserProfile = nil
        errorMessage = nil
        clearPersistedSession()
        googleSignInClient.signOut()
    }

    private func exchangeSocialTokensForSession(
        provider: String,
        idToken: String,
        accessToken: String? = nil,
        nonce: String? = nil
    ) async throws -> AppSession {
        let response: APIResponse
        do {
            response = try await api.send(
                "/api/auth/sign-in/social",
                method: .post,
                body: NativeSocialSignInRequest(
                    provider: provider,
                    disableRedirect: true,
                    idToken: .init(
                        token: idToken,
                        accessToken: accessToken,
                        nonce: nonce
                    )
                )
            )
        } catch let APIClientError.unacceptableStatus(_, data) {
            throw authError(from: data, fallback: .invalidServerResponse)
        } catch APIClientError.invalidResponse {
            throw AuthError.invalidServerResponse
        }

        let payload = try decoder.decode(NativeSocialSignInResponse.self, from: response.data)
        if payload.redirect {
            if let url = payload.url, !url.isEmpty {
                throw AuthError.authenticationFailed("The server tried to start a browser redirect instead of returning a native session.")
            }
            throw AuthError.invalidTokenExchangeResponse
        }

        guard
            let token = bearerToken(from: response.http) ?? payload.token,
            let user = payload.user
        else {
            throw AuthError.invalidTokenExchangeResponse
        }
        return AppSession(
            token: token,
            userId: user.id,
            email: user.email,
            name: normalizedName(user.name),
            provider: provider
        )
    }

    private func fetchSession(token: String) async throws -> AppSession {
        let response: APIResponse
        do {
            response = try await api.send("/api/auth/get-session", token: token)
        } catch let APIClientError.unacceptableStatus(code, data) {
            if code == 401 || code == 403 {
                throw AuthError.sessionExpired
            }
            throw authError(from: data, fallback: .invalidServerResponse)
        } catch APIClientError.invalidResponse {
            throw AuthError.invalidServerResponse
        }

        let payload = try decoder.decode(AuthSessionResponse.self, from: response.data)
        return AppSession(
            token: bearerToken(from: response.http) ?? token,
            userId: payload.user.id,
            email: payload.user.email,
            name: normalizedName(payload.user.name),
            provider: nil
        )
    }

    private func normalizedName(_ name: String?) -> String {
        name?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }

    private func bearerToken(from response: HTTPURLResponse) -> String? {
        guard
            let token = response.value(forHTTPHeaderField: "set-auth-token")?
                .trimmingCharacters(in: .whitespacesAndNewlines),
            !token.isEmpty
        else {
            return nil
        }

        return token
    }

    private func authError(from data: Data, fallback: AuthError) -> AuthError {
        guard
            let payload = try? JSONDecoder().decode(AuthErrorResponse.self, from: data),
            let message = payload.message ?? payload.error,
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

    private func prefetchProfileImage(_ profile: GoogleUserProfile?) {
        guard let imageURL = profile?.imageURL else { return }

        Task.detached(priority: .background) {
            _ = try? await RemoteImageDiskCache.shared.data(for: imageURL)
        }
    }

    private func clearPersistedSession() {
        try? keychain.delete(account: tokenAccount)
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

private struct NativeSocialSignInRequest: Encodable {
    let provider: String
    let disableRedirect: Bool
    let idToken: IdTokenPayload

    struct IdTokenPayload: Encodable {
        let token: String
        let accessToken: String?
        let nonce: String?
    }
}
