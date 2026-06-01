import Foundation

nonisolated struct FolderSummary: Codable, Equatable, Identifiable, Hashable {
    let id: String
    let name: String
    let emoji: String?
    let color: String?
}

nonisolated struct Folder: Codable, Equatable, Identifiable, Hashable {
    let id: String
    let name: String
    let emoji: String?
    let color: String?
}

nonisolated struct SavedItem: Codable, Identifiable, Equatable {
    var id: String
    var originalURL: String
    var normalizedURL: String
    var host: String
    var title: String?
    var description: String?
    var siteName: String?
    var faviconURL: String?
    var faviconLightURL: String?
    var faviconDarkURL: String?
    var canonicalURL: String?
    var previewSummary: String?
    var type: String
    var tags: [String]
    var enrichmentStatus: EnrichmentStatus
    var sourceName: String?
    var captureChannel: String?
    var folder: FolderSummary?
    var isRead: Bool
    var lastSavedAt: Date
    var createdAt: Date
    var updatedAt: Date

    // Maps the API's camelCase JSON keys; drives the synthesized
    // memberwise init, `encode(to:)`, and `init(from:)`.
    enum CodingKeys: String, CodingKey {
        case id
        case originalURL = "originalUrl"
        case normalizedURL = "normalizedUrl"
        case host
        case title
        case description
        case siteName
        case faviconURL = "faviconUrl"
        case faviconLightURL = "faviconLightUrl"
        case faviconDarkURL = "faviconDarkUrl"
        case canonicalURL = "canonicalUrl"
        case previewSummary
        case type
        case tags
        case enrichmentStatus
        case sourceName
        case captureChannel
        case folder
        case isRead
        case lastSavedAt
        case createdAt
        case updatedAt
    }
}

extension SavedItem {
    func withReadState(_ isRead: Bool) -> SavedItem {
        var copy = self
        copy.isRead = isRead
        return copy
    }

    func withFolder(_ folder: FolderSummary?) -> SavedItem {
        var copy = self
        copy.folder = folder
        return copy
    }
}

nonisolated enum EnrichmentStatus: String, Codable {
    case pending
    case enriched
    case failed
}

nonisolated struct SavedItemsResponse: Decodable {
    let savedItems: [SavedItem]
}

nonisolated struct FoldersResponse: Decodable {
    let folders: [Folder]
}
