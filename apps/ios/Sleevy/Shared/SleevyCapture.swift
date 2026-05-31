import Foundation

struct SleevyCaptureClient {
    let apiBaseURL: URL
    let apiOrigin: String
    let urlSession: URLSession
    let encoder: JSONEncoder
    let decoder: JSONDecoder

    private var api: APIClient {
        APIClient(baseURL: apiBaseURL, origin: apiOrigin, session: urlSession, encoder: encoder, decoder: decoder)
    }

    func capture(url: String, token: String, sourceName: String? = nil, captureChannel: String? = nil) async throws -> Data {
        do {
            let response = try await api.send(
                "/v1/captures",
                method: .post,
                token: token,
                body: SleevyCaptureRequest(url: url, sourceName: sourceName, captureChannel: captureChannel)
            )
            return response.data
        } catch let APIClientError.unacceptableStatus(code, data) {
            if code == 401 || code == 403 {
                throw SleevyCaptureError.sessionExpired
            }

            let message = serverMessage(data)

            if code == 429 || (500 ..< 600).contains(code) {
                throw SleevyCaptureError.temporarilyUnavailable(message ?? "Sleevy could not sync this saved link right now.")
            }

            throw SleevyCaptureError.failed(message ?? "Sleevy could not sync this saved link right now.")
        } catch APIClientError.invalidResponse {
            throw SleevyCaptureError.invalidServerResponse
        }
    }

    private func serverMessage(_ data: Data) -> String? {
        guard let payload = try? decoder.decode(SleevyServerErrorResponse.self, from: data) else {
            return nil
        }

        if payload.tag == "InvalidUrlError" {
            return "Enter a valid URL."
        }

        guard let message = payload.message, !message.isEmpty else { return nil }

        return message
    }
}

enum SleevyCaptureError: LocalizedError {
    case invalidServerResponse
    case sessionExpired
    case temporarilyUnavailable(String)
    case failed(String)

    var errorDescription: String? {
        switch self {
        case .invalidServerResponse:
            return "Sleevy could not save this link right now."
        case .sessionExpired:
            return "Sign in to Sleevy again before saving links."
        case .temporarilyUnavailable(let message), .failed(let message):
            return message
        }
    }
}

struct SleevyPendingCaptureStore {
    let appGroupIdentifier: String

    func enqueue(url: String, for userId: String, sourceName: String? = nil, captureChannel: String? = nil) throws {
        var pendingCaptures = load(for: userId)
        pendingCaptures.insert(
            SleevyPendingCapture(
                id: UUID(),
                url: url,
                queuedAt: Date(),
                sourceName: sourceName,
                captureChannel: captureChannel
            ),
            at: 0
        )
        try persist(pendingCaptures, for: userId)
    }

    func remove(id: UUID, for userId: String) {
        let pendingCaptures = load(for: userId)
        let updatedCaptures = pendingCaptures.filter { $0.id != id }
        try? persist(updatedCaptures, for: userId)
    }

    func load(for userId: String) -> [SleevyPendingCapture] {
        guard
            let queueURL = pendingCapturesURL(for: userId),
            let data = try? Data(contentsOf: queueURL),
            let pendingCaptures = try? JSONDecoder.sharedISO8601.decode([SleevyPendingCapture].self, from: data)
        else {
            return []
        }

        return pendingCaptures
    }

    func persist(_ pendingCaptures: [SleevyPendingCapture], for userId: String) throws {
        guard let queueURL = pendingCapturesURL(for: userId) else { return }

        try FileManager.default.createDirectory(
            at: queueURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )

        if pendingCaptures.isEmpty {
            try? FileManager.default.removeItem(at: queueURL)
            return
        }

        let data = try JSONEncoder.sharedISO8601.encode(pendingCaptures)
        try data.write(to: queueURL, options: .atomic)
    }

    private func pendingCapturesURL(for userId: String) -> URL? {
        FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier)?
            .appendingPathComponent("PendingCaptures", isDirectory: true)
            .appendingPathComponent("\(userId).json", isDirectory: false)
    }
}

struct SleevySharedAppSession: Decodable {
    let userId: String
}

struct SleevyPendingCapture: Codable, Equatable {
    let id: UUID
    let url: String
    let queuedAt: Date
    let sourceName: String?
    let captureChannel: String?
}

private struct SleevyCaptureRequest: Encodable {
    let url: String
    let sourceName: String?
    let captureChannel: String?
}

private struct SleevyServerErrorResponse: Decodable {
    let tag: String?
    let message: String?

    enum CodingKeys: String, CodingKey {
        case tag = "_tag"
        case message
    }
}

extension JSONDecoder {
    static let sharedISO8601: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .sleevyISO8601
        return decoder
    }()
}

extension JSONEncoder {
    static let sharedISO8601: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()
}

extension JSONDecoder.DateDecodingStrategy {
    static let sleevyISO8601 = custom { decoder in
        let container = try decoder.singleValueContainer()

        if let timestamp = try? container.decode(Double.self) {
            return Date(timeIntervalSince1970: timestamp)
        }

        let value = try container.decode(String.self)

        if let date = SleevyDateFormatter.iso8601WithFractionalSeconds.date(from: value) {
            return date
        }

        if let date = SleevyDateFormatter.iso8601.date(from: value) {
            return date
        }

        throw DecodingError.dataCorruptedError(
            in: container,
            debugDescription: "Expected an ISO 8601 date string."
        )
    }
}

private enum SleevyDateFormatter {
    static let iso8601WithFractionalSeconds: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    static let iso8601: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()
}
