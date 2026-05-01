import { and, desc, eq, type InferInsertModel, type InferSelectModel } from "drizzle-orm"
import { Context, Effect, Layer, Option, Schema } from "effect"

import { SavedItem, type UserId } from "../../domain/SavedItem.js"
import { PostgresClient } from "../persistence/PostgresClient.js"
import { savedItemsTable } from "../persistence/schema.js"

type SavedItemRecord = InferSelectModel<typeof savedItemsTable>
type NewSavedItemInput = Pick<
  InferInsertModel<typeof savedItemsTable>,
  "userId" | "originalUrl" | "normalizedUrl" | "host" | "isRead"
>

const decodeSavedItem = Schema.decodeUnknownSync(SavedItem)

const nullsToUndefined = <T extends Record<string, unknown>>(record: T): Record<string, unknown> => {
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(record)) {
    const value = record[key]
    result[key] = value === null ? undefined : value
  }
  return result
}

export const toSavedItem = (record: SavedItemRecord): SavedItem =>
  decodeSavedItem(nullsToUndefined(record))

export class SavedItemRepository extends Context.Service<SavedItemRepository>()(
  "@app/modules/saved-items/SavedItemRepository",
  {
    make: Effect.gen(function* () {
      const { db } = yield* PostgresClient

      return {
        findById: (id: SavedItem["id"]) =>
          Effect.gen(function* () {
            const rows = yield* db
              .select()
              .from(savedItemsTable)
              .where(eq(savedItemsTable.id, id))
              .limit(1)
            const row = rows[0]

            return row ? Option.some(toSavedItem(row)) : Option.none<SavedItem>()
          }),

        findByUserAndNormalizedUrl: (userId: UserId, normalizedUrl: string) =>
          Effect.gen(function* () {
            const rows = yield* db
              .select()
              .from(savedItemsTable)
              .where(and(
                eq(savedItemsTable.userId, userId),
                eq(savedItemsTable.normalizedUrl, normalizedUrl),
              ))
              .limit(1)
            const row = rows[0]

            return row ? Option.some(toSavedItem(row)) : Option.none<SavedItem>()
          }),

        listByUser: (userId: UserId) =>
          Effect.gen(function* () {
            const rows = yield* db
              .select()
              .from(savedItemsTable)
              .where(eq(savedItemsTable.userId, userId))
              .orderBy(desc(savedItemsTable.lastSavedAt))

            return rows.map(toSavedItem)
          }),

        insert: (input: NewSavedItemInput) =>
          Effect.gen(function* () {
            const [row] = yield* db.insert(savedItemsTable).values(input).returning()

            if (!row) {
              throw new Error("SavedItem insert did not return a row.")
            }

            return toSavedItem(row)
          }),

        update: (savedItem: SavedItem) =>
          Effect.gen(function* () {
            const [row] = yield* db
              .update(savedItemsTable)
              .set({ ...savedItem })
              .where(eq(savedItemsTable.id, savedItem.id))
              .returning()

            return toSavedItem(row ?? savedItem)
          }),

        delete: (id: SavedItem["id"]) =>
          db.delete(savedItemsTable).where(eq(savedItemsTable.id, id)),
      }
    }),
  },
) {
  static readonly layer = Layer.effect(SavedItemRepository, SavedItemRepository.make)
}
