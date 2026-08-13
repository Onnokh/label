import { Context, Effect, Layer } from "effect"

import { AppConfig } from "../../runtime/Config.js"
import { makeRateLimiter, type RateLimitResult } from "./RateLimiter.js"

const REQUEST_LIMIT = 30

export class ConnectAuthorizeRateLimiter extends Context.Service<ConnectAuthorizeRateLimiter, {
  readonly check: (userId: string) => Effect.Effect<RateLimitResult>
}>()(
  "@app/modules/rate-limit/ConnectAuthorizeRateLimiter",
  {
    make: makeRateLimiter("connect-authorize", REQUEST_LIMIT),
  },
) {
  static readonly layer = Layer.effect(ConnectAuthorizeRateLimiter, ConnectAuthorizeRateLimiter.make)

  static readonly defaultLayer = ConnectAuthorizeRateLimiter.layer.pipe(
    Layer.provide(AppConfig.layer),
  )
}
