import { createHash } from "node:crypto"

import { Context, Effect, Layer } from "effect"

import { AppConfig } from "../../runtime/Config.js"
import { makeRateLimiter, type RateLimitResult } from "./RateLimiter.js"

// Generous relative to ApiKeyRateLimiter: this covers every session-cookie and
// OAuth-bearer request (the interactive apps), not just automation clients, so
// normal multi-screen navigation and pull-to-refresh shouldn't brush it. It
// only needs to be well below a runaway client (a retry-storm bug hit ~30-50
// req/s from one device and took the API down — see PostgresClient.ts).
const REQUEST_LIMIT = 120

export type BearerRateLimiterShape = {
  readonly check: (bearer: string) => Effect.Effect<RateLimitResult>
}

// Never key Redis (or logs) by the raw credential itself.
export const hashBearer = (bearer: string) => createHash("sha256").update(bearer).digest("hex")

export class BearerRateLimiter extends Context.Service<BearerRateLimiter, BearerRateLimiterShape>()(
  "@app/modules/rate-limit/BearerRateLimiter",
  {
    make: Effect.gen(function* () {
      const limiter = yield* makeRateLimiter("bearer", REQUEST_LIMIT)

      // The credential is hashed before it reaches the bucket, so the raw token
      // never becomes a Redis key.
      return { check: (bearer: string) => limiter.check(hashBearer(bearer)) } as const
    }),
  },
) {
  static readonly layer = Layer.effect(BearerRateLimiter, BearerRateLimiter.make)

  static readonly defaultLayer = BearerRateLimiter.layer.pipe(
    Layer.provide(AppConfig.layer),
  )
}
