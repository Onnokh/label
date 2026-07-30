import { Context, Effect, Layer } from "effect"

import { AppConfig } from "../../runtime/Config.js"
import { clientIdentity } from "./ClientIdentity.js"
import { trackEvent, type RybbitEvent } from "./RybbitClient.js"

/*
 * Effect wrapper around the Rybbit client. `track` is always safe to call: the
 * underlying client self-gates on configuration, so when Rybbit is disabled or
 * unconfigured this resolves to an immediate no-op. Callers fork it
 * (`Effect.forkDetach`) so it never adds latency to the request that emits it.
 *
 * `track` derives the originating visitor's IP/User-Agent from the current HTTP
 * request itself (see `clientIdentity`), so callers never thread request context
 * through. An `ipAddress`/`userAgent` set on the event still wins — used by the
 * better-auth hooks, which run outside a request and supply the session's values.
 */
export class Analytics extends Context.Service<Analytics>()(
  "@app/modules/analytics/Analytics",
  {
    make: Effect.gen(function* () {
      const config = yield* AppConfig

      return {
        track: (event: RybbitEvent) =>
          Effect.gen(function* () {
            const client = yield* clientIdentity
            yield* Effect.promise(() =>
              trackEvent(config.rybbit, { ...client, ...event }),
            )
          }),
      }
    }),
  },
) {
  static readonly layer = Layer.effect(Analytics, Analytics.make)

  static readonly defaultLayer = Analytics.layer.pipe(
    Layer.provide(AppConfig.layer),
  )
}
