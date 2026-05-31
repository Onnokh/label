import { Context, Effect, Layer } from "effect"

import { AppConfig } from "../../runtime/Config.js"
import { trackEvent, type RybbitEvent } from "./RybbitClient.js"

/*
 * Effect wrapper around the Rybbit client. `track` is always safe to call: the
 * underlying client self-gates on configuration, so when Rybbit is disabled or
 * unconfigured this resolves to an immediate no-op. Callers fork it
 * (`Effect.forkDetach`) so it never adds latency to the request that emits it.
 */
export class Analytics extends Context.Service<Analytics>()(
  "@app/modules/analytics/Analytics",
  {
    make: Effect.gen(function* () {
      const config = yield* AppConfig

      return {
        track: (event: RybbitEvent) =>
          Effect.promise(() => trackEvent(config.rybbit, event)),
      }
    }),
  },
) {
  static readonly layer = Layer.effect(Analytics, Analytics.make)

  static readonly defaultLayer = Analytics.layer.pipe(
    Layer.provide(AppConfig.layer),
  )
}
