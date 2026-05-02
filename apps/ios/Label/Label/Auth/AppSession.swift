import Foundation

struct AppSession: Codable, Equatable {
    let token: String
    let userId: String
    let email: String
    let name: String
}

struct AuthSessionResponse: Decodable {
    struct User: Decodable {
        let id: String
        let name: String?
        let email: String
    }

    let user: User
}

struct NativeGoogleSignInResponse: Decodable {
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
    let code: String?
}
