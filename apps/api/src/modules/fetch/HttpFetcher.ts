import { Context, Effect, Layer, Option } from "effect"

import { AppConfig } from "../../runtime/Config.js"
import { PageDocument, PageFetcherError } from "./PageDocument.js"

export class HttpFetcher extends Context.Service<HttpFetcher>()(
  "@app/modules/fetch/HttpFetcher",
  {
    make: Effect.gen(function* () {
      const config = yield* AppConfig

      return {
        fetch: Effect.fn("HttpFetcher.fetch")(function* (url: string) {
          yield* Effect.annotateCurrentSpan("url", url)
          return yield* Effect.tryPromise({
            try: async () => {
              const abortController = new AbortController()
              const timeout = setTimeout(
                () => abortController.abort(),
                config.fetch.timeoutMs,
              )

              try {
                const response = await globalThis.fetch(url, {
                  headers: {
                    "user-agent": config.fetch.userAgent,
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
                operation: "http-fetch",
                url,
                cause,
              }),
          })
        }),
      }
    }),
  },
) {
  static readonly layer = Layer.effect(HttpFetcher, HttpFetcher.make)
}