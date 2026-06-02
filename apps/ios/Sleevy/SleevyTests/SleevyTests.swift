//
//  SleevyTests.swift
//  SleevyTests
//
//  Created by Onno Klein Hofmeijer on 01/05/2026.
//

import Foundation
import Testing
@testable import Sleevy

struct SleevyTests {

    @Test func savedItemDecodesCurrentTagsShape() throws {
        let item = try decodeSavedItem(
            extraFields: #""tags":["front-end","tools"]"#
        )

        #expect(item.tags == ["front-end", "tools"])
    }

    @Test func savedItemDefaultsMissingTagsToEmptyArray() throws {
        let item = try decodeSavedItem(extraFields: "")

        #expect(item.tags == [])
    }

    @Test func savedItemDecodesLegacyTopicShape() throws {
        let item = try decodeSavedItem(
            extraFields: #""topic":"productivity""#
        )

        #expect(item.tags == ["productivity"])
    }

    @Test func savedItemDecodesSourceFields() throws {
        let item = try decodeSavedItem(
            extraFields: #""sourceName":"Onno's iPhone","captureChannel":"ios-share-extension","tags":["tools"]"#
        )

        #expect(item.sourceName == "Onno's iPhone")
        #expect(item.captureChannel == "ios-share-extension")
    }

    @Test func savedItemDecodesNullFolder() throws {
        let item = try decodeSavedItem(extraFields: #""folder":null,"tags":[]"#)

        #expect(item.folder == nil)
    }

    @Test func savedItemDecodesEmbeddedFolderSummary() throws {
        let item = try decodeSavedItem(
            extraFields: #""folder":{"id":"folder-1","name":"Merge Requests","emoji":"💻","color":"purple"},"tags":[]"#
        )

        #expect(item.folder == FolderSummary(id: "folder-1", name: "Merge Requests", emoji: "💻", color: "purple"))
    }

    @Test func savedItemDecodesDatesWithoutFractionalSeconds() throws {
        let item = try decodeSavedItem(
            lastSavedAt: "2026-05-13T10:11:12Z",
            createdAt: "2026-05-13T10:11:12Z",
            updatedAt: "2026-05-13T10:11:12Z",
            extraFields: #""tags":["tools"]"#
        )

        #expect(item.lastSavedAt.timeIntervalSince1970 > 0)
    }

    private func decodeSavedItem(
        lastSavedAt: String = "2026-05-13T10:11:12.345Z",
        createdAt: String = "2026-05-13T10:11:12.345Z",
        updatedAt: String = "2026-05-13T10:11:12.345Z",
        extraFields: String
    ) throws -> SavedItem {
        let separator = extraFields.isEmpty ? "" : ","
        let json = """
        {
          "id": "item-1",
          "originalUrl": "https://example.com/article",
          "normalizedUrl": "https://example.com/article",
          "host": "example.com",
          "type": "article",
          \(extraFields)\(separator)
          "enrichmentStatus": "enriched",
          "isRead": false,
          "lastSavedAt": "\(lastSavedAt)",
          "createdAt": "\(createdAt)",
          "updatedAt": "\(updatedAt)"
        }
        """
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .sleevyISO8601
        return try decoder.decode(SavedItem.self, from: Data(json.utf8))
    }

}
