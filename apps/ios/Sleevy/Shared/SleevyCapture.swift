import Darwin
import Foundation
import os

struct SleevyCaptureClient {
    let apiBaseURL: URL
    let apiOrigin: String
    let urlSession: URLSession
    let encoder: JSONEncoder
    let decoder: JSONDecoder

    private var api: HTTPClient {
        HTTPClient(baseURL: apiBaseURL, origin: apiOrigin, session: urlSession, encoder: encoder, decoder: decoder)
    }

    /// Returns the full `APIResponse` (not just the body) so callers can read the
    /// rotated `set-auth-token` header and keep their bearer token fresh.
    func capture(url: String, token: String, sourceName: String? = nil, captureChannel: String? = nil) async throws -> APIResponse {
        do {
            return try await api.send(
                "/v1/captures",
                method: .post,
                token: token,
                body: SleevyCaptureRequest(url: url, sourceName: sourceName, captureChannel: captureChannel)
            )
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

/// Durable, user-scoped Pending Capture storage shared by the app and Share
/// Extension. Mutations use both an in-process mutex and a per-user `flock`;
/// atomic writes keep readers from seeing partial JSON.
nonisolated struct SleevyPendingCaptureStore: Sendable {
    /// `flock` coordinates processes, but not separate file descriptors opened
    /// within one process.
    private static let processLock = OSAllocatedUnfairLock(initialState: ())

    let appGroupIdentifier: String
    /// Overrides the app group container; used by tests to point at a temp directory.
    var containerURLOverride: URL? = nil

    func enqueue(url: String, for userId: String, sourceName: String? = nil, captureChannel: String? = nil) throws {
        try withExclusiveAccess(for: userId) { queueURL in
            var pendingCaptures = try load(from: queueURL)
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
            try persist(pendingCaptures, to: queueURL)
        }
    }

    func remove(id: UUID, for userId: String) throws {
        try removeProcessed(ids: [id], for: userId)
    }

    /// Removes confirmed captures without dropping captures added during a drain.
    func removeProcessed(ids: Set<UUID>, for userId: String) throws {
        guard !ids.isEmpty else { return }

        try withExclusiveAccess(for: userId) { queueURL in
            let pendingCaptures = try load(from: queueURL)
            try persist(pendingCaptures.filter { !ids.contains($0.id) }, to: queueURL)
        }
    }

    func load(for userId: String) throws -> [SleevyPendingCapture] {
        try withExclusiveAccess(for: userId) { queueURL in
            try load(from: queueURL)
        }
    }

    func persist(_ pendingCaptures: [SleevyPendingCapture], for userId: String) throws {
        try withExclusiveAccess(for: userId) { queueURL in
            try persist(pendingCaptures, to: queueURL)
        }
    }

    private func load(from queueURL: URL) throws -> [SleevyPendingCapture] {
        guard FileManager.default.fileExists(atPath: queueURL.path) else { return [] }
        let data = try Data(contentsOf: queueURL)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .sleevyISO8601
        return try decoder.decode([SleevyPendingCapture].self, from: data)
    }

    private func persist(_ pendingCaptures: [SleevyPendingCapture], to queueURL: URL) throws {
        try FileManager.default.createDirectory(
            at: queueURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )

        if pendingCaptures.isEmpty {
            if FileManager.default.fileExists(atPath: queueURL.path) {
                try FileManager.default.removeItem(at: queueURL)
            }
            return
        }

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(pendingCaptures)
        try data.write(to: queueURL, options: .atomic)
    }

    private func withExclusiveAccess<Result: Sendable>(
        for userId: String,
        operation: @Sendable (URL) throws -> Result
    ) throws -> Result {
        try Self.processLock.withLock { _ in
            do {
                guard let container = containerURLOverride
                    ?? FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier)
                else {
                    throw SleevyPendingCaptureStoreError.containerUnavailable
                }

                let queueURL = container
                    .appendingPathComponent("PendingCaptures", isDirectory: true)
                    .appendingPathComponent("\(userId).json", isDirectory: false)
                let directoryURL = queueURL.deletingLastPathComponent()
                try FileManager.default.createDirectory(at: directoryURL, withIntermediateDirectories: true)

                let lockURL = directoryURL.appendingPathComponent("\(userId).lock", isDirectory: false)
                if !FileManager.default.fileExists(atPath: lockURL.path) {
                    _ = FileManager.default.createFile(atPath: lockURL.path, contents: nil)
                    guard FileManager.default.fileExists(atPath: lockURL.path) else {
                        throw SleevyPendingCaptureStoreError.lockUnavailable
                    }
                }

                let lockHandle = try FileHandle(forUpdating: lockURL)
                defer { try? lockHandle.close() }
                try lockExclusively(lockHandle.fileDescriptor)
                defer { flock(lockHandle.fileDescriptor, LOCK_UN) }

                return try operation(queueURL)
            } catch let error as SleevyPendingCaptureStoreError {
                throw error
            } catch {
                throw SleevyPendingCaptureStoreError.operationFailed(underlying: error)
            }
        }
    }

    private func lockExclusively(_ fileDescriptor: Int32) throws {
        while flock(fileDescriptor, LOCK_EX) != 0 {
            guard errno == EINTR else {
                throw SleevyPendingCaptureStoreError.operationFailed(
                    underlying: NSError(domain: NSPOSIXErrorDomain, code: Int(errno))
                )
            }
        }
    }
}

nonisolated enum SleevyPendingCaptureStoreError: LocalizedError {
    case containerUnavailable
    case lockUnavailable
    case operationFailed(underlying: Error)

    var errorDescription: String? {
        "Sleevy couldn’t safely save this link for later. Keep this screen open and try again."
    }

    var underlyingError: Error? {
        switch self {
        case .operationFailed(let error):
            return error
        case .containerUnavailable, .lockUnavailable:
            return nil
        }
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
    nonisolated static let sleevyISO8601 = custom { decoder in
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
    // `ISO8601DateFormatter` is documented thread-safe for parsing and these are
    // configured once and only ever read, so they're safe to reach from the
    // `@Sendable` date-decoding closure. The type isn't `Sendable`, hence the
    // explicit `nonisolated(unsafe)` rather than relying on inference.
    nonisolated(unsafe) static let iso8601WithFractionalSeconds: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    nonisolated(unsafe) static let iso8601: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()
}
