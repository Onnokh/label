import * as PgClient from "@effect/sql-pg/PgClient"
import { makeWithDefaults } from "drizzle-orm/effect-postgres"
import { Context, Effect, Layer, Redacted } from "effect"

import { AppConfig } from "../../runtime/Config.js"

type MakeWithDefaultsReturn = ReturnType<typeof makeWithDefaults>
type Db = MakeWithDefaultsReturn extends Effect.Effect<infer A, any, any> ? A : never

export class PostgresClient extends Context.Service<PostgresClient, {
  readonly db: Db
}>()(
  "@app/modules/persistence/PostgresClient",
  {
    make: Effect.gen(function* () {
      const db = yield* makeWithDefaults()
      return { db } as const
    }),
  },
) {
  static readonly pgLayer = Layer.unwrap(
    Effect.gen(function* () {
      const config = yield* AppConfig
      return PgClient.layer({
        url: Redacted.make(config.database.url),
        maxConnections: 5,
      })
    }),
  )

  static readonly layer = Layer.effect(PostgresClient, PostgresClient.make).pipe(
    Layer.provide(PostgresClient.pgLayer),
  )
}
