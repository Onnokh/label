import Foundation

struct SavedItem: Decodable, Identifiable, Equatable {
    let id: String
    let userId: String
    let originalURL: String
    let normalizedURL: String
    let host: String
    let title: String?
    let description: String?
    let siteName: String?
    let imageURL: String?
    let canonicalURL: String?
    let previewSummary: String?
    let generatedType: String?
    let generatedTopics: [String]
    let enrichmentStatus: EnrichmentStatus
    let isRead: Bool
    let lastSavedAt: Date
    let createdAt: Date
    let updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case userId
        case originalURL = "originalUrl"
        case normalizedURL = "normalizedUrl"
        case host
        case title
        case description
        case siteName
        case imageURL = "imageUrl"
        case canonicalURL = "canonicalUrl"
        case previewSummary
        case generatedType
        case generatedTopics
        case enrichmentStatus
        case isRead
        case lastSavedAt
        case createdAt
        case updatedAt
    }
}

enum EnrichmentStatus: String, Decodable {
    case pending
    case enriched
    case failed
}

struct SavedItemsResponse: Decodable {
    let savedItems: [SavedItem]
}
