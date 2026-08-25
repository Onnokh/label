import { createClient, type RedisClientType } from "redis"
import { Context, Data, Effect, Layer } from "effect"

import { AppConfig } from "../../runtime/Config.js"

/** How long a recorded response stays replayable. */
const RETENTION_SECONDS = 24 * 60 * 60

/**
 * How long a claim may stay in flight before another attempt may take it over.
 * Long enough to cover a slow capture (which fetches Link Metadata), short
 * enough that a crashed request does not lock its key out for the full day.
 */
const CLAIM_SECONDS = 60

export type RecordedResponse = {
  readonly status: number
  readonly headers: Readonly<Record<string, string>>
  readonly body: string
}

export type ClaimOutcome =
  /** This request owns the key and should do the work. */
  | { readonly _tag: "Claimed" }
  /** An earlier request with this key finished; replay what it answered. */
  | { readonly _tag: "Replay"; readonly response: RecordedResponse }
  /** An earlier request with this key is still running. */
  | { readonly _tag: "InFlight" }
  /**
   * The store could not be reached. The caller proceeds without idempotency
   * rather than refusing the write, matching how the rate limiters treat Redis.
   */
  | { readonly _tag: "Unavailable" }

class IdempotencyStoreFailed extends Data.TaggedError("IdempotencyStoreFailed")<{
  readonly operation: string
  readonly cause: unknown
}> {}

const IN_FLIGHT = "in-flight"

export type IdempotencyStoreShape = {
  /**
   * Claim `key` for this request, or report what the key already holds.
   *
   * The claim is a single `SET NX`, so two concurrent requests carrying the
   * same key cannot both be told to do the work.
   */
  readonly claim: (key: string) => Effect.Effect<ClaimOutcome>
  /** Record the response this request produced, so a retry can replay it. */
  readonly record: (key: string, response: RecordedResponse) => Effect.Effect<void>
  /**
   * Give the key back without recording anything, so the caller may try again.
   * Used when the request failed in a way that is worth retrying.
   */
  readonly release: (key: string) => Effect.Effect<void>
}

export const makeIdempotencyStore = Effect.gen(function* () {
  const config = yield* AppConfig
  const client = createClient({
    url: config.redis.url,
    socket: { connectTimeout: 500, reconnectStrategy: false },
  }) as RedisClientType
  client.on("error", () => undefined)

  const connected = async () => {
    if (!client.isOpen) await client.connect()
    return client
  }

  const claim = (key: string): Effect.Effect<ClaimOutcome> =>
    Effect.tryPromise({
      try: async (): Promise<ClaimOutcome> => {
        const redis = await connected()
        const claimed = await redis.set(key, IN_FLIGHT, {
          NX: true,
          EX: CLAIM_SECONDS,
        })
        if (claimed === "OK") return { _tag: "Claimed" }

        const existing = await redis.get(key)
        if (existing === null) {
          // The key expired between the SET and the GET. Treat that as a free
          // key rather than as a phantom in-flight request.
          return { _tag: "Claimed" }
        }
        if (existing === IN_FLIGHT) return { _tag: "InFlight" }

        return { _tag: "Replay", response: JSON.parse(existing) as RecordedResponse }
      },
      catch: (cause) => new IdempotencyStoreFailed({ operation: "claim", cause }),
    }).pipe(
      Effect.catchCause((cause) =>
        Effect.logWarning("Idempotency claim failed; proceeding without replay protection", { cause })
          .pipe(Effect.as({ _tag: "Unavailable" } as const)),
      ),
    )

  const record = (key: string, response: RecordedResponse): Effect.Effect<void> =>
    Effect.tryPromise({
      try: async () => {
        const redis = await connected()
        await redis.set(key, JSON.stringify(response), { EX: RETENTION_SECONDS })
      },
      catch: (cause) => new IdempotencyStoreFailed({ operation: "record", cause }),
    }).pipe(
      Effect.catchCause((cause) =>
        Effect.logWarning("Idempotency record failed; a retry will re-run the request", { cause }),
      ),
      Effect.asVoid,
    )

  const release = (key: string): Effect.Effect<void> =>
    Effect.tryPromise({
      try: async () => {
        const redis = await connected()
        await redis.del(key)
      },
      catch: (cause) => new IdempotencyStoreFailed({ operation: "release", cause }),
    }).pipe(
      Effect.catchCause((cause) => Effect.logWarning("Idempotency release failed", { cause })),
      Effect.asVoid,
    )

  return { claim, record, release } as const
})

export class IdempotencyStore extends Context.Service<IdempotencyStore, IdempotencyStoreShape>()(
  "@app/modules/idempotency/IdempotencyStore",
  {
    make: makeIdempotencyStore,
  },
) {
  static readonly layer = Layer.effect(IdempotencyStore, IdempotencyStore.make)

  static readonly defaultLayer = IdempotencyStore.layer.pipe(
    Layer.provide(AppConfig.layer),
  )
}
