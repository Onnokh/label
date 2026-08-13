import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"

import type {
  FolderId,
  LinkId,
  SavedItemId,
  SavedItemWithLink,
  UserId,
} from "../../src/domain/SavedItem.js"
import { CaptureService } from "../../src/modules/capture/CaptureService.js"
import {
  CaptureServiceStore,
  type SaveCaptureCommand,
} from "../../src/modules/capture/CaptureServiceStore.js"
import { it } from "../lib/effect.js"

const userId = "capture-user-1" as UserId
const linkId = "capture-link-1" as LinkId
const folderId = "capture-folder-1" as FolderId
const now = new Date("2026-05-19T12:00:00.000Z")

const savedItem: SavedItemWithLink = {
  savedItem: {
    id: "capture-saved-item-1" as SavedItemId,
    userId,
    linkId,
    tags: [],
    isRead: false,
    lastSavedAt: now,
    createdAt: now,
    updatedAt: now,
  },
  link: {
    id: linkId,
    originalUrl: "https://example.com/",
    normalizedUrl: "https://example.com/",
    host: "example.com",
    createdAt: now,
    updatedAt: now,
  },
  metadata: {
    linkId,
    fetchedAt: now,
    updatedAt: now,
  },
  enrichment: {
    linkId,
    type: "website",
    tags: [],
    status: "pending",
    updatedAt: now,
  },
}

const captureServiceLayer = (input: {
  readonly onSave?: (command: SaveCaptureCommand) => void
}) =>
  CaptureService.layer.pipe(
    Layer.provide(
      Layer.succeed(CaptureServiceStore, CaptureServiceStore.of({
        save: (command) =>
          Effect.sync(() => {
            input.onSave?.(command)
            return {
              savedItem,
              captureResult: "created" as const,
              enrichment: { _tag: "start" as const, linkId },
            }
          }),
      })),
    ),
  )

describe("CaptureService", () => {
  it.effect("normalizes URLs before saving through the store", () => {
    let seen: SaveCaptureCommand | undefined

    return Effect.gen(function* () {
      const capture = yield* CaptureService
      yield* capture.save({
        userId,
        url: "https://EXAMPLE.com:443/articles/effect-api?b=2&a=1#fragment",
        captureChannel: "api",
        folderId,
      }).pipe(Effect.exit)

      expect(seen?.url).toEqual({
        originalUrl: "https://example.com/articles/effect-api?b=2&a=1#fragment",
        normalizedUrl: "https://example.com/articles/effect-api?a=1&b=2",
        host: "example.com",
        type: "article",
      })
      expect(seen?.captureChannel).toBe("api")
      expect(seen?.folderId).toBe(folderId)
      expect("tags" in (seen ?? {})).toBe(false)
    }).pipe(
      Effect.provide(captureServiceLayer({
        onSave: (command) => {
          seen = command
        },
      })),
    )
  })

  // A capture decides where a Saved Item is filed, never who may read it. The
  // Folder it lands in is the only thing that can publish it, so the command a
  // capture hands the store must carry no audience flag of its own. This test
  // fails the moment one is added back.
  it.effect("hands the store no audience flag of its own", () => {
    let seen: SaveCaptureCommand | undefined

    return Effect.gen(function* () {
      const capture = yield* CaptureService
      yield* capture.save({
        userId,
        url: "https://example.com/articles/effect-api",
        folderId,
      }).pipe(Effect.exit)

      const audienceKeys = Object.keys(seen ?? {}).filter((key) =>
        /private|public|publish|visib/i.test(key),
      )
      expect(audienceKeys).toEqual([])
      expect(seen?.folderId).toBe(folderId)
    }).pipe(
      Effect.provide(captureServiceLayer({
        onSave: (command) => {
          seen = command
        },
      })),
    )
  })

  it.effect("rejects invalid URLs before calling the store", () => {
    let called = false

    return Effect.gen(function* () {
      const capture = yield* CaptureService
      const exit = yield* capture.save({
        userId,
        url: "file:///tmp/example.html",
      }).pipe(Effect.exit)

      expect(exit._tag).toBe("Failure")
      expect(called).toBe(false)
    }).pipe(
      Effect.provide(captureServiceLayer({
        onSave: () => {
          called = true
        },
      })),
    )
  })
})
