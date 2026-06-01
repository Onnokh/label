import Foundation

struct AppSession: Codable, Equatable {
    let token: String
    let userId: String
    let email: String
    let name: String
    let provider: String?

    var displayName: String {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedName.isEmpty {
            return trimmedName
        }

        if provider == "apple" {
            return "Apple account"
        }

        return email
    }

    var providerName: String? {
        switch provider {
        case "apple":
            return "Apple"
        case "google":
            return "Google"
        default:
            return nil
        }
    }

    func withProvider(_ provider: String?) -> AppSession {
        AppSession(
            token: token,
            userId: userId,
            email: email,
            name: name,
            provider: provider
        )
    }
}

struct AuthSessionResponse: Decodable {
    struct User: Decodable {
        let id: String
        let name: String?
        let email: String
    }

    let user: User
}

struct NativeSocialSignInResponse: Decodable {
    struct User: Decodable {
        let id: String
        let name: String?
        let email: String
    }

    let redirect: Bool
    let token: String?
    let user: User?
    let url: String?
}

struct AuthErrorResponse: Decodable {
    let message: String?
    let error: String?
    let code: String?
}
