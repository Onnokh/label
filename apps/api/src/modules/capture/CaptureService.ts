import { Context, Effect, Layer } from "effect"

import type {
  CaptureChannel,
  FolderId,
  LinkType,
  Topic,
  UserId,
} from "../../domain/SavedItem.js"
import {
  CaptureServiceStore,
  type NormalizedCaptureUrl,
} from "./CaptureServiceStore.js"
import { InvalidUrl } from "./CaptureError.js"

export type CaptureInput = {
  readonly userId: UserId
  readonly url: string
  readonly sourceName?: string
  readonly captureChannel?: CaptureChannel
  readonly tags?: readonly Topic[]
  readonly folderId?: FolderId | null
}

export type CaptureServiceError = InvalidUrl

const inferType = (url: URL): LinkType => {
  const host = url.hostname.toLowerCase().replace(/^www\./, "")
  const href = url.toString().toLowerCase()

  if (host === "github.com" || host === "gitlab.com") {
    return "repository"
  }

  if (host === "youtube.com" || host === "youtu.be" || host === "vimeo.com") {
    return "video"
  }

  if (href.includes("blog") || href.includes("article")) {
    return "article"
  }

  return "website"
}

export const normalizeCaptureUrl = (input: string): Effect.Effect<NormalizedCaptureUrl, InvalidUrl> =>
  Effect.try({
    try: () => {
      const original = new URL(input.trim())
      const normalized = new URL(original)
      normalized.hash = ""
      normalized.protocol = normalized.protocol.toLowerCase()
      normalized.hostname = normalized.hostname.toLowerCase()

      if (normalized.protocol !== "http:" && normalized.protocol !== "https:") {
        throw new Error("Unsupported URL protocol.")
      }

      if (
        (normalized.protocol === "https:" && normalized.port === "443") ||
        (normalized.protocol === "http:" && normalized.port === "80")
      ) {
        normalized.port = ""
      }

      normalized.searchParams.sort()

      return {
        originalUrl: original.toString(),
        normalizedUrl: normalized.toString(),
        host: normalized.host,
        type: inferType(normalized),
      }
    },
    catch: () => new InvalidUrl({ url: input }),
  })

export class CaptureService extends Context.Service<CaptureService>()(
  "@app/modules/capture/CaptureService",
  {
    make: Effect.gen(function* () {
      const store = yield* CaptureServiceStore

      return {
        save: Effect.fn("CaptureService.save")(function* (input: CaptureInput) {
          const url = yield* normalizeCaptureUrl(input.url)

          return yield* store.save({
            userId: input.userId,
            url,
            ...(input.sourceName !== undefined ? { sourceName: input.sourceName } : {}),
            ...(input.captureChannel !== undefined ? { captureChannel: input.captureChannel } : {}),
            ...(input.tags !== undefined ? { tags: input.tags } : {}),
            ...(input.folderId !== undefined ? { folderId: input.folderId } : {}),
          })
        }),
      }
    }),
  },
) {
  static readonly layer = Layer.effect(CaptureService, CaptureService.make)

  static readonly defaultLayer = CaptureService.layer.pipe(
    Layer.provide(CaptureServiceStore.defaultLayer),
  )
}
