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
    // Decode-only keys: identical to `CodingKeys` plus the retired `topic`
    // field, so stale cached payloads from older clients still load.
    private enum DecodingKeys: String, CodingKey {
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
        case topic
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

    // Custom decode tolerates a missing `tags` key (defaulting to `[]`) and a
    // legacy `topic` field, so one tolerant-only row can't fail the whole
    // inbox decode. Encoding stays synthesized off `CodingKeys`.
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DecodingKeys.self)
        let legacyTopic = try container.decodeIfPresent(String.self, forKey: .topic)

        id = try container.decode(String.self, forKey: .id)
        originalURL = try container.decode(String.self, forKey: .originalURL)
        normalizedURL = try container.decode(String.self, forKey: .normalizedURL)
        host = try container.decode(String.self, forKey: .host)
        title = try container.decodeIfPresent(String.self, forKey: .title)
        description = try container.decodeIfPresent(String.self, forKey: .description)
        siteName = try container.decodeIfPresent(String.self, forKey: .siteName)
        faviconURL = try container.decodeIfPresent(String.self, forKey: .faviconURL)
        faviconLightURL = try container.decodeIfPresent(String.self, forKey: .faviconLightURL)
        faviconDarkURL = try container.decodeIfPresent(String.self, forKey: .faviconDarkURL)
        canonicalURL = try container.decodeIfPresent(String.self, forKey: .canonicalURL)
        previewSummary = try container.decodeIfPresent(String.self, forKey: .previewSummary)
        type = try container.decode(String.self, forKey: .type)
        tags = try container.decodeIfPresent([String].self, forKey: .tags) ?? legacyTopic.map { [$0] } ?? []
        enrichmentStatus = try container.decode(EnrichmentStatus.self, forKey: .enrichmentStatus)
        sourceName = try container.decodeIfPresent(String.self, forKey: .sourceName)
        captureChannel = try container.decodeIfPresent(String.self, forKey: .captureChannel)
        folder = try container.decodeIfPresent(FolderSummary.self, forKey: .folder)
        isRead = try container.decode(Bool.self, forKey: .isRead)
        lastSavedAt = try container.decode(Date.self, forKey: .lastSavedAt)
        createdAt = try container.decode(Date.self, forKey: .createdAt)
        updatedAt = try container.decode(Date.self, forKey: .updatedAt)
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
