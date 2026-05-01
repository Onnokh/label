/*
 * Phase 1 goal:
 * Centralize application configuration behind a single Effect service with nested sections.
 *
 * Still to implement:
 * Finalize the config shape, decide on the exact environment variable naming scheme, and add the
 * fetch/AI settings the live layers will need once persistence and enrichment are implemented.
 */

import { Config, Context, Effect, Layer, Option } from "effect"

type AppConfigShape = {
  readonly sqlite: {
    readonly path: string
  }
  readonly fetch: {
    readonly timeoutMs: number
    readonly userAgent: string
    readonly browserFallbackEnabled: boolean
    readonly browserTimeoutMs: number
    readonly browserHeadless: boolean
  }
  readonly ai: {
    readonly enabled: boolean
    readonly provider: string | undefined
    readonly model: string | undefined
  }
}

export class AppConfig extends Context.Tag("@app/runtime/AppConfig")<
  AppConfig,
  AppConfigShape
>() {
  static readonly layer = Layer.effect(
    AppConfig,
    Effect.gen(function* () {
      const sqlitePath = yield* Config.string("SQLITE_PATH").pipe(
        Config.orElse(() => Config.succeed("./data/SavedItems.sqlite")),
      )

      const aiEnabled = yield* Config.boolean("AI_ENABLED").pipe(
        Config.orElse(() => Config.succeed(false)),
      )

      const fetchTimeoutMs = yield* Config.integer("FETCH_TIMEOUT_MS").pipe(
        Config.orElse(() => Config.succeed(5_000)),
      )

      const fetchUserAgent = yield* Config.string("FETCH_USER_AGENT").pipe(
        Config.orElse(() =>
          Config.succeed("saved-items/1.0 (+https://localhost/SavedItems)"),
        ),
      )

      const browserFallbackEnabled = yield* Config.boolean(
        "FETCH_BROWSER_FALLBACK_ENABLED",
      ).pipe(Config.orElse(() => Config.succeed(true)))

      const browserTimeoutMs = yield* Config.integer("FETCH_BROWSER_TIMEOUT_MS").pipe(
        Config.orElse(() => Config.succeed(15_000)),
      )

      const browserHeadless = yield* Config.boolean("FETCH_BROWSER_HEADLESS").pipe(
        Config.orElse(() => Config.succeed(true)),
      )

      const aiProvider = yield* Config.option(Config.string("AI_PROVIDER"))
      const aiModel = yield* Config.option(Config.string("AI_MODEL"))

      return {
        sqlite: {
          path: sqlitePath,
        },
        fetch: {
          timeoutMs: fetchTimeoutMs,
          userAgent: fetchUserAgent,
          browserFallbackEnabled,
          browserTimeoutMs,
          browserHeadless,
        },
        ai: {
          enabled: aiEnabled,
          provider: Option.getOrUndefined(aiProvider),
          model: Option.getOrUndefined(aiModel),
        },
      }
    }),
  )
}
