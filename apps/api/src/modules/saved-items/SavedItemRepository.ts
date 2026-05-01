import { and, desc, eq, type InferInsertModel, type InferSelectModel } from "drizzle-orm"
import { Context, Effect, Layer, Option } from "effect"

import { SavedItem, type UserId } from "../../domain/SavedItem.js"
import { PostgresClient } from "../persistence/PostgresClient.js"
import { savedItemsTable } from "../persistence/schema.js"

type SavedItemRecord = InferSelectModel<typeof savedItemsTable>
type NewSavedItemInput = Pick<
  InferInsertModel<typeof savedItemsTable>,
  "userId" | "originalUrl" | "normalizedUrl" | "host" | "isRead"
>

export const toSavedItem = (record: SavedItemRecord) =>
  new SavedItem({
    id: record.id,
    userId: record.userId,
    originalUrl: record.originalUrl,
    normalizedUrl: record.normalizedUrl,
    host: record.host,
    title: record.title ?? undefined,
    description: record.description ?? undefined,
    siteName: record.siteName ?? undefined,
    imageUrl: record.imageUrl ?? undefined,
    canonicalUrl: record.canonicalUrl ?? undefined,
    previewSummary: record.previewSummary ?? undefined,
    generatedType: record.generatedType ?? undefined,
    generatedTopics: record.generatedTopics,
    enrichmentStatus: record.enrichmentStatus,
    isRead: record.isRead,
    lastSavedAt: record.lastSavedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  })

const toSavedItemUpdate = (savedItem: SavedItem): Partial<InferInsertModel<typeof savedItemsTable>> => ({
  userId: savedItem.userId,
  originalUrl: savedItem.originalUrl,
  normalizedUrl: savedItem.normalizedUrl,
  host: savedItem.host,
  title: savedItem.title,
  description: savedItem.description,
  siteName: savedItem.siteName,
  imageUrl: savedItem.imageUrl,
  canonicalUrl: savedItem.canonicalUrl,
  previewSummary: savedItem.previewSummary,
  generatedType: savedItem.generatedType,
  generatedTopics: savedItem.generatedTopics,
  enrichmentStatus: savedItem.enrichmentStatus,
  isRead: savedItem.isRead,
  lastSavedAt: savedItem.lastSavedAt,
  createdAt: savedItem.createdAt,
  updatedAt: savedItem.updatedAt,
})

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
              .set(toSavedItemUpdate(savedItem))
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
