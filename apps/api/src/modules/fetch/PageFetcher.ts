import { Effect, Either, Option, Schema } from "effect"
import { chromium } from "playwright"

import { AppConfig } from "../../runtime/Config.js"

export class PageDocument extends Schema.Class<PageDocument>("PageDocument")({
  requestedUrl: Schema.String,
  finalUrl: Schema.String,
  html: Schema.String,
  contentType: Schema.String,
  fetchedAt: Schema.Date,
}) {}

export class PageFetcherError extends Schema.TaggedError<PageFetcherError>()(
  "PageFetcherError",
  {
    operation: Schema.String,
    url: Schema.String,
    cause: Schema.Defect,
  },
) {}

const isBlockedFetchError = (error: PageFetcherError) => {
  const message =
    error.cause instanceof Error ? error.cause.message : String(error.cause)

  return /\bHTTP (403|429)\b/.test(message)
}

const fetchViaHttp = (
  url: string,
  config: {
    readonly timeoutMs: number
    readonly userAgent: string
  },
) =>
  Effect.tryPromise({
    try: async () => {
      const abortController = new AbortController()
      const timeout = setTimeout(() => abortController.abort(), config.timeoutMs)

      try {
        const response = await fetch(url, {
          headers: {
            "user-agent": config.userAgent,
            accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "accept-language": "en-US,en;q=0.9",
            "cache-control": "no-cache",
            pragma: "no-cache",
          },
          redirect: "follow",
          signal: abortController.signal,
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const contentType = response.headers.get("content-type") ?? ""

        if (!contentType.toLowerCase().includes("text/html")) {
          return Option.none<PageDocument>()
        }

        return Option.some(
          new PageDocument({
            requestedUrl: url,
            finalUrl: response.url || url,
            html: await response.text(),
            contentType,
            fetchedAt: new Date(),
          }),
        )
      } finally {
        clearTimeout(timeout)
      }
    },
    catch: (cause) =>
      new PageFetcherError({
        operation: "fetch",
        url,
        cause,
      }),
  })

const fetchViaBrowser = (
  url: string,
  config: {
    readonly browserTimeoutMs: number
    readonly browserHeadless: boolean
    readonly userAgent: string
  },
) =>
  Effect.tryPromise({
    try: async () => {
      const browser = await chromium.launch({
        headless: config.browserHeadless,
      })

      try {
        const context = await browser.newContext({
          userAgent: config.userAgent,
          locale: "en-US",
        })

        try {
          const page = await context.newPage()
          page.setDefaultNavigationTimeout(config.browserTimeoutMs)
          page.setDefaultTimeout(config.browserTimeoutMs)

          const response = await page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: config.browserTimeoutMs,
          })

          await page.waitForTimeout(1_000)

          const status = response?.status()

          if (typeof status === "number" && status >= 400) {
            throw new Error(`HTTP ${status}`)
          }

          const contentType = response?.headers()["content-type"] ?? "text/html"

          if (!contentType.toLowerCase().includes("text/html")) {
            return Option.none<PageDocument>()
          }

          return Option.some(
            new PageDocument({
              requestedUrl: url,
              finalUrl: page.url(),
              html: await page.content(),
              contentType,
              fetchedAt: new Date(),
            }),
          )
        } finally {
          await context.close()
        }
      } finally {
        await browser.close()
      }
    },
    catch: (cause) =>
      new PageFetcherError({
        operation: "browser-fetch",
        url,
        cause,
      }),
  })

export class PageFetcher extends Effect.Service<PageFetcher>()(
  "@app/modules/fetch/PageFetcher",
  {
    effect: Effect.gen(function* () {
      const config = yield* AppConfig

      return {
        fetch: (url: string) =>
          Effect.gen(function* () {
            const httpResult = yield* fetchViaHttp(url, config.fetch).pipe(Effect.either)

            if (!config.fetch.browserFallbackEnabled) {
              if (Either.isRight(httpResult)) {
                return httpResult.right
              }

              return yield* httpResult.left
            }

            if (Either.isRight(httpResult)) {
              return httpResult.right
            }

            if (!isBlockedFetchError(httpResult.left)) {
              return yield* httpResult.left
            }

            const browserResult = yield* fetchViaBrowser(url, config.fetch).pipe(
              Effect.either,
            )

            if (Either.isRight(browserResult)) {
              return browserResult.right
            }

            return yield* new PageFetcherError({
              operation: "fetch-with-browser-fallback",
              url,
              cause: new Error(
                [
                  `HTTP fetch failed: ${String(httpResult.left.cause)}`,
                  `Browser fallback failed: ${String(browserResult.left.cause)}`,
                ].join(" | "),
              ),
            })
          }),
      }
    }),
  },
) {}

export const pageFetcherLayer = PageFetcher.Default
