import { createHash } from "node:crypto"

import { createClient, type RedisClientType } from "redis"
import { Context, Data, Effect, Layer } from "effect"

import { AppConfig } from "../../runtime/Config.js"

// Generous relative to ApiKeyRateLimiter: this covers every session-cookie and
// OAuth-bearer request (the interactive apps), not just automation clients, so
// normal multi-screen navigation and pull-to-refresh shouldn't brush it. It
// only needs to be well below a runaway client (a retry-storm bug hit ~30-50
// req/s from one device and took the API down — see PostgresClient.ts).
const REQUEST_LIMIT = 120
const WINDOW_SECONDS = 60

export type RateLimitResult = {
  readonly allowed: boolean
  readonly limit: number
  readonly remaining: number
  readonly resetSeconds: number
}

export type BearerRateLimiterShape = {
  readonly check: (bearer: string) => Effect.Effect<RateLimitResult>
}

class BearerRateLimiterError extends Data.TaggedError("BearerRateLimiterError")<{
  readonly cause: unknown
}> {}

const currentMinuteBucket = () => Math.floor(Date.now() / (WINDOW_SECONDS * 1000))

// Never key Redis (or logs) by the raw credential itself.
export const hashBearer = (bearer: string) => createHash("sha256").update(bearer).digest("hex")

export class BearerRateLimiter extends Context.Service<BearerRateLimiter, BearerRateLimiterShape>()(
  "@app/modules/rate-limit/BearerRateLimiter",
  {
    make: Effect.gen(function* () {
      const config = yield* AppConfig
      const client = createClient({
        url: config.redis.url,
        socket: { connectTimeout: 500, reconnectStrategy: false },
      }) as RedisClientType
      client.on("error", () => undefined)

      const check = (bearer: string): Effect.Effect<RateLimitResult> =>
        Effect.tryPromise({
          try: async () => {
            if (!client.isOpen) {
              await client.connect()
            }

            const bucket = currentMinuteBucket()
            const key = `rate-limit:bearer:${hashBearer(bearer)}:${bucket}`
            const count = await client.incr(key)
            if (count === 1) {
              await client.expire(key, WINDOW_SECONDS)
            }

            const ttl = await client.ttl(key)
            const resetSeconds = ttl > 0 ? ttl : WINDOW_SECONDS
            const remaining = Math.max(REQUEST_LIMIT - count, 0)

            return {
              allowed: count <= REQUEST_LIMIT,
              limit: REQUEST_LIMIT,
              remaining,
              resetSeconds,
            } as const
          },
          catch: (cause) => new BearerRateLimiterError({ cause }),
        }).pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("Bearer rate limit check failed; allowing request", { cause }).pipe(
              Effect.as({
                allowed: true,
                limit: REQUEST_LIMIT,
                remaining: REQUEST_LIMIT,
                resetSeconds: WINDOW_SECONDS,
              } as const),
            ),
          ),
        )

      return { check } as const
    }),
  },
) {
  static readonly layer = Layer.effect(BearerRateLimiter, BearerRateLimiter.make)

  static readonly defaultLayer = BearerRateLimiter.layer.pipe(
    Layer.provide(AppConfig.layer),
  )
}
