import Foundation

enum HTTPMethod: String {
    case get = "GET"
    case post = "POST"
    case put = "PUT"
    case patch = "PATCH"
    case delete = "DELETE"
}

/// A validated 2xx response: the decoded body plus the underlying HTTP metadata.
/// Callers that need response headers (e.g. rotating the auth token from
/// `set-auth-token`) read them from `http`.
struct APIResponse {
    let data: Data
    let http: HTTPURLResponse
}

/// Transport-level failures surfaced by `APIClient`.
///
/// `APIClient` deliberately does *not* decide what a given status code means —
/// a `401` is "session expired" for the reading list but "bad credentials" on
/// the sign-in endpoint, and a `5xx` is retriable for some calls but not others.
/// That policy lives with each caller, which inspects `code`/`data` and maps to
/// its own domain error (`AuthError`, `SleevyCaptureError`, …).
enum APIClientError: Error {
    /// The response was not an `HTTPURLResponse`.
    case invalidResponse
    /// A non-2xx response, carrying the status code and raw body for message extraction.
    case unacceptableStatus(code: Int, data: Data)
}

/// A small JSON-over-HTTP client that owns the request boilerplate every Sleevy
/// store used to hand-roll: base-URL + path composition, the
/// `Authorization`/`Origin`/`Content-Type` headers, cookie suppression, the
/// `HTTPURLResponse` cast, and the 2xx status check.
///
/// It is intentionally free of `AppConfig` so it also compiles into the share
/// extension; callers inject the base URL, origin, session, and JSON coders.
nonisolated struct APIClient {
    let baseURL: URL
    let origin: String?
    let session: URLSession
    let encoder: JSONEncoder
    let decoder: JSONDecoder

    init(
        baseURL: URL,
        origin: String? = nil,
        session: URLSession,
        encoder: JSONEncoder,
        decoder: JSONDecoder
    ) {
        self.baseURL = baseURL
        self.origin = origin
        self.session = session
        self.encoder = encoder
        self.decoder = decoder
    }

    func endpoint(_ path: String, query: [URLQueryItem] = []) -> URL {
        var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)!
        components.path = path
        components.queryItems = query.isEmpty ? nil : query
        return components.url!
    }

    /// Sends a request and returns the validated 2xx response. Throws
    /// `APIClientError` for non-2xx/invalid responses; transport errors
    /// (`URLError`) and JSON errors propagate unchanged.
    @discardableResult
    func send(
        _ path: String,
        method: HTTPMethod = .get,
        query: [URLQueryItem] = [],
        token: String? = nil,
        httpBody: Data? = nil,
        contentType: String? = "application/json"
    ) async throws -> APIResponse {
        var request = URLRequest(url: endpoint(path, query: query))
        request.httpMethod = method.rawValue
        request.httpShouldHandleCookies = false

        if let token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let origin {
            request.setValue(origin, forHTTPHeaderField: "Origin")
        }
        if let httpBody {
            request.httpBody = httpBody
            if let contentType {
                request.setValue(contentType, forHTTPHeaderField: "Content-Type")
            }
        }

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIClientError.invalidResponse
        }
        guard (200 ..< 300).contains(http.statusCode) else {
            throw APIClientError.unacceptableStatus(code: http.statusCode, data: data)
        }
        return APIResponse(data: data, http: http)
    }

    /// Encodes `body` as JSON and sends it.
    @discardableResult
    func send<Body: Encodable>(
        _ path: String,
        method: HTTPMethod = .get,
        query: [URLQueryItem] = [],
        token: String? = nil,
        body: Body
    ) async throws -> APIResponse {
        try await send(
            path,
            method: method,
            query: query,
            token: token,
            httpBody: try encoder.encode(body)
        )
    }

    /// Sends a request and decodes the response body as `Response`.
    func send<Response: Decodable>(
        _ path: String,
        method: HTTPMethod = .get,
        query: [URLQueryItem] = [],
        token: String? = nil,
        as type: Response.Type
    ) async throws -> Response {
        let response = try await send(path, method: method, query: query, token: token)
        return try decoder.decode(Response.self, from: response.data)
    }

    /// Encodes `body`, sends it, and decodes the response body as `Response`.
    func send<Body: Encodable, Response: Decodable>(
        _ path: String,
        method: HTTPMethod = .get,
        query: [URLQueryItem] = [],
        token: String? = nil,
        body: Body,
        as type: Response.Type
    ) async throws -> Response {
        let response = try await send(path, method: method, query: query, token: token, body: body)
        return try decoder.decode(Response.self, from: response.data)
    }
}
