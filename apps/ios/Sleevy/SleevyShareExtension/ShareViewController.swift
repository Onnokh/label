import Foundation
import UIKit
import UniformTypeIdentifiers

final class ShareViewController: UIViewController {
    private static let appGroupIdentifier = "group.app.sleevy"
    private static let keychainService = "app.sleevy"
    private static let keychainAccessGroup = Bundle.main.object(forInfoDictionaryKey: "SleevyKeychainAccessGroup") as? String
    private static let authTokenAccount = "auth-token"
    private static let sharedAppSessionKey = "app-session"
    private static var sourceName: String {
        SleevyUserPreferences.sourceName
    }
    private static let decoder = JSONDecoder()
    private static let encoder = JSONEncoder()
    private static let apiSession: URLSession = {
        let configuration = URLSessionConfiguration.default
        configuration.waitsForConnectivity = false
        configuration.timeoutIntervalForRequest = 8
        configuration.timeoutIntervalForResource = 15
        return URLSession(configuration: configuration)
    }()
    private let activityIndicator = UIActivityIndicatorView(style: .medium)
    private let statusLabel = UILabel()
    private let gradientView = MeshGradientView()
    private var hasStarted = false
    private var captureClient: SleevyCaptureClient {
        SleevyCaptureClient(
            apiBaseURL: SleevyAPIEnvironment.baseURL,
            apiOrigin: SleevyAPIEnvironment.origin,
            urlSession: Self.apiSession,
            encoder: Self.encoder,
            decoder: Self.decoder
        )
    }
    private let pendingCaptureStore = SleevyPendingCaptureStore(
        appGroupIdentifier: ShareViewController.appGroupIdentifier
    )
    private let keychain = KeychainStore(
        service: ShareViewController.keychainService,
        accessGroup: ShareViewController.keychainAccessGroup
    )

    override func viewDidLoad() {
        super.viewDidLoad()

        // The same mesh field the sign-in screen draws.
        gradientView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(gradientView)
        NSLayoutConstraint.activate([
            gradientView.topAnchor.constraint(equalTo: view.topAnchor),
            gradientView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            gradientView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            gradientView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])

        // Brandmark
        let logoView = SleevyBrandmarkView()
        logoView.translatesAutoresizingMaskIntoConstraints = false

        // Status label
        statusLabel.translatesAutoresizingMaskIntoConstraints = false
        statusLabel.text = "Saving to Sleevy..."
        statusLabel.font = .systemFont(ofSize: 17, weight: .semibold)
        statusLabel.textColor = .white
        statusLabel.textAlignment = .center
        statusLabel.numberOfLines = 0

        // Activity indicator
        activityIndicator.translatesAutoresizingMaskIntoConstraints = false
        activityIndicator.color = .white
        activityIndicator.startAnimating()

        let stack = UIStackView(arrangedSubviews: [logoView, statusLabel, activityIndicator])
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 16
        stack.translatesAutoresizingMaskIntoConstraints = false

        view.addSubview(stack)

        NSLayoutConstraint.activate([
            logoView.heightAnchor.constraint(equalToConstant: 72),
            logoView.widthAnchor.constraint(
                equalTo: logoView.heightAnchor,
                multiplier: SleevyBrandmarkPath.aspectRatio
            ),
            stack.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            stack.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 24),
            stack.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -24),
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

            // Marketing-capture mode: show the real sheet against the real
            // shared URL, but never call the API or need a session.
            if DemoCaptureFlag.isOn {
                try? await Task.sleep(nanoseconds: 800_000_000)
                activityIndicator.stopAnimating()
                statusLabel.text = "Saved to Sleevy"
                // Held far longer than the real sheet, which completes as soon
                // as the capture returns: a screenshot run needs the success
                // state on screen while it takes the picture.
                try? await Task.sleep(nanoseconds: 30_000_000_000)
                extensionContext?.completeRequest(returningItems: nil)
                return
            }

            let token = try loadSharedAuthToken()
            do {
                let response = try await captureClient.capture(
                    url: sharedURL.absoluteString,
                    token: token,
                    sourceName: Self.sourceName,
                    captureChannel: CaptureChannel.shareExtension.rawValue
                )
                persistRotatedToken(from: response.http)
                extensionContext?.completeRequest(returningItems: nil)
            } catch {
                guard shouldQueueCapture(after: error) else {
                    throw error
                }

                try queueCapture(sharedURL)
                activityIndicator.stopAnimating()
                statusLabel.text = "Saved offline. Sleevy will sync it when you're back online."
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

        if let captureError = error as? SleevyCaptureError {
            switch captureError {
            case .invalidServerResponse, .temporarilyUnavailable:
                return true
            case .sessionExpired, .failed:
                return false
            }
        }

        if let shareError = error as? ShareExtensionError {
            switch shareError {
            case .missingSharedURL, .notSignedIn:
                return false
            }
        }

        return false
    }

    /// Mirrors a rotated `set-auth-token` back to the shared keychain so the main
    /// app and the next share see the fresh token instead of a stale snapshot.
    private func persistRotatedToken(from http: HTTPURLResponse) {
        guard
            let rotated = http.value(forHTTPHeaderField: "set-auth-token")?
                .trimmingCharacters(in: .whitespacesAndNewlines),
            !rotated.isEmpty
        else {
            return
        }

        try? keychain.write(rotated, account: Self.authTokenAccount)
    }

    private func loadSharedAuthToken() throws -> String {
        guard
            let token = try keychain.read(account: Self.authTokenAccount),
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
                    switch try await provider.loadSharedItem(forTypeIdentifier: UTType.url.identifier) {
                    case .url(let url):
                        return url
                    case .data(let data):
                        if let text = String(data: data, encoding: .utf8),
                           let url = URL(string: text) {
                            return url
                        }
                    case .text, .unsupported:
                        break
                    }
                }

                if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                    if case .text(let text) = try await provider.loadSharedItem(forTypeIdentifier: UTType.plainText.identifier),
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
        let session = try loadSharedAppSession()
        try pendingCaptureStore.enqueue(
            url: sharedURL.absoluteString,
            for: session.userId,
            sourceName: Self.sourceName,
            captureChannel: CaptureChannel.shareExtension.rawValue
        )
    }

    private func loadSharedAppSession() throws -> SleevySharedAppSession {
        guard
            let defaults = UserDefaults(suiteName: Self.appGroupIdentifier),
            let sessionData = defaults.data(forKey: Self.sharedAppSessionKey),
            let session = try? Self.decoder.decode(SleevySharedAppSession.self, from: sessionData)
        else {
            throw ShareExtensionError.notSignedIn
        }

        return session
    }

}

private enum ShareExtensionError: LocalizedError {
    case missingSharedURL
    case notSignedIn

    var errorDescription: String? {
        switch self {
        case .missingSharedURL:
            return "No shareable URL was found in this item."
        case .notSignedIn:
            return "Sign in to Sleevy in the main app before sharing links."
        }
    }
}

/// A `Sendable` projection of the non-`Sendable` `NSSecureCoding` value a shared
/// item can carry. The legacy value is coerced inside the load callback so only
/// this value type ever crosses the continuation boundary.
private nonisolated enum SharedItemValue: Sendable {
    case url(URL)
    case data(Data)
    case text(String)
    case unsupported

    init(_ item: NSSecureCoding?) {
        switch item {
        case let url as URL:
            self = .url(url)
        case let data as Data:
            self = .data(data)
        case let text as String:
            self = .text(text)
        default:
            self = .unsupported
        }
    }
}

private extension NSItemProvider {
    func loadSharedItem(forTypeIdentifier typeIdentifier: String) async throws -> SharedItemValue {
        try await withCheckedThrowingContinuation { continuation in
            loadItem(forTypeIdentifier: typeIdentifier, options: nil) { item, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }

                continuation.resume(returning: SharedItemValue(item))
            }
        }
    }
}

private final class SleevyBrandmarkView: UIView {
    private let shapeLayer = CAShapeLayer()

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        shapeLayer.fillColor = UIColor.white.cgColor
        layer.addSublayer(shapeLayer)
    }

    required init?(coder: NSCoder) { fatalError() }

    override func layoutSubviews() {
        super.layoutSubviews()
        shapeLayer.path = SleevyBrandmarkPath.path(in: bounds)
    }
}
