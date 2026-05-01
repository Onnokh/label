import * as PgClient from "@effect/sql-pg/PgClient"
import { drizzle as nodeDrizzle } from "drizzle-orm/node-postgres"
import { makeWithDefaults } from "drizzle-orm/effect-postgres"
import { Context, Effect, Layer } from "effect"
import { Pool } from "pg"

import { AppConfig } from "../../runtime/Config.js"

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

export class PostgresClient extends Context.Service<PostgresClient, {
  readonly db: Db
  readonly authDb: AuthDb
  readonly pool: Pool
}>()(
  "@app/modules/persistence/PostgresClient",
  {
    make: Effect.gen(function* () {
      const pool = yield* SharedPool
      const db = yield* makeWithDefaults()
      const authDb = nodeDrizzle({ client: pool })
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
  )
}
