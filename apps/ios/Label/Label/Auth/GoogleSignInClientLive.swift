import Foundation

#if canImport(GoogleSignIn)
import GoogleSignIn
import UIKit

@MainActor
struct LiveGoogleSignInClient: GoogleSignInClient {
    func signIn() async throws -> GoogleAuthTokens {
        let clientID = try requiredInfoPlistValue(for: "GIDClientID")
        let serverClientID = try requiredInfoPlistValue(for: "GIDServerClientID")

        GIDSignIn.sharedInstance.configuration = GIDConfiguration(
            clientID: clientID,
            serverClientID: serverClientID
        )

        guard let presentingViewController = UIApplication.shared.topViewController() else {
            throw AuthError.unableToPresentGoogleSignIn
        }

        let signInResult = try await GIDSignIn.sharedInstance.signIn(
            withPresenting: presentingViewController
        )
        let user = try await signInResult.user.refreshTokensIfNeeded()

        guard let idToken = user.idToken?.tokenString else {
            throw AuthError.authenticationFailed("Google did not return an ID token.")
        }

        return GoogleAuthTokens(
            idToken: idToken,
            accessToken: user.accessToken.tokenString
        )
    }

    func signOut() {
        GIDSignIn.sharedInstance.signOut()
    }

    private func requiredInfoPlistValue(for key: String) throws -> String {
        guard
            let value = Bundle.main.object(forInfoDictionaryKey: key) as? String,
            !value.isEmpty,
            !value.contains("REPLACE_WITH")
        else {
            throw AuthError.missingGoogleClientConfiguration(key)
        }

        return value
    }
}

private extension UIApplication {
    func topViewController(
        base: UIViewController? = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)?
            .rootViewController
    ) -> UIViewController? {
        if let navigationController = base as? UINavigationController {
            return topViewController(base: navigationController.visibleViewController)
        }

        if let tabBarController = base as? UITabBarController {
            return topViewController(base: tabBarController.selectedViewController)
        }

        if let presentedViewController = base?.presentedViewController {
            return topViewController(base: presentedViewController)
        }

        return base
    }
}
#endif
