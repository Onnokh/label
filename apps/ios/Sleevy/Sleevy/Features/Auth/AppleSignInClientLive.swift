import Foundation

#if canImport(AuthenticationServices)
import AuthenticationServices
import CryptoKit
import UIKit

@MainActor
final class LiveAppleSignInClient: NSObject, AppleSignInClient {
    private var continuation: CheckedContinuation<AppleAuthTokens, Error>?
    private var currentNonce: String?

    func signIn() async throws -> AppleAuthTokens {
        guard continuation == nil else {
            throw AuthError.authenticationFailed("Apple Sign-In is already in progress.")
        }

        let nonce = Self.sha256(Self.randomNonce())
        currentNonce = nonce

        return try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation

            let provider = ASAuthorizationAppleIDProvider()
            let request = provider.createRequest()
            request.requestedScopes = [.fullName, .email]
            request.nonce = nonce

            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
    }

    private func complete(with result: Result<AppleAuthTokens, Error>) {
        let continuation = continuation
        self.continuation = nil
        currentNonce = nil

        switch result {
        case .success(let tokens):
            continuation?.resume(returning: tokens)
        case .failure(let error):
            continuation?.resume(throwing: error)
        }
    }

    private static func randomNonce(length: Int = 32) -> String {
        precondition(length > 0)

        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var result = ""
        var remainingLength = length

        while remainingLength > 0 {
            var random: UInt8 = 0
            let status = SecRandomCopyBytes(kSecRandomDefault, 1, &random)
            guard status == errSecSuccess else { continue }

            if Int(random) < charset.count {
                result.append(charset[Int(random)])
                remainingLength -= 1
            }
        }

        return result
    }

    private static func sha256(_ input: String) -> String {
        let inputData = Data(input.utf8)
        let hashedData = SHA256.hash(data: inputData)
        return hashedData.map { String(format: "%02x", $0) }.joined()
    }
}

extension LiveAppleSignInClient: ASAuthorizationControllerDelegate {
    nonisolated func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithAuthorization authorization: ASAuthorization
    ) {
        Task { @MainActor in
            guard
                let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                let identityToken = credential.identityToken,
                let idToken = String(data: identityToken, encoding: .utf8),
                !idToken.isEmpty
            else {
                complete(with: .failure(AuthError.authenticationFailed("Apple did not return an ID token.")))
                return
            }

            complete(with: .success(AppleAuthTokens(idToken: idToken, nonce: currentNonce)))
        }
    }

    nonisolated func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithError error: Error
    ) {
        Task { @MainActor in
            complete(with: .failure(error))
        }
    }
}

extension LiveAppleSignInClient: ASAuthorizationControllerPresentationContextProviding {
    nonisolated func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        DispatchQueue.main.sync {
            let windowScenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            if let keyWindow = windowScenes.flatMap(\.windows).first(where: \.isKeyWindow) {
                return keyWindow
            }
            if let windowScene = windowScenes.first {
                return ASPresentationAnchor(windowScene: windowScene)
            }
            preconditionFailure("Apple Sign-In requires an active window scene.")
        }
    }
}
#endif
