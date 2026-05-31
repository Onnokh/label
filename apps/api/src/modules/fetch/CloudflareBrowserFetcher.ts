import { Context, Effect, Layer, Option, Schema } from "effect"

import { AppConfig } from "../../runtime/Config.js"
import { PageDocument, PageFetcherError } from "./PageDocument.js"

const cloudflareBrowserContentRequest = Schema.Struct({
  url: Schema.String,
  gotoOptions: Schema.optional(Schema.Struct({
    waitUntil: Schema.optional(Schema.String),
  })),
  waitForSelector: Schema.optional(Schema.Struct({
    selector: Schema.String,
    timeout: Schema.optional(Schema.Number),
  })),
})

const cloudflareBrowserContentRequestJson = Schema.fromJsonString(
  cloudflareBrowserContentRequest,
)

const cloudflareContentResponse = Schema.Struct({
  success: Schema.Boolean,
  result: Schema.optional(Schema.String),
  errors: Schema.optional(
    Schema.Array(
      Schema.Struct({
        code: Schema.Number,
        message: Schema.String,
      }),
    ),
  ),
  meta: Schema.optional(
    Schema.Struct({
      status: Schema.optional(Schema.Number),
      title: Schema.optional(Schema.String),
    }),
  ),
})

const cloudflareContentResponseJson = Schema.fromJsonString(cloudflareContentResponse)

export class CloudflareBrowserFetcher extends Context.Service<CloudflareBrowserFetcher>()(
  "@app/modules/fetch/CloudflareBrowserFetcher",
  {
    make: Effect.gen(function* () {
      const config = yield* AppConfig
      const accountId = config.fetch.cloudflareAccountId
      const apiToken = config.fetch.cloudflareApiToken

      const isConfigured = accountId.length > 0 && apiToken.length > 0

      return {
        fetch: Effect.fn("CloudflareBrowserFetcher.fetch")(function* (url: string) {
          yield* Effect.annotateCurrentSpan("url", url)
          if (!isConfigured) {
            return Option.none<PageDocument>()
          }

          return yield* Effect.tryPromise({
            try: async () => {
              // Resolve URL first to handle redirects (e.g., Reddit share URLs -> canonical URLs)
              // This prevents "execution context destroyed" errors from navigation during rendering
              let resolvedUrl = url
              try {
                const headResponse = await fetch(url, {
                  method: "HEAD",
                  redirect: "follow",
                  headers: {
                    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
                  },
                })
                resolvedUrl = headResponse.url || url
              } catch {
                // Use original URL if resolution fails
              }

              const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/content`

              const requestBody = Schema.encodeUnknownSync(cloudflareBrowserContentRequestJson)({
                url: resolvedUrl,
                gotoOptions: { waitUntil: "networkidle0" },
              })

              const response = await globalThis.fetch(endpoint, {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                  authorization: `Bearer ${apiToken}`,
                },
                body: requestBody,
              })

              if (!response.ok) {
                const errorBody = await response.text().catch(() => "")
                throw new Error(
                  `Cloudflare API HTTP ${response.status}: ${errorBody.slice(0, 500)}`,
                )
              }

              const raw = await response.text()
              const decoded = Schema.decodeUnknownSync(cloudflareContentResponseJson)(raw)

              if (!decoded.success) {
                const errorMessages = (decoded.errors ?? [])
                  .map((e) => `${e.code}: ${e.message}`)
                  .join("; ")
                throw new Error(
                  errorMessages || "Cloudflare API returned success=false",
                )
              }

              const html = decoded.result
              if (!html || html.trim().length === 0) {
                return Option.none<PageDocument>()
              }

              return Option.some(
                new PageDocument({
                  requestedUrl: url,
                  finalUrl: resolvedUrl,
                  html,
                  contentType: "text/html",
                  fetchedAt: new Date(),
                }),
              )
            },
            catch: (cause) =>
              new PageFetcherError({
                operation: "cloudflare-browser-fetch",
                url,
                cause,
              }),
          })
        }),
      }
    }),
  },
) {
  static readonly layer = Layer.effect(
    CloudflareBrowserFetcher,
    CloudflareBrowserFetcher.make,
  )
}