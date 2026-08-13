import { createClient, type RedisClientType } from "redis"
import { Data, Effect } from "effect"

import { AppConfig } from "../../runtime/Config.js"

export type RateLimitResult = {
  readonly allowed: boolean
  readonly limit: number
  readonly remaining: number
  readonly resetSeconds: number
}

const WINDOW_SECONDS = 60

class RateLimitCheckFailed extends Data.TaggedError("RateLimitCheckFailed")<{
  readonly bucket: string
  readonly cause: unknown
}> {}

// Every rate limit in the API is the same shape: a request budget per key for
// one wall-clock minute, counted in Redis. `bucket` names one budget and
// prefixes its Redis keys, so two budgets never share a count. Each service
// gets its own client, opened on the first check.
//
// Redis is best effort here. A check that cannot reach it allows the request
// rather than closing the API behind a cache outage, so a limiter is a brake and
// never a single point of failure.
export const makeRateLimiter = (bucket: string, limit: number) =>
  Effect.gen(function* () {
    const config = yield* AppConfig
    const client = createClient({
      url: config.redis.url,
      socket: { connectTimeout: 500, reconnectStrategy: false },
    }) as RedisClientType
    client.on("error", () => undefined)

    const check = (key: string): Effect.Effect<RateLimitResult> =>
      Effect.tryPromise({
        try: async () => {
          if (!client.isOpen) await client.connect()

          const minute = Math.floor(Date.now() / (WINDOW_SECONDS * 1000))
          const countKey = `rate-limit:${bucket}:${key}:${minute}`
          const count = await client.incr(countKey)
          if (count === 1) await client.expire(countKey, WINDOW_SECONDS)

          const ttl = await client.ttl(countKey)

          return {
            allowed: count <= limit,
            limit,
            remaining: Math.max(limit - count, 0),
            resetSeconds: ttl > 0 ? ttl : WINDOW_SECONDS,
          } as const
        },
        catch: (cause) => new RateLimitCheckFailed({ bucket, cause }),
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("Rate limit check failed; allowing request", { bucket, cause }).pipe(
            Effect.as({
              allowed: true,
              limit,
              remaining: limit,
              resetSeconds: WINDOW_SECONDS,
            } as const),
          ),
        ),
      )

    return { check } as const
  })
