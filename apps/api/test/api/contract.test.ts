import { describe, expect } from "bun:test"
import { Effect, Schema } from "effect"

import { CapturePayload, savedItemToDto } from "../../src/api/ApiContract.js"
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
})
