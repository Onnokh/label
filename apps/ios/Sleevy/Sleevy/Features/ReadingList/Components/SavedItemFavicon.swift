import SwiftUI
import UIKit
import WebKit

struct SavedItemFavicon: View {
    @Environment(\.colorScheme) private var colorScheme

    private enum Source {
        case item(SavedItem)
        case remote(URL?, monogram: String)
    }

    private let source: Source

    init(item: SavedItem) {
        source = .item(item)
    }

    /// For rows built from other DTOs (the public profile page), which carry
    /// a plain favicon URL instead of a SavedItem.
    init(faviconURL: URL?, monogram: String) {
        source = .remote(faviconURL, monogram: monogram)
    }

    var body: some View {
        Group {
            if let faviconURL {
                if faviconURL.isSVG {
                    SVGRemoteImage(url: faviconURL, colorScheme: colorScheme) {
                        faviconFallback
                    }
                } else {
                    RemoteRasterImage(url: faviconURL) { image in
                        image
                            .resizable()
                            .scaledToFit()
                    } fallback: {
                        faviconFallback
                    }
                }
            } else {
                faviconFallback
            }
        }
        .frame(width: 30, height: 30)
        .padding(.vertical, 4)
    }

    private var faviconURL: URL? {
        switch source {
        case .item(let item): item.preferredFaviconURL(colorScheme: colorScheme)
        case .remote(let url, _): url
        }
    }

    private var monogram: String {
        switch source {
        case .item(let item): item.monogram
        case .remote(_, let monogram): monogram
        }
    }

    private var faviconFallback: some View {
        Text(monogram)
            .font(.system(size: 16, weight: .semibold, design: .rounded))
            .foregroundStyle(.secondary)
    }
}

/// Warms the favicon pipeline ahead of the rows appearing: the bytes land
/// in the caches and SVGs are pre-rendered, so the first scroll through a
/// list never pays a network fetch — or worse, a WKWebView snapshot — per
/// row. Screens call this when their items arrive, not when rows appear.
@MainActor
enum FaviconPrefetcher {
    private static var warmedKeys = Set<String>()

    static func warm(items: [SavedItem], colorScheme: ColorScheme) async {
        await warm(
            urls: items.map { $0.preferredFaviconURL(colorScheme: colorScheme) },
            colorScheme: colorScheme
        )
    }

    static func warm(urls: [URL?], colorScheme: ColorScheme) async {
        for url in urls {
            guard let url else { continue }

            let key = "\(url.absoluteString)|\(colorScheme.cacheKey)"
            guard warmedKeys.insert(key).inserted else { continue }

            // One at a time on purpose: warming is a background nicety and
            // must never contend with what the user is doing right now.
            if url.isSVG {
                await SVGSnapshotLoader().load(url: url, size: 30, colorScheme: colorScheme)
            } else {
                await RemoteRasterImageLoader().load(url)
            }
        }
    }
}

private struct RemoteRasterImage<Content: View, Fallback: View>: View {
    let url: URL
    let content: (Image) -> Content
    let fallback: () -> Fallback

    @State private var loader = RemoteRasterImageLoader()

    var body: some View {
        Group {
            if let image = loader.image {
                content(Image(uiImage: image))
            } else {
                fallback()
            }
        }
        .task(id: url) {
            await loader.load(url)
        }
    }
}

@MainActor
@Observable
private final class RemoteRasterImageLoader {
    private(set) var image: UIImage?

    private var requestedURL: URL?
    private var loadedURL: URL?

    private static let cache: NSCache<NSURL, UIImage> = {
        let cache = NSCache<NSURL, UIImage>()
        cache.countLimit = 128
        return cache
    }()

    func load(_ url: URL) async {
        guard loadedURL != url || image == nil else { return }
        requestedURL = url
        image = nil

        let cacheKey = url as NSURL
        if let cached = Self.cache.object(forKey: cacheKey) {
            loadedURL = url
            image = cached
            return
        }

        do {
            let data = try await RemoteImageDiskCache.shared.data(for: url)
            try Task.checkCancellation()
            guard requestedURL == url, let loadedImage = UIImage(data: data) else { return }
            Self.cache.setObject(loadedImage, forKey: cacheKey)
            loadedURL = url
            image = loadedImage
        } catch {
            if requestedURL == url {
                requestedURL = nil
            }
        }
    }
}

private struct SVGRemoteImage<Fallback: View>: View {
    let url: URL
    let colorScheme: ColorScheme
    let fallback: () -> Fallback

    @State private var loader = SVGSnapshotLoader()

    var body: some View {
        Group {
            if let image = loader.image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
            } else {
                fallback()
            }
        }
        .task(id: cacheKey) {
            await loader.load(url: url, size: 30, colorScheme: colorScheme)
        }
    }

    private var cacheKey: String {
        "\(url.absoluteString)|30|\(colorScheme.cacheKey)"
    }
}

@MainActor
@Observable
private final class SVGSnapshotLoader {
    private(set) var image: UIImage?

    private var requestedKey: String?
    private var loadedKey: String?

    private static let cache: NSCache<NSString, UIImage> = {
        let cache = NSCache<NSString, UIImage>()
        cache.countLimit = 128
        return cache
    }()

    func load(url: URL, size: CGFloat, colorScheme: ColorScheme) async {
        let key = "\(url.absoluteString)|\(Int(size))|\(colorScheme.cacheKey)"
        guard loadedKey != key || image == nil else { return }
        requestedKey = key
        image = nil

        let cacheKey = key as NSString
        if let cached = Self.cache.object(forKey: cacheKey) {
            loadedKey = key
            image = cached
            return
        }

        do {
            let data = try await RemoteImageDiskCache.shared.data(for: url)
            let renderedImage = try await Self.renderSVG(
                data: data,
                size: size,
                colorScheme: colorScheme
            )
            try Task.checkCancellation()
            guard requestedKey == key else { return }
            Self.cache.setObject(renderedImage, forKey: cacheKey)
            loadedKey = key
            image = renderedImage
        } catch {
            if requestedKey == key {
                requestedKey = nil
            }
        }
    }

    private static func renderSVG(
        data: Data,
        size: CGFloat,
        colorScheme: ColorScheme
    ) async throws -> UIImage {
        let webView = WKWebView(frame: CGRect(x: 0, y: 0, width: size, height: size))
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.isScrollEnabled = false
        if colorScheme == .dark {
            webView.overrideUserInterfaceStyle = .dark
        } else {
            webView.overrideUserInterfaceStyle = .light
        }

        let cssColorScheme = colorScheme == .dark ? "dark" : "light"

        let html = """
        <!doctype html>
        <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta name="color-scheme" content="light dark">
          <style>
            :root {
              color-scheme: \(cssColorScheme);
            }
            html, body {
              margin: 0;
              padding: 0;
              width: \(size)px;
              height: \(size)px;
              background: transparent;
              overflow: hidden;
              color-scheme: \(cssColorScheme);
            }
            body {
              display: flex;
              align-items: center;
              justify-content: center;
            }
            img {
              width: \(size)px;
              height: \(size)px;
              object-fit: contain;
              display: block;
            }
          </style>
        </head>
        <body>
          <img alt="" src="data:image/svg+xml;base64,\(data.base64EncodedString())">
        </body>
        </html>
        """

        let navigationDelegate = SVGNavigationDelegate()
        webView.navigationDelegate = navigationDelegate

        try await navigationDelegate.loadHTML(html, in: webView)

        let configuration = WKSnapshotConfiguration()
        configuration.afterScreenUpdates = true
        configuration.snapshotWidth = NSNumber(value: Double(size))

        return try await withCheckedThrowingContinuation { continuation in
            webView.takeSnapshot(with: configuration) { image, error in
                if let image {
                    continuation.resume(returning: image)
                } else {
                    continuation.resume(throwing: error ?? SVGSnapshotError.snapshotFailed)
                }
            }
        }
    }
}

private final class SVGNavigationDelegate: NSObject, WKNavigationDelegate {
    private var continuation: CheckedContinuation<Void, Error>?

    func loadHTML(_ html: String, in webView: WKWebView) async throws {
        try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            webView.loadHTMLString(html, baseURL: nil)
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        continuation?.resume(returning: ())
        continuation = nil
    }

    func webView(
        _ webView: WKWebView,
        didFail navigation: WKNavigation!,
        withError error: Error
    ) {
        continuation?.resume(throwing: error)
        continuation = nil
    }

    func webView(
        _ webView: WKWebView,
        didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: Error
    ) {
        continuation?.resume(throwing: error)
        continuation = nil
    }
}

private enum SVGSnapshotError: Error {
    case snapshotFailed
}

struct AccountAvatarButton: View {
    let name: String
    let imageURL: URL?

    var body: some View {
        Group {
            if let imageURL {
                RemoteRasterImage(url: imageURL) { image in
                    image
                        .resizable()
                        .scaledToFill()
                } fallback: {
                    fallbackAvatar
                }
            } else {
                fallbackAvatar
            }
        }
        .frame(width: 30, height: 30)
        .clipShape(Circle())
    }

    private var fallbackAvatar: some View {
        ZStack {
            Circle()
                .fill(Color(uiColor: .secondarySystemFill))

            Text(name.initials)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(.primary)
        }
    }
}

private extension URL {
    var isSVG: Bool {
        pathExtension.caseInsensitiveCompare("svg") == .orderedSame
    }
}

private extension ColorScheme {
    var cacheKey: String {
        switch self {
        case .dark:
            return "dark"
        default:
            return "light"
        }
    }
}
