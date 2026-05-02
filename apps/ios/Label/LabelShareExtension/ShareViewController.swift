import Foundation
import UIKit
import UniformTypeIdentifiers

final class ShareViewController: UIViewController {
    private static let appGroupIdentifier = "group.plowplow.Label"
    private static let sharedAuthTokenKey = "auth-token"
    private static let sharedAppSessionKey = "app-session"
    private let activityIndicator = UIActivityIndicatorView(style: .large)
    private let statusLabel = UILabel()
    private var hasStarted = false

    override func viewDidLoad() {
        super.viewDidLoad()

        view.backgroundColor = .systemBackground

        activityIndicator.translatesAutoresizingMaskIntoConstraints = false
        activityIndicator.startAnimating()

        statusLabel.translatesAutoresizingMaskIntoConstraints = false
        statusLabel.text = "Saving to Label..."
        statusLabel.font = .preferredFont(forTextStyle: .headline)
        statusLabel.textAlignment = .center
        statusLabel.numberOfLines = 0

        view.addSubview(activityIndicator)
        view.addSubview(statusLabel)

        NSLayoutConstraint.activate([
            activityIndicator.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            activityIndicator.centerYAnchor.constraint(equalTo: view.centerYAnchor, constant: -16),
            statusLabel.topAnchor.constraint(equalTo: activityIndicator.bottomAnchor, constant: 16),
            statusLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
            statusLabel.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24),
        ])
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)

        guard !hasStarted else { return }
        hasStarted = true

        Task { @MainActor in
            await submitSharedItem()
        }
    }

    private func submitSharedItem() async {
        do {
            let sharedURL = try await loadSharedURL()
            let token = try loadSharedAuthToken()
            do {
                try await capture(sharedURL: sharedURL, token: token)
                extensionContext?.completeRequest(returningItems: nil)
            } catch {
                guard shouldQueueCapture(after: error) else {
                    throw error
                }

                try queueCapture(sharedURL)
                activityIndicator.stopAnimating()
                statusLabel.text = "Saved offline. Label will sync it when you're back online."
                try? await Task.sleep(nanoseconds: 850_000_000)
                extensionContext?.completeRequest(returningItems: nil)
            }
        } catch {
            statusLabel.text = error.localizedDescription
            activityIndicator.stopAnimating()

            let dismissAction = UIAlertAction(title: "Close", style: .default) { [weak self] _ in
                self?.extensionContext?.cancelRequest(withError: error)
            }

            let alert = UIAlertController(title: "Couldn’t Save Link", message: error.localizedDescription, preferredStyle: .alert)
            alert.addAction(dismissAction)
            present(alert, animated: true)
        }
    }

    private func shouldQueueCapture(after error: Error) -> Bool {
        if error is URLError {
            return true
        }

        if let shareError = error as? ShareExtensionError {
            switch shareError {
            case .invalidServerResponse, .captureTemporarilyUnavailable:
                return true
            case .missingSharedURL, .notSignedIn, .captureFailed:
                return false
            }
        }

        return false
    }

    private func loadSharedAuthToken() throws -> String {
        guard
            let defaults = UserDefaults(suiteName: Self.appGroupIdentifier),
            let token = defaults.string(forKey: Self.sharedAuthTokenKey),
            !token.isEmpty
        else {
            throw ShareExtensionError.notSignedIn
        }

        return token
    }

    private func loadSharedURL() async throws -> URL {
        guard let extensionItems = extensionContext?.inputItems as? [NSExtensionItem] else {
            throw ShareExtensionError.missingSharedURL
        }

        for item in extensionItems {
            for provider in item.attachments ?? [] {
                if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                    let value = try await provider.loadItem(forTypeIdentifier: UTType.url.identifier)
                    if let url = value as? URL {
                        return url
                    }
                    if let data = value as? Data,
                       let text = String(data: data, encoding: .utf8),
                       let url = URL(string: text) {
                        return url
                    }
                }

                if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                    let value = try await provider.loadItem(forTypeIdentifier: UTType.plainText.identifier)
                    if let text = value as? String,
                       let url = URL(string: text.trimmingCharacters(in: .whitespacesAndNewlines)),
                       url.scheme?.hasPrefix("http") == true {
                        return url
                    }
                }
            }
        }

        throw ShareExtensionError.missingSharedURL
    }

    private func queueCapture(_ sharedURL: URL) throws {
        guard
            let defaults = UserDefaults(suiteName: Self.appGroupIdentifier),
            let sessionData = defaults.data(forKey: Self.sharedAppSessionKey),
            let session = try? JSONDecoder().decode(SharedAppSession.self, from: sessionData),
            let queueURL = pendingCapturesURL(for: session.userId)
        else {
            throw ShareExtensionError.notSignedIn
        }

        let pendingCapture = PendingCapture(
            id: UUID(),
            url: sharedURL.absoluteString,
            queuedAt: Date()
        )

        var pendingCaptures: [PendingCapture] = []
        if
            let data = try? Data(contentsOf: queueURL),
            let existingCaptures = try? JSONDecoder.sharedISO8601.decode([PendingCapture].self, from: data)
        {
            pendingCaptures = existingCaptures
        }

        pendingCaptures.append(pendingCapture)

        try FileManager.default.createDirectory(
            at: queueURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )

        let data = try JSONEncoder.sharedISO8601.encode(pendingCaptures)
        try data.write(to: queueURL, options: .atomic)
    }

    private func capture(sharedURL: URL, token: String) async throws {
        var request = URLRequest(url: apiEndpoint("/v1/captures"))
        request.httpMethod = "POST"
        request.httpShouldHandleCookies = false
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue(apiOrigin, forHTTPHeaderField: "Origin")
        request.httpBody = try JSONEncoder().encode(CaptureRequest(url: sharedURL.absoluteString))

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw ShareExtensionError.invalidServerResponse
        }

        guard (200 ..< 300).contains(httpResponse.statusCode) else {
            if httpResponse.statusCode == 429 || (500 ..< 600).contains(httpResponse.statusCode) {
                throw ShareExtensionError.captureTemporarilyUnavailable
            }

            if
                let payload = try? JSONDecoder().decode(ServerErrorResponse.self, from: data),
                let message = payload.message,
                !message.isEmpty
            {
                throw ShareExtensionError.captureFailed(message)
            }

            throw ShareExtensionError.invalidServerResponse
        }
    }

    private func pendingCapturesURL(for userId: String) -> URL? {
        FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: Self.appGroupIdentifier)?
            .appendingPathComponent("PendingCaptures", isDirectory: true)
            .appendingPathComponent("\(userId).json", isDirectory: false)
    }

    private func apiEndpoint(_ path: String) -> URL {
        var components = URLComponents(url: apiBaseURL, resolvingAgainstBaseURL: false)!
        components.path = path
        return components.url!
    }

    private var apiBaseURL: URL {
        guard
            let value = Bundle.main.object(forInfoDictionaryKey: "LabelAPIBaseURL") as? String,
            let url = URL(string: value),
            !value.isEmpty
        else {
            return URL(string: "http://localhost:4001")!
        }

        return url
    }

    private var apiOrigin: String {
        guard
            let scheme = apiBaseURL.scheme,
            let host = apiBaseURL.host
        else {
            return apiBaseURL.absoluteString
        }

        if let port = apiBaseURL.port {
            return "\(scheme)://\(host):\(port)"
        }

        return "\(scheme)://\(host)"
    }
}

private struct CaptureRequest: Encodable {
    let url: String
}

private struct ServerErrorResponse: Decodable {
    let message: String?
}

private enum ShareExtensionError: LocalizedError {
    case missingSharedURL
    case notSignedIn
    case invalidServerResponse
    case captureTemporarilyUnavailable
    case captureFailed(String)

    var errorDescription: String? {
        switch self {
        case .missingSharedURL:
            return "No shareable URL was found in this item."
        case .notSignedIn:
            return "Sign in to Label in the main app before sharing links."
        case .invalidServerResponse:
            return "Label could not save this link right now."
        case .captureTemporarilyUnavailable:
            return "Label is temporarily unavailable."
        case .captureFailed(let message):
            return message
        }
    }
}

private struct SharedAppSession: Decodable {
    let userId: String
}

private struct PendingCapture: Codable {
    let id: UUID
    let url: String
    let queuedAt: Date
}

private extension JSONDecoder {
    static let sharedISO8601: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()
}

private extension JSONEncoder {
    static let sharedISO8601: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()
}

private extension NSItemProvider {
    func loadItem(forTypeIdentifier typeIdentifier: String) async throws -> NSSecureCoding? {
        try await withCheckedThrowingContinuation { continuation in
            loadItem(forTypeIdentifier: typeIdentifier, options: nil) { item, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }

                continuation.resume(returning: item)
            }
        }
    }
}
