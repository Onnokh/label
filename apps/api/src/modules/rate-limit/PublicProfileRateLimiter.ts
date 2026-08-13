import { createClient, type RedisClientType } from "redis"
import { Context, Data, Effect, Layer } from "effect"

import { AppConfig } from "../../runtime/Config.js"
import type { RateLimitResult } from "./ApiKeyRateLimiter.js"

// The public group carries no API Key, so the 20-per-minute API Key Rate Limit
// cannot apply and the address is the only bucket left. One Public Profile page
// view fans out to several endpoints in this group, so one page view must stay
// well inside the budget. This single number covers the whole group.
export const PUBLIC_PROFILE_REQUEST_LIMIT = 60
const WINDOW_SECONDS = 60

export type PublicProfileRateLimiterShape = {
  readonly check: (ip: string) => Effect.Effect<RateLimitResult>
}

class PublicProfileRateLimiterError extends Data.TaggedError("PublicProfileRateLimiterError")<{
  readonly cause: unknown
}> {}

const currentMinuteBucket = () => Math.floor(Date.now() / (WINDOW_SECONDS * 1000))

export class PublicProfileRateLimiter extends Context.Service<
  PublicProfileRateLimiter,
  PublicProfileRateLimiterShape
>()(
  "@app/modules/rate-limit/PublicProfileRateLimiter",
  {
    make: Effect.gen(function* () {
      const config = yield* AppConfig
      const client = createClient({
        url: config.redis.url,
        socket: { connectTimeout: 500, reconnectStrategy: false },
      }) as RedisClientType
      client.on("error", () => undefined)

      const check = (ip: string): Effect.Effect<RateLimitResult> =>
        Effect.tryPromise({
          try: async () => {
            if (!client.isOpen) await client.connect()

            const bucket = currentMinuteBucket()
            const key = `rate-limit:public-profile:${ip}:${bucket}`
            const count = await client.incr(key)
            if (count === 1) await client.expire(key, WINDOW_SECONDS)

            const ttl = await client.ttl(key)
            const resetSeconds = ttl > 0 ? ttl : WINDOW_SECONDS
            const remaining = Math.max(PUBLIC_PROFILE_REQUEST_LIMIT - count, 0)

            return {
              allowed: count <= PUBLIC_PROFILE_REQUEST_LIMIT,
              limit: PUBLIC_PROFILE_REQUEST_LIMIT,
              remaining,
              resetSeconds,
            } as const
          },
          catch: (cause) => new PublicProfileRateLimiterError({ cause }),
        }).pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("Public profile rate limit check failed; allowing request", { cause }).pipe(
              Effect.as({
                allowed: true,
                limit: PUBLIC_PROFILE_REQUEST_LIMIT,
                remaining: PUBLIC_PROFILE_REQUEST_LIMIT,
                resetSeconds: WINDOW_SECONDS,
              } as const),
            ),
          ),
        )

      return { check } as const
    }),
  },
) {
  static readonly layer = Layer.effect(PublicProfileRateLimiter, PublicProfileRateLimiter.make)

  static readonly defaultLayer = PublicProfileRateLimiter.layer.pipe(
    Layer.provide(AppConfig.layer),
  )
}
