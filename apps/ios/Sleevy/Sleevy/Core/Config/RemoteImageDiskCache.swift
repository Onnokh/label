import CryptoKit
import Foundation

actor RemoteImageDiskCache {
    static let shared = RemoteImageDiskCache()

    private let fileManager: FileManager
    private let cacheDirectoryURL: URL

    init(fileManager: FileManager = .default) {
        self.fileManager = fileManager

        let applicationSupportURL = try! fileManager.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )

        self.cacheDirectoryURL = applicationSupportURL
            .appendingPathComponent("ReadingListCache", isDirectory: true)
            .appendingPathComponent("RemoteImages", isDirectory: true)
    }

    func data(for url: URL) async throws -> Data {
        if let cachedData = try? cachedData(for: url) {
            return cachedData
        }

        let request = URLRequest(url: url, cachePolicy: .returnCacheDataElseLoad)
        let (data, response) = try await AppConfig.remoteImageSession.data(for: request)

        if let httpResponse = response as? HTTPURLResponse,
           !(200 ..< 300).contains(httpResponse.statusCode) {
            throw RemoteImageDiskCacheError.unacceptableStatusCode(httpResponse.statusCode)
        }

        try? store(data, for: url)
        return data
    }

    private func cachedData(for url: URL) throws -> Data {
        try Data(contentsOf: fileURL(for: url))
    }

    private func store(_ data: Data, for url: URL) throws {
        try fileManager.createDirectory(
            at: cacheDirectoryURL,
            withIntermediateDirectories: true
        )

        let fileURL = fileURL(for: url)
        try data.write(to: fileURL, options: .atomic)

        var resourceValues = URLResourceValues()
        resourceValues.isExcludedFromBackup = true
        var writableFileURL = fileURL
        try? writableFileURL.setResourceValues(resourceValues)
    }

    private func fileURL(for url: URL) -> URL {
        let digest = SHA256.hash(data: Data(url.absoluteString.utf8))
            .map { String(format: "%02x", $0) }
            .joined()

        return cacheDirectoryURL.appendingPathComponent("\(digest).image", isDirectory: false)
    }
}

private enum RemoteImageDiskCacheError: Error {
    case unacceptableStatusCode(Int)
}
