import { Context, Effect, Layer } from "effect"

import { AppConfig } from "../../runtime/Config.js"
import { makeRateLimiter, type RateLimitResult } from "./RateLimiter.js"

const REQUEST_LIMIT = 20

export type ApiKeyRateLimiterShape = {
  readonly check: (apiKeyId: string) => Effect.Effect<RateLimitResult>
}

export class ApiKeyRateLimiter extends Context.Service<ApiKeyRateLimiter, ApiKeyRateLimiterShape>()(
  "@app/modules/rate-limit/ApiKeyRateLimiter",
  {
    make: makeRateLimiter("api-key", REQUEST_LIMIT),
  },
) {
  static readonly layer = Layer.effect(ApiKeyRateLimiter, ApiKeyRateLimiter.make)

  static readonly defaultLayer = ApiKeyRateLimiter.layer.pipe(
    Layer.provide(AppConfig.layer),
  )
}
