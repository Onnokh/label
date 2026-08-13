import { Context, Effect, Layer } from "effect"

import { AppConfig } from "../../runtime/Config.js"
import { makeRateLimiter, type RateLimitResult } from "./RateLimiter.js"

// The public group carries no API Key, so the 20-per-minute API Key Rate Limit
// cannot apply and the address is the only bucket left. One Public Profile page
// view fans out to several endpoints in this group, so one page view must stay
// well inside the budget. This single number covers the whole group.
export const PUBLIC_PROFILE_REQUEST_LIMIT = 60

export type PublicProfileRateLimiterShape = {
  readonly check: (ip: string) => Effect.Effect<RateLimitResult>
}

export class PublicProfileRateLimiter extends Context.Service<
  PublicProfileRateLimiter,
  PublicProfileRateLimiterShape
>()(
  "@app/modules/rate-limit/PublicProfileRateLimiter",
  {
    make: makeRateLimiter("public-profile", PUBLIC_PROFILE_REQUEST_LIMIT),
  },
) {
  static readonly layer = Layer.effect(PublicProfileRateLimiter, PublicProfileRateLimiter.make)

  static readonly defaultLayer = PublicProfileRateLimiter.layer.pipe(
    Layer.provide(AppConfig.layer),
  )
}
