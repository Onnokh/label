import { spawn } from "node:child_process"

import { Context, Effect, Layer, Option } from "effect"

import { AppConfig } from "../../runtime/Config.js"
import { PageDocument, PageFetcherError } from "./PageDocument.js"

const runLightpanda = (url: string, timeoutMs: number): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn(
      "lightpanda",
      ["fetch", "--dump", "html", "--wait-until", "domcontentloaded", url],
      { stdio: ["ignore", "pipe", "pipe"] },
    )

    let stdout = ""
    let stderr = ""
    let settled = false

    const settle = (fn: () => void) => {
      if (settled) return
      settled = true
      fn()
    }

    const killTimer = setTimeout(() => {
      child.kill("SIGKILL")
      settle(() =>
        reject(new Error(`Lightpanda timed out after ${timeoutMs}ms`)),
      )
    }, timeoutMs)

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString()
    })

    child.on("error", (error) => {
      clearTimeout(killTimer)
      settle(() => reject(error))
    })

    child.on("close", (code) => {
      clearTimeout(killTimer)
      if (stdout.length > 0) {
        settle(() => resolve(stdout))
      } else {
        const trimmed = stderr.trim() || `exit code ${code}`
        settle(() => reject(new Error(`Lightpanda failed: ${trimmed}`)))
      }
    })
  })

export class LightpandaFetcher extends Context.Service<LightpandaFetcher>()(
  "@app/modules/fetch/LightpandaFetcher",
  {
    make: Effect.gen(function* () {
      const config = yield* AppConfig

      return {
        fetch: Effect.fn("LightpandaFetcher.fetch")(function* (url: string) {
          yield* Effect.annotateCurrentSpan("url", url)
          return yield* Effect.tryPromise({
            try: async () => {
              const html = await runLightpanda(url, config.fetch.browserTimeoutMs)

              if (html.trim().length === 0) {
                throw new Error("Lightpanda returned empty document")
              }

              return Option.some(
                new PageDocument({
                  requestedUrl: url,
                  finalUrl: url,
                  html,
                  contentType: "text/html",
                  fetchedAt: new Date(),
                }),
              )
            },
            catch: (cause) =>
              new PageFetcherError({
                operation: "lightpanda-fetch",
                url,
                cause,
              }),
          })
        }),
      }
    }),
  },
) {
  static readonly layer = Layer.effect(LightpandaFetcher, LightpandaFetcher.make)
}