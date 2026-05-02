import { Context, Data, Effect, Layer, Option, Result, Schema } from "effect"
import { chromium } from "playwright"

import { AppConfig } from "../../runtime/Config.js"

export class PageDocument extends Schema.Class<PageDocument>("PageDocument")({
  requestedUrl: Schema.String,
  finalUrl: Schema.String,
  html: Schema.String,
  contentType: Schema.String,
  fetchedAt: Schema.Date,
}) {}

export class PageFetcherError extends Data.TaggedError("PageFetcherError")<{
  readonly operation: string
  readonly url: string
  readonly cause: unknown
}> {}

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

export class PageFetcher extends Context.Service<PageFetcher>()(
  "@app/modules/fetch/PageFetcher",
  {
    make: Effect.gen(function* () {
      const config = yield* AppConfig

      return {
        fetch: (url: string) =>
          Effect.gen(function* () {
            const httpResult = yield* Effect.all([fetchViaHttp(url, config.fetch)], {
              mode: "result",
            }).pipe(Effect.map(([result]) => result))

            if (!config.fetch.browserFallbackEnabled) {
              if (Result.isSuccess(httpResult)) {
                return httpResult.success
              }

              return yield* httpResult.failure
            }

            if (Result.isSuccess(httpResult)) {
              return httpResult.success
            }

            if (!isBlockedFetchError(httpResult.failure)) {
              return yield* httpResult.failure
            }

            const browserResult = yield* fetchViaBrowser(url, config.fetch).pipe(
              (effect) => Effect.all([effect], { mode: "result" }).pipe(Effect.map(([result]) => result)),
            )

            if (Result.isSuccess(browserResult)) {
              return browserResult.success
            }

            return yield* new PageFetcherError({
              operation: "fetch-with-browser-fallback",
              url,
              cause: new Error(
                [
                  `HTTP fetch failed: ${String(httpResult.failure.cause)}`,
                  `Browser fallback failed: ${String(browserResult.failure.cause)}`,
                ].join(" | "),
              ),
            })
          }),
      }
    }),
  },
) {
  static readonly layer = Layer.effect(PageFetcher, PageFetcher.make)
}
