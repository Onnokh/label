import { Context, Effect, Layer } from "effect"

import { AppConfig } from "../../runtime/Config.js"

export const publicProfileCacheTag = (handle: string) => `public-profile:${handle}`

type CloudflarePurgeResponse = {
  readonly success?: boolean
  readonly errors?: ReadonlyArray<{ readonly message?: string }>
}

const purgeError = (response: Response, body: CloudflarePurgeResponse) => {
  const detail = body.errors?.[0]?.message ?? `HTTP ${response.status}`
  return new Error(`Cloudflare cache purge failed: ${detail}`)
}

/**
 * Purges the edge representation of one Public Profile after a visibility
 * change. Missing configuration is a deliberate no-op for local development;
 * a configured failure is logged and falls back to the short cache lifetime.
 */
export class PublicProfileCachePurger extends Context.Service<PublicProfileCachePurger>()(
  "@app/modules/profiles/PublicProfileCachePurger",
  {
    make: Effect.gen(function* () {
      const config = yield* AppConfig

      return {
        purge: (handle: string) => {
          const { cloudflareZoneId, cloudflarePurgeApiToken } = config.cache
          if (!cloudflareZoneId || !cloudflarePurgeApiToken) return Effect.void
          const tag = publicProfileCacheTag(handle)

          return Effect.promise(async () => {
            try {
              const response = await globalThis.fetch(
                `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(cloudflareZoneId)}/purge_cache`,
                {
                  method: "POST",
                  headers: {
                    authorization: `Bearer ${cloudflarePurgeApiToken}`,
                    "content-type": "application/json",
                  },
                  body: `{"tags":["${tag}"]}`,
                },
              )
              const body = await response.json() as CloudflarePurgeResponse
              if (!response.ok || body.success !== true) {
                throw purgeError(response, body)
              }
              return { _tag: "success" as const }
            } catch (cause) {
              return { _tag: "failure" as const, cause }
            }
          }).pipe(
            Effect.flatMap((result) => result._tag === "success"
              ? Effect.void
              : Effect.logWarning("Public Profile cache purge failed", {
                handle,
                cause: String(result.cause),
              })),
          )
        },
      }
    }),
  },
) {
  static readonly layer = Layer.effect(PublicProfileCachePurger, PublicProfileCachePurger.make)

  static readonly defaultLayer = PublicProfileCachePurger.layer.pipe(
    Layer.provide(AppConfig.layer),
  )
}
