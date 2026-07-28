import * as PgClient from "@effect/sql-pg/PgClient"
import { drizzle as nodeDrizzle } from "drizzle-orm/node-postgres"
import { makeWithDefaults } from "drizzle-orm/effect-postgres"
import { Context, Effect, Layer } from "effect"
import { Pool } from "pg"

import { AppConfig } from "../../runtime/Config.js"
import { relations } from "./schema.js"

type MakeWithDefaultsReturn = ReturnType<typeof makeWithDefaults>
type Db = MakeWithDefaultsReturn extends Effect.Effect<infer A, any, any> ? A : never

type AuthDb = ReturnType<typeof nodeDrizzle>

class SharedPool extends Context.Service<SharedPool, Pool>()(
  "@app/modules/persistence/SharedPool",
  {
    make: Effect.gen(function* () {
      const config = yield* AppConfig
      return yield* Effect.acquireRelease(
        Effect.sync(
          () =>
            new Pool({
              connectionString: config.database.url,
              max: 10,
            }),
        ),
        (pool) => Effect.promise(() => pool.end()),
      )
    }),
  },
) {
  static readonly layer = Layer.effect(SharedPool, SharedPool.make)
}

// better-auth needs its own pool, separate from the one @effect/sql-pg's
// PgClient uses: PgClient sends a best-effort `pg_cancel_backend(pid)` when an
// Effect fiber is interrupted (e.g. a client aborting an in-flight request).
// That cancel targets a backend PID, not a specific query, so if it fires
// after the connection has already been returned to a *shared* pool and
// picked up by an unrelated query, it cancels the wrong one. Raycast's
// `useFetch` aborts in-flight requests on retry, which was canceling
// better-auth's own session lookups and taking the API down.
class AuthPool extends Context.Service<AuthPool, Pool>()(
  "@app/modules/persistence/AuthPool",
  {
    make: Effect.gen(function* () {
      const config = yield* AppConfig
      return yield* Effect.acquireRelease(
        Effect.sync(
          () =>
            new Pool({
              connectionString: config.database.url,
              max: 5,
            }),
        ),
        (pool) => Effect.promise(() => pool.end()),
      )
    }),
  },
) {
  static readonly layer = Layer.effect(AuthPool, AuthPool.make)
}

export class PostgresClient extends Context.Service<PostgresClient, {
  readonly db: Db
  readonly authDb: AuthDb
  readonly pool: Pool
}>()(
  "@app/modules/persistence/PostgresClient",
  {
    make: Effect.gen(function* () {
      const pool = yield* SharedPool
      const authPool = yield* AuthPool
      const db = yield* makeWithDefaults({
        relations,
      })
      const authDb = nodeDrizzle({ client: authPool })
      return { db, authDb, pool } as const
    }),
  },
) {
  static readonly layer = Layer.effect(PostgresClient, PostgresClient.make).pipe(
    Layer.provide(
      PgClient.layerFrom(
        Effect.gen(function* () {
          const pool = yield* SharedPool
          return yield* PgClient.fromPool({ acquire: Effect.succeed(pool) })
        }),
      ),
    ),
    Layer.provide(SharedPool.layer),
    Layer.provide(AuthPool.layer),
  )

  static readonly defaultLayer = PostgresClient.layer.pipe(
    Layer.provide(AppConfig.layer),
  )
}
