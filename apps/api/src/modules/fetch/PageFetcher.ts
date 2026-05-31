import { Context, Effect, Layer, Option, Result } from "effect"

import { getMetaContent, getTitle, parseHtml } from "../../lib/html.js"
import { normalizeHostname } from "../../lib/url.js"
import { AppConfig } from "../../runtime/Config.js"
import { CloudflareBrowserFetcher } from "./CloudflareBrowserFetcher.js"
import { HttpFetcher } from "./HttpFetcher.js"
import { LightpandaFetcher } from "./LightpandaFetcher.js"
import { PageDocument, PageFetcherError } from "./PageDocument.js"

export { PageDocument, PageFetcherError } from "./PageDocument.js"

const isBlockedFetchError = (error: PageFetcherError) => {
  const message =
    error.cause instanceof Error ? error.cause.message : String(error.cause)

  return /\bHTTP (403|429)\b/.test(message)
}

const lowConfidenceTitlePatterns: ReadonlyArray<RegExp> = [
  /^blocked$/i,
  /^access denied$/i,
  /just a moment/i,
  /attention required/i,
  /are you a robot/i,
  /please wait/i,
  /security check/i,
  /verification/i,
  /privacy/i,
  /verify you are human/i,
  /checking your browser/i,
  /captcha/i,
  /^the heart of the internet$/i,
]

const isDomainLikeTitle = (title: string) =>
  /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(title)

const isLowConfidenceTitle = (
  title: string,
  comparisonUrls: ReadonlyArray<string>,
) => {
  const normalizedTitle = title.replace(/\s+/g, " ").trim().toLowerCase()
  if (!normalizedTitle) {
    return true
  }

  if (normalizedTitle.length < 3) {
    return true
  }

  if (lowConfidenceTitlePatterns.some((pattern) => pattern.test(normalizedTitle))) {
    return true
  }

  const hostnames = comparisonUrls
    .map((url) => normalizeHostname(url))
    .filter((hostname): hostname is string => hostname !== undefined)

  if (hostnames.some((hostname) => normalizedTitle === hostname)) {
    return true
  }

  if (isDomainLikeTitle(normalizedTitle)) {
    return true
  }

  return false
}

const shouldUseBrowserOnSuccessfulHttpFetch = (
  requestedUrl: string,
  page: PageDocument,
) => {
  const document = parseHtml(page.html)
  const candidateTitle =
    getMetaContent(document, ["og:title", "twitter:title"]) ?? getTitle(document)

  if (!candidateTitle) {
    return true
  }

  return isLowConfidenceTitle(candidateTitle, [
    requestedUrl,
    page.requestedUrl,
    page.finalUrl,
  ])
}

export class PageFetcher extends Context.Service<PageFetcher>()(
  "@app/modules/fetch/PageFetcher",
  {
    make: Effect.gen(function* () {
      const config = yield* AppConfig
      const httpFetcher = yield* HttpFetcher
      const cloudflareFetcher = yield* CloudflareBrowserFetcher
      const lightpandaFetcher = yield* LightpandaFetcher

      return {
        fetch: Effect.fn("PageFetcher.fetch")(function* (url: string) {
          yield* Effect.annotateCurrentSpan("url", url)
          const httpResult = yield* Effect.all(
            [httpFetcher.fetch(url)],
            { mode: "result" },
          ).pipe(Effect.map(([result]) => result))

          const browserFallbackEnabled =
            config.fetch.browserFallbackEnabled ||
            config.fetch.cloudflareAccountId.length > 0

          if (!browserFallbackEnabled) {
            if (Result.isSuccess(httpResult)) {
              return httpResult.success
            }

            return yield* httpResult.failure
          }

          if (Result.isSuccess(httpResult)) {
            if (
              Option.isSome(httpResult.success) &&
              shouldUseBrowserOnSuccessfulHttpFetch(url, httpResult.success.value)
            ) {
              yield* Effect.logInfo("http fetch returned low-confidence title, trying cloudflare", {
                url,
                title: (() => {
                  const doc = parseHtml(httpResult.success.value.html)
                  return getMetaContent(doc, ["og:title", "twitter:title"]) ?? getTitle(doc)
                })(),
              })

              const cloudflareResult = yield* Effect.all(
                [cloudflareFetcher.fetch(url)],
                { mode: "result" },
              ).pipe(Effect.map(([result]) => result))

              if (Result.isSuccess(cloudflareResult) && Option.isSome(cloudflareResult.success)) {
                if (!shouldUseBrowserOnSuccessfulHttpFetch(url, cloudflareResult.success.value)) {
                  yield* Effect.logInfo("cloudflare fetch succeeded", { url })
                  return cloudflareResult.success
                }

                yield* Effect.logInfo("cloudflare fetch returned low-confidence title, trying next fallback", {
                  url,
                  title: (() => {
                    const doc = parseHtml(cloudflareResult.success.value.html)
                    return getMetaContent(doc, ["og:title", "twitter:title"]) ?? getTitle(doc)
                  })(),
                })
              }

              if (Result.isFailure(cloudflareResult)) {
                yield* Effect.logWarning("cloudflare fetch failed", {
                  url,
                  cause: String(cloudflareResult.failure.cause),
                })
              } else if (Option.isNone(cloudflareResult.success)) {
                yield* Effect.logWarning("cloudflare returned none (not configured or empty)", { url })
              }

              if (config.fetch.browserFallbackEnabled) {
                yield* Effect.logInfo("trying lightpanda fallback", { url })
                const lightpandaResult = yield* Effect.all(
                  [lightpandaFetcher.fetch(url)],
                  { mode: "result" },
                ).pipe(Effect.map(([result]) => result))

                if (Result.isSuccess(lightpandaResult)) {
                  yield* Effect.logInfo("lightpanda fetch succeeded", { url })
                  return lightpandaResult.success
                }

                yield* Effect.logWarning("lightpanda fetch failed", {
                  url,
                  cause: Result.isFailure(lightpandaResult) ? String(lightpandaResult.failure.cause) : "returned none",
                })
              }
            }

            return httpResult.success
          }

          if (!isBlockedFetchError(httpResult.failure) && !config.fetch.browserFallbackEnabled) {
            return yield* httpResult.failure
          }

          yield* Effect.logInfo("http fetch failed or blocked, trying cloudflare fallback", {
            url,
            httpError: String(httpResult.failure.cause),
            isBlocked: isBlockedFetchError(httpResult.failure),
          })

          const cloudflareResult = yield* Effect.all(
            [cloudflareFetcher.fetch(url)],
            { mode: "result" },
          ).pipe(Effect.map(([result]) => result))

          if (Result.isSuccess(cloudflareResult) && Option.isSome(cloudflareResult.success)) {
            if (!shouldUseBrowserOnSuccessfulHttpFetch(url, cloudflareResult.success.value)) {
              yield* Effect.logInfo("cloudflare fallback succeeded", { url })
              return cloudflareResult.success
            }

            yield* Effect.logInfo("cloudflare fallback returned low-confidence title, trying next fallback", {
              url,
              title: (() => {
                const doc = parseHtml(cloudflareResult.success.value.html)
                return getMetaContent(doc, ["og:title", "twitter:title"]) ?? getTitle(doc)
              })(),
            })
          }

          if (Result.isFailure(cloudflareResult)) {
            yield* Effect.logWarning("cloudflare fallback failed", {
              url,
              cause: String(cloudflareResult.failure.cause),
            })
          } else if (Option.isNone(cloudflareResult.success)) {
            yield* Effect.logWarning("cloudflare returned none (not configured or empty)", { url })
          }

          if (config.fetch.browserFallbackEnabled) {
            yield* Effect.logInfo("trying lightpanda fallback", { url })
            const lightpandaResult = yield* Effect.all(
              [lightpandaFetcher.fetch(url)],
              { mode: "result" },
            ).pipe(Effect.map(([result]) => result))

            if (Result.isSuccess(lightpandaResult)) {
              yield* Effect.logInfo("lightpanda fallback succeeded", { url })
              return lightpandaResult.success
            }

            yield* Effect.logWarning("lightpanda fallback failed", {
              url,
              cause: Result.isFailure(lightpandaResult) ? String(lightpandaResult.failure.cause) : "returned none",
            })

            return yield* new PageFetcherError({
              operation: "fetch-with-fallback",
              url,
              cause: new Error(
                [
                  `HTTP fetch failed: ${String(httpResult.failure.cause)}`,
                  `Cloudflare fallback failed: ${Result.isFailure(cloudflareResult) ? String(cloudflareResult.failure.cause) : "no document"}`,
                  `Lightpanda fallback failed: ${String(lightpandaResult.failure.cause)}`,
                ].join(" | "),
              ),
            })
          }

          if (Result.isFailure(cloudflareResult)) {
            return yield* new PageFetcherError({
              operation: "fetch-with-cloudflare-fallback",
              url,
              cause: new Error(
                [
                  `HTTP fetch failed: ${String(httpResult.failure.cause)}`,
                  `Cloudflare fallback failed: ${String(cloudflareResult.failure.cause)}`,
                ].join(" | "),
              ),
            })
          }

          return cloudflareResult.success
        }),
      }
    }),
  },
) {
  static readonly layer = Layer.effect(PageFetcher, PageFetcher.make).pipe(
    Layer.provide(HttpFetcher.layer),
    Layer.provide(CloudflareBrowserFetcher.layer),
    Layer.provide(LightpandaFetcher.layer),
  )

  static readonly defaultLayer = PageFetcher.layer.pipe(
    Layer.provide(AppConfig.layer),
  )
}
