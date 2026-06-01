import Foundation
import os

/// The single source of truth for the bearer token.
///
/// better-auth rotates the session token and hands the fresh value back in a
/// `set-auth-token` response header. Both the auth endpoints (`AuthStore`) and
/// the reading-list endpoints (`SleevyAPIClient`) read the current token from here and
/// call `rotate(to:)` whenever a response carries a new one, so a rotated token
/// is picked up on *every* path instead of going stale on one of them. Each
/// change is mirrored to the shared keychain (the `auth-token` account the share
/// extension and the next launch's `restoreSession` read), keeping the token
/// consistent across processes.
///
/// Lock-backed rather than actor-isolated so it slots into the `nonisolated`
/// `HTTPClient`/`SleevyAPIClient` request path and the `@MainActor` `AuthStore` without
/// forcing either to hop actors.
final class SessionTokenStore: Sendable {
    private let token: OSAllocatedUnfairLock<String>
    /// Mirrors a change to durable storage. `nil` means "cleared" (sign-out).
    private let persist: @Sendable (String?) -> Void

    init(initial: String, persist: @escaping @Sendable (String?) -> Void = { _ in }) {
        self.token = OSAllocatedUnfairLock(initialState: initial)
        self.persist = persist
    }

    var current: String {
        token.withLock { $0 }
    }

    /// Applies a rotated bearer token from a `set-auth-token` header. No-ops on an
    /// empty or unchanged value so we never thrash the keychain.
    func rotate(to newToken: String) {
        let trimmed = newToken.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        let didChange = token.withLock { value -> Bool in
            guard value != trimmed else { return false }
            value = trimmed
            return true
        }

        if didChange {
            persist(trimmed)
        }
    }

    func clear() {
        token.withLock { $0 = "" }
        persist(nil)
    }
}

extension SessionTokenStore {
    /// Production store: seeded from the keychain and writing every rotation back
    /// to the same `auth-token` account `AuthStore` and the share extension use.
    static func live(keychain: KeychainStore, account: String) -> SessionTokenStore {
        SessionTokenStore(
            initial: (try? keychain.read(account: account)) ?? "",
            persist: { newToken in
                if let newToken {
                    try? keychain.write(newToken, account: account)
                } else {
                    try? keychain.delete(account: account)
                }
            }
        )
    }
}
