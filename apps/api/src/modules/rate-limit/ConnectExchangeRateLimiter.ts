import { createClient, type RedisClientType } from "redis"
import { Context, Data, Effect, Layer } from "effect"

import { AppConfig } from "../../runtime/Config.js"

const REQUEST_LIMIT = 10
const WINDOW_SECONDS = 60

export type RateLimitResult = {
  readonly allowed: boolean
  readonly limit: number
  readonly remaining: number
  readonly resetSeconds: number
}

class ConnectExchangeRateLimiterError extends Data.TaggedError("ConnectExchangeRateLimiterError")<{
  readonly cause: unknown
}> {}

const currentMinuteBucket = () => Math.floor(Date.now() / (WINDOW_SECONDS * 1000))

export class ConnectExchangeRateLimiter extends Context.Service<ConnectExchangeRateLimiter, {
  readonly check: (ip: string) => Effect.Effect<RateLimitResult>
}>()(
  "@app/modules/rate-limit/ConnectExchangeRateLimiter",
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
            const key = `rate-limit:connect-exchange:${ip}:${bucket}`
            const count = await client.incr(key)
            if (count === 1) await client.expire(key, WINDOW_SECONDS)

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
          catch: (cause) => new ConnectExchangeRateLimiterError({ cause }),
        }).pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("Connect exchange rate limit check failed; allowing request", { cause }).pipe(
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
  static readonly layer = Layer.effect(ConnectExchangeRateLimiter, ConnectExchangeRateLimiter.make)

  static readonly defaultLayer = ConnectExchangeRateLimiter.layer.pipe(
    Layer.provide(AppConfig.layer),
  )
}
