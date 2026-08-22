import Foundation
import Observation
import WidgetKit

@MainActor
@Observable
final class AuthStore {
    private(set) var session: AppSession?
    private(set) var googleUserProfile: GoogleUserProfile?
    private(set) var isRestoringSession = false
    private(set) var isSigningIn = false
    var errorMessage: String?

    /// The single source of truth for the bearer token, shared with `Library`'s
    /// `SleevyAPIClient` so a token rotated on either the auth path or the reading-list
    /// path is seen by both and persisted to the keychain.
    let tokenStore = SessionTokenStore.live(
        keychain: KeychainStore(
            service: AppConfig.keychainService,
            accessGroup: AppConfig.keychainAccessGroup
        ),
        account: AppConfig.keychainTokenAccount
    )
    private let googleSignInClient: any GoogleSignInClient
    private let appleSignInClient: any AppleSignInClient
    private let sharedDefaults = UserDefaults(suiteName: AppConfig.appGroupIdentifier)
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()
    private let api: HTTPClient

    init() {
        self.googleSignInClient = makeGoogleSignInClient()
        self.appleSignInClient = makeAppleSignInClient()
        self.api = Self.makeHTTPClient(encoder: encoder, decoder: decoder)
    }

    init(
        googleSignInClient: any GoogleSignInClient,
        appleSignInClient: (any AppleSignInClient)? = nil
    ) {
        self.googleSignInClient = googleSignInClient
        self.appleSignInClient = appleSignInClient ?? UnimplementedAppleSignInClient()
        self.api = Self.makeHTTPClient(encoder: encoder, decoder: decoder)
    }

    private static func makeHTTPClient(encoder: JSONEncoder, decoder: JSONDecoder) -> HTTPClient {
        HTTPClient(
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
            let token = tokenStore.current
            guard !token.isEmpty else {
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
            tokenStore.rotate(to: restoredSession.token)
            session = displaySession
            cache(session: displaySession)
            refreshSharedProfileHandle()
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
                provider: .google,
                idToken: googleTokens.idToken,
                accessToken: googleTokens.accessToken
            )
            tokenStore.rotate(to: session.token)
            cache(session: session)
            googleUserProfile = await googleSignInClient.restoreUserProfile()
            prefetchProfileImage(googleUserProfile)
            self.session = session
            refreshSharedProfileHandle()
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
                provider: .apple,
                idToken: appleTokens.idToken,
                nonce: appleTokens.nonce
            )
            tokenStore.rotate(to: session.token)
            cache(session: session)
            googleUserProfile = nil
            self.session = session
            refreshSharedProfileHandle()
        } catch {
            errorMessage = AppConfig.userFacingNetworkMessage(for: error) ?? error.localizedDescription
        }
    }

    func signOut() async {
        let token = currentToken
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
        guard let token = currentToken else {
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
        provider: AuthProvider,
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
                    provider: provider.rawValue,
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

    /// The active bearer token, or `nil` when there is none. Prefers the
    /// in-memory session token, falling back to the store (which survives an app
    /// relaunch via the keychain).
    private var currentToken: String? {
        if let sessionToken = session?.token, !sessionToken.isEmpty {
            return sessionToken
        }
        let stored = tokenStore.current
        return stored.isEmpty ? nil : stored
    }

    private func clearPersistedSession() {
        tokenStore.clear()
        sharedDefaults?.removeObject(forKey: AppConfig.sharedAppSessionKey)

        if SleevyUserPreferences.profileHandle != nil {
            SleevyUserPreferences.profileHandle = nil
            WidgetCenter.shared.reloadTimelines(ofKind: "ReadingActivityWidget")
        }
    }

    /// The activity widget keys the public activity endpoint by profile
    /// handle, which the session payload does not carry. Fetch it in the
    /// background and share it through the app group; the widget follows the
    /// signed-in account without holding credentials of its own.
    private func refreshSharedProfileHandle() {
        Task {
            let token = tokenStore.current
            guard !token.isEmpty else { return }

            guard
                let response = try? await api.send("/v1/profile", token: token),
                let profile = try? decoder.decode(ProfileHandleResponse.self, from: response.data)
            else { return }

            // Mirror a rotated `set-auth-token` like every other authed call.
            if
                let rotated = response.http.value(forHTTPHeaderField: "set-auth-token")?
                    .trimmingCharacters(in: .whitespacesAndNewlines),
                !rotated.isEmpty
            {
                tokenStore.rotate(to: rotated)
            }

            SleevyUserPreferences.profileHandle = profile.handle

            // Reload on every fetch, not only on a changed handle: the grid
            // itself moves daily, and a reload here is once per app launch.
            WidgetCenter.shared.reloadTimelines(ofKind: "ReadingActivityWidget")
        }
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

/// The slice of `GET /v1/profile` the shared handle needs.
private struct ProfileHandleResponse: Decodable {
    let handle: String
}
