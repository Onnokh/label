import { Context, Effect, Layer } from "effect"

import { AppConfig } from "../../runtime/Config.js"
import { makeRateLimiter, type RateLimitResult } from "./RateLimiter.js"

const REQUEST_LIMIT = 10

export class ConnectExchangeRateLimiter extends Context.Service<ConnectExchangeRateLimiter, {
  readonly check: (ip: string) => Effect.Effect<RateLimitResult>
}>()(
  "@app/modules/rate-limit/ConnectExchangeRateLimiter",
  {
    make: makeRateLimiter("connect-exchange", REQUEST_LIMIT),
  },
) {
  static readonly layer = Layer.effect(ConnectExchangeRateLimiter, ConnectExchangeRateLimiter.make)

  static readonly defaultLayer = ConnectExchangeRateLimiter.layer.pipe(
    Layer.provide(AppConfig.layer),
  )
}
