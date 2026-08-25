import { Context, Effect, Layer } from "effect"

import { AppConfig } from "../../runtime/Config.js"
import { makeRateLimiter, type RateLimitResult } from "./RateLimiter.js"

// Generous enough that a health probe, an OpenAPI fetch, and a discovery walk
// never trip it, tight enough that an unauthenticated caller cannot hammer the
// API for free.
const REQUEST_LIMIT = 120

export type AnonymousRateLimiterShape = {
  readonly check: (clientIp: string) => Effect.Effect<RateLimitResult>
}

export class AnonymousRateLimiter extends Context.Service<
  AnonymousRateLimiter,
  AnonymousRateLimiterShape
>()(
  "@app/modules/rate-limit/AnonymousRateLimiter",
  {
    make: makeRateLimiter("anonymous", REQUEST_LIMIT),
  },
) {
  static readonly layer = Layer.effect(AnonymousRateLimiter, AnonymousRateLimiter.make)

  static readonly defaultLayer = AnonymousRateLimiter.layer.pipe(
    Layer.provide(AppConfig.layer),
  )
}
