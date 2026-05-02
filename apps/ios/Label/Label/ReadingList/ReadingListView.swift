import Combine
import SwiftUI
import UIKit
import WebKit

struct ReadingListView: View {
    @EnvironmentObject private var authStore: AuthStore
    @StateObject private var store: ReadingListStore

    init(session: AppSession) {
        _store = StateObject(wrappedValue: ReadingListStore(session: session))
    }

    var body: some View {
        Group {
            if store.isLoading && store.savedItems.isEmpty {
                ProgressView("Loading your sleeve...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if store.savedItems.isEmpty {
                ContentUnavailableView(
                    "Your Sleeve is empty",
                    systemImage: "book.closed",
                    description: Text("Links you save in Label will show up here.")
                )
            } else {
                List {
                    if let errorMessage = store.errorMessage {
                        Section {
                            Text(errorMessage)
                                .font(.footnote)
                                .foregroundStyle(.red)
                        }
                        .listRowBackground(Color.clear)
                    }

                    ForEach(store.savedItems) { item in
                        SavedItemRow(item: item) {
                            await store.markOpened(item)
                        }
                        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                            Button(role: .destructive) {
                                Task {
                                    await store.delete(item)
                                }
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                        .listRowInsets(EdgeInsets(top: 0, leading: 18, bottom: 0, trailing: 18))
                        .listRowBackground(Color.clear)
                        .listRowSeparatorTint(.white.opacity(0.08))
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                .background(Color(uiColor: .systemBackground))
                .refreshable {
                    await store.refresh()
                }
            }
        }
        .navigationTitle("Your Sleeve")
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button(role: .destructive) {
                        Task {
                            await authStore.signOut()
                        }
                    } label: {
                        Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
                .accessibilityLabel("More")
            }
        }
        .task {
            await store.loadIfNeeded()
        }
    }
}

private struct SavedItemRow: View {
    let item: SavedItem
    let onOpen: () async -> Void

    var body: some View {
        Button {
            Task {
                await onOpen()
            }
        } label: {
            HStack(alignment: .top, spacing: 12) {
                SavedItemStatusIndicator(isRead: item.isRead)
                    .padding(.top, 12)

                SavedItemFavicon(item: item)

                VStack(alignment: .leading, spacing: 6) {
                    Text(item.displayTitle)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                        .multilineTextAlignment(.leading)

                    Text(item.displayDomain)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Text(item.createdDateLabel)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
                    .padding(.top, 2)
            }
            .contentShape(Rectangle())
            .padding(.vertical, 14)
        }
        .buttonStyle(.plain)
    }
}

private struct SavedItemStatusIndicator: View {
    let isRead: Bool

    var body: some View {
        Circle()
            .fill(isRead ? Color.clear : Color.orange)
            .frame(width: 10, height: 10)
            .overlay {
                if isRead {
                    Circle()
                        .stroke(Color.secondary.opacity(0.35), lineWidth: 1.25)
                }
            }
    }
}

private struct SavedItemFavicon: View {
    @Environment(\.colorScheme) private var colorScheme
    let item: SavedItem

    var body: some View {
        Group {
            if let faviconURL = item.preferredFaviconURL(colorScheme: colorScheme) {
                if faviconURL.isSVG {
                    SVGRemoteImage(url: faviconURL, colorScheme: colorScheme) {
                        faviconFallback
                    }
                } else {
                    AsyncImage(url: faviconURL) { phase in
                        switch phase {
                        case .success(let image):
                            image
                                .resizable()
                                .scaledToFit()
                        case .empty, .failure:
                            faviconFallback
                        @unknown default:
                            faviconFallback
                        }
                    }
                }
            } else {
                faviconFallback
            }
        }
        .frame(width: 30, height: 30)
    }

    private var faviconFallback: some View {
        Text(item.monogram)
            .font(.system(size: 16, weight: .semibold, design: .rounded))
            .foregroundStyle(.secondary)
    }
}

private struct SVGRemoteImage<Fallback: View>: View {
    let url: URL
    let colorScheme: ColorScheme
    let fallback: () -> Fallback

    @StateObject private var loader: SVGSnapshotLoader

    init(
        url: URL,
        colorScheme: ColorScheme,
        @ViewBuilder fallback: @escaping () -> Fallback
    ) {
        self.url = url
        self.colorScheme = colorScheme
        self.fallback = fallback
        _loader = StateObject(
            wrappedValue: SVGSnapshotLoader(url: url, size: 30, colorScheme: colorScheme)
        )
    }

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
        .task {
            await loader.loadIfNeeded()
        }
        .id("\(url.absoluteString)|\(colorScheme.cacheKey)")
    }
}

@MainActor
private final class SVGSnapshotLoader: ObservableObject {
    @Published private(set) var image: UIImage?

    private let url: URL
    private let size: CGFloat
    private let colorScheme: ColorScheme
    private var hasStarted = false

    private static let cache = NSCache<NSString, UIImage>()

    init(url: URL, size: CGFloat, colorScheme: ColorScheme) {
        self.url = url
        self.size = size
        self.colorScheme = colorScheme
    }

    func loadIfNeeded() async {
        guard !hasStarted else { return }
        hasStarted = true

        let cacheKey = "\(url.absoluteString)|\(Int(size))|\(colorScheme.cacheKey)" as NSString
        if let cached = Self.cache.object(forKey: cacheKey) {
            image = cached
            return
        }

        do {
            let request = URLRequest(url: url, cachePolicy: .returnCacheDataElseLoad)
            let (data, response) = try await URLSession.shared.data(for: request)

            if let httpResponse = response as? HTTPURLResponse,
               !(200 ..< 300).contains(httpResponse.statusCode) {
                return
            }

            let renderedImage = try await Self.renderSVG(
                data: data,
                size: size,
                colorScheme: colorScheme
            )
            Self.cache.setObject(renderedImage, forKey: cacheKey)
            image = renderedImage
        } catch {
            return
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

private extension SavedItem {
    var displayTitle: String {
        title?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty
            ?? siteName?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty
            ?? displayDomain
    }

    var displayDomain: String {
        host.replacingOccurrences(
            of: #"^www\."#,
            with: "",
            options: .regularExpression
        )
    }

    var createdDateLabel: String {
        Self.createdDateFormatter.string(from: createdAt)
    }

    var googleFaviconURL: URL? {
        var components = URLComponents(string: "https://www.google.com/s2/favicons")
        components?.queryItems = [
            URLQueryItem(name: "domain", value: displayDomain),
            URLQueryItem(name: "sz", value: "64"),
        ]
        return components?.url
    }

    func preferredFaviconURL(colorScheme: ColorScheme) -> URL? {
        let themeSpecificURLString = switch colorScheme {
        case .dark:
            faviconDarkURL ?? faviconURL ?? faviconLightURL
        default:
            faviconLightURL ?? faviconURL ?? faviconDarkURL
        }

        if let themeSpecificURL = Self.safeRemoteFaviconURL(themeSpecificURLString) {
            return themeSpecificURL
        }

        return Self.safeRemoteFaviconURL(faviconURL) ?? googleFaviconURL
    }

    var monogram: String {
        String(displayDomain.prefix(1)).uppercased()
    }

    private static let createdDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.setLocalizedDateFormatFromTemplate("d MMM")
        return formatter
    }()

    private static func safeRemoteFaviconURL(_ value: String?) -> URL? {
        guard
            let value,
            let url = URL(string: value),
            let scheme = url.scheme?.lowercased(),
            scheme == "http" || scheme == "https"
        else {
            return nil
        }

        return url
    }
}

private extension String {
    var nonEmpty: String? {
        isEmpty ? nil : self
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
