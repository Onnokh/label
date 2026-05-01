import { mkdirSync } from "node:fs"
import { dirname } from "node:path"

import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3"
import { Context, Data, Effect, Layer } from "effect"

import { AppConfig } from "../../runtime/Config.js"
import { schema } from "./schema.js"

type SqliteDatabase = BetterSQLite3Database<typeof schema>

export class SqliteClientError extends Data.TaggedError("SqliteClientError")<{
  readonly operation: string
  readonly cause: unknown
}> {}

export class SqliteClient extends Context.Tag("@app/modules/persistence/SqliteClient")<
  SqliteClient,
  {
    readonly db: SqliteDatabase
  }
>() {}

export const sqliteClientLayer = Layer.scoped(
  SqliteClient,
  Effect.gen(function* () {
    const config = yield* AppConfig

    const db = yield* Effect.acquireRelease(
      Effect.try({
        try: () => {
          mkdirSync(dirname(config.sqlite.path), { recursive: true })

          return drizzle(config.sqlite.path, { schema })
        },
        catch: (cause) =>
          new SqliteClientError({
            operation: "open",
            cause,
          }),
      }),
      (db) =>
        Effect.sync(() => {
          db.$client.close()
        }),
    )

    return {
      db,
    }
  }),
)
