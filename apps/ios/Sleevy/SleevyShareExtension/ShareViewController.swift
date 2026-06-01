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
    private let gradientLayer = CAGradientLayer()
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

        // Gradient background
        gradientLayer.colors = [
            UIColor(red: 0.953, green: 0.753, blue: 0.529, alpha: 1).cgColor,
            UIColor(red: 0.961, green: 0.588, blue: 0.514, alpha: 1).cgColor,
            UIColor(red: 0.969, green: 0.333, blue: 0.671, alpha: 1).cgColor,
        ]
        gradientLayer.startPoint = CGPoint(x: 0, y: 0)
        gradientLayer.endPoint = CGPoint(x: 1, y: 1)
        view.layer.insertSublayer(gradientLayer, at: 0)

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
            logoView.widthAnchor.constraint(equalToConstant: 48),
            logoView.heightAnchor.constraint(equalToConstant: 72),
            stack.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            stack.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 24),
            stack.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -24),
        ])
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        gradientLayer.frame = view.bounds
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
                _ = try await captureClient.capture(
                    url: sharedURL.absoluteString,
                    token: token,
                    sourceName: Self.sourceName,
                    captureChannel: CaptureChannel.shareExtension.rawValue
                )
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
        shapeLayer.path = brandmarkPath(in: bounds)
    }

    private func brandmarkPath(in rect: CGRect) -> CGPath {
        let s = min(rect.width / 473, rect.height / 705)
        let ox = (rect.width - 473 * s) / 2
        let oy = (rect.height - 705 * s) / 2

        func pt(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: ox + x * s, y: oy + y * s)
        }

        let path = CGMutablePath()
        let r = 20 * s

        // Top-left square
        path.addRoundedRect(in: CGRect(origin: pt(9.1, 9.1), size: CGSize(width: 203 * s, height: 202 * s)), cornerWidth: r, cornerHeight: r)

        // Top-right arrow
        path.move(to: pt(278.07, 205.96))
        path.addCurve(to: pt(244.1, 191.65), control1: pt(265.4, 218.32), control2: pt(244.1, 209.35))
        path.addLine(to: pt(244.1, 29.1))
        path.addCurve(to: pt(264.1, 9.1), control1: pt(244.1, 18.05), control2: pt(253.05, 9.1))
        path.addLine(to: pt(425.22, 9.1))
        path.addCurve(to: pt(439.66, 42.94), control1: pt(442.84, 9.1), control2: pt(451.85, 30.22))
        path.addLine(to: pt(360.01, 126.03))
        path.addLine(to: pt(278.07, 205.96))
        path.closeSubpath()

        // Middle-left arrow
        path.move(to: pt(15.24, 277.65))
        path.addCurve(to: pt(29.55, 243.69), control1: pt(2.88, 264.99), control2: pt(11.85, 243.69))
        path.addLine(to: pt(192.1, 243.69))
        path.addCurve(to: pt(212.1, 263.69), control1: pt(203.15, 243.69), control2: pt(212.1, 252.64))
        path.addLine(to: pt(212.1, 424.81))
        path.addCurve(to: pt(178.26, 439.25), control1: pt(212.1, 442.42), control2: pt(190.98, 451.44))
        path.addLine(to: pt(95.18, 359.6))
        path.addLine(to: pt(15.24, 277.65))
        path.closeSubpath()

        // Center-right square
        path.addRoundedRect(in: CGRect(origin: pt(244.1, 243.69), size: CGSize(width: 203 * s, height: 202 * s)), cornerWidth: r, cornerHeight: r)

        // Bottom-left arrow
        path.move(to: pt(15.24, 645.72))
        path.addCurve(to: pt(29.55, 679.69), control1: pt(2.88, 658.39), control2: pt(11.85, 679.69))
        path.addLine(to: pt(192.1, 679.69))
        path.addCurve(to: pt(212.1, 659.69), control1: pt(203.15, 679.69), control2: pt(212.1, 670.73))
        path.addLine(to: pt(212.1, 498.57))
        path.addCurve(to: pt(178.26, 484.13), control1: pt(212.1, 480.95), control2: pt(190.98, 471.94))
        path.addLine(to: pt(95.18, 563.78))
        path.addLine(to: pt(15.24, 645.72))
        path.closeSubpath()

        // Bottom-right square
        path.addRoundedRect(in: CGRect(origin: pt(244.1, 477.69), size: CGSize(width: 203 * s, height: 202 * s)), cornerWidth: r, cornerHeight: r)

        return path
    }
}
