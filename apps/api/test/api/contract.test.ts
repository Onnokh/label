import { describe, expect } from "bun:test"
import { Effect, Schema } from "effect"

import {
  CapturePayload,
  PublicSavedItemDto,
  publicSavedItemToDto,
  SavedItemDto,
  savedItemToDto,
} from "../../src/api/ApiContract.js"
import type {
  LinkId,
  SavedItemId,
  SavedItemWithLink,
  UserId,
} from "../../src/domain/SavedItem.js"
import { it } from "../lib/effect.js"

const now = new Date("2026-05-19T12:00:00.000Z")
const linkId = "link-1" as LinkId

const makeSavedItem = (
  tags: SavedItemWithLink["savedItem"]["tags"],
  enrichmentTags: SavedItemWithLink["enrichment"]["tags"],
): SavedItemWithLink => ({
  savedItem: {
    id: "saved-item-1" as SavedItemId,
    userId: "user-1" as UserId,
    linkId,
    tags,
    isRead: false,
    isPrivate: false,
    lastSavedAt: now,
    createdAt: now,
    updatedAt: now,
  },
  link: {
    id: linkId,
    originalUrl: "https://example.com",
    normalizedUrl: "https://example.com/",
    host: "example.com",
    createdAt: now,
    updatedAt: now,
  },
  metadata: {
    linkId,
    title: "Example",
    fetchedAt: now,
    updatedAt: now,
  },
  enrichment: {
    linkId,
    type: "website",
    tags: enrichmentTags,
    status: "pending",
    updatedAt: now,
  },
})

// The allow-list of ADR 0016, written out by hand. The job of the two tests
// below is to fail when the public Saved Item representation gains a property
// that nobody decided to publish: a field added to it must break this list
// instead of reaching an anonymous visitor unnoticed. Change this list only
// together with that decision.
const publicSavedItemProperties = [
  "originalUrl",
  "host",
  "title",
  "faviconUrl",
  "faviconLightUrl",
  "faviconDarkUrl",
  "imageUrl",
  "type",
  "tags",
  "previewSummary",
  "savedAt",
]

// Properties the private representation carries and a Public Profile withholds.
const withheldSavedItemProperties = [
  "id",
  "normalizedUrl",
  "description",
  "siteName",
  "canonicalUrl",
  "enrichmentStatus",
  "sourceName",
  "captureChannel",
  "folder",
  "isRead",
  "isPrivate",
  "lastSavedAt",
  "createdAt",
  "updatedAt",
]

const publicSavedItem = {
  originalUrl: "https://example.com/articles/public",
  host: "example.com",
  title: "Public Article",
  faviconUrl: "https://example.com/favicon.ico",
  faviconLightUrl: "https://example.com/favicon-light.png",
  faviconDarkUrl: "https://example.com/favicon-dark.png",
  imageUrl: "https://example.com/cover.png",
  type: "article" as const,
  tags: ["backend" as const],
  previewSummary: "One sentence a visitor reads before opening the Link.",
  savedAt: now,
}

describe("ApiContract", () => {
  it.effect("decodes valid capture payloads", () =>
    Effect.gen(function* () {
      const payload = yield* Schema.decodeUnknownEffect(CapturePayload)({
        url: "https://example.com",
        captureChannel: "api",
        tags: ["backend"],
      })

      expect(payload.url).toBe("https://example.com")
      expect(payload.captureChannel).toBe("api")
      expect(payload.tags).toEqual(["backend"])
    }),
  )

  it.effect("rejects capture tags outside the public vocabulary", () =>
    Effect.gen(function* () {
      const exit = yield* Schema.decodeUnknownEffect(CapturePayload)({
        url: "https://example.com",
        tags: ["not-a-topic"],
      }).pipe(Effect.exit)

      expect(exit._tag).toBe("Failure")
    }),
  )

  it.effect("uses saved-item tags before enrichment tags", () =>
    Effect.sync(() => {
      expect(savedItemToDto(makeSavedItem(["backend"], ["tools"])).tags).toEqual([
        "backend",
      ])
    }),
  )

  it.effect("falls back to enrichment tags when a saved item has no explicit tags", () =>
    Effect.sync(() => {
      expect(savedItemToDto(makeSavedItem([], ["tools"])).tags).toEqual([
        "tools",
      ])
    }),
  )

  // The leak guard. It fails on any property the public Saved Item
  // representation gains, which is the whole reason it exists.
  it.effect("publishes exactly the allow-listed Saved Item properties", () =>
    Effect.sync(() => {
      expect(Object.keys(PublicSavedItemDto.fields).sort()).toEqual(
        [...publicSavedItemProperties].sort(),
      )

      // The wire form too, not only the declaration: a fully filled item
      // encodes these property names and nothing else.
      const encoded = Schema.encodeUnknownSync(PublicSavedItemDto)(
        publicSavedItemToDto(publicSavedItem),
      ) as Record<string, unknown>
      expect(Object.keys(encoded).sort()).toEqual([...publicSavedItemProperties].sort())
    }),
  )

  it.effect("withholds the Saved Item properties a Public Profile keeps private", () =>
    Effect.sync(() => {
      const publishedProperties = Object.keys(PublicSavedItemDto.fields)
      const privateProperties = Object.keys(SavedItemDto.fields)

      for (const withheld of withheldSavedItemProperties) {
        // Named on the private representation, so this list keeps checking real
        // fields rather than names nothing ever had.
        expect(privateProperties).toContain(withheld)
        expect(publishedProperties).not.toContain(withheld)
      }
    }),
  )
})
