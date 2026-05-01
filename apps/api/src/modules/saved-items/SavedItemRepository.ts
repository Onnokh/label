import { eq, type InferInsertModel, type InferSelectModel } from "drizzle-orm"
import { Effect, Option } from "effect"

import { SavedItem } from "../../domain/SavedItem.js"
import { SqliteClient } from "../persistence/SqliteClient.js"
import { savedItemsTable } from "../persistence/schema.js"

type SavedItemRecord = InferSelectModel<typeof savedItemsTable>
type SavedItemUpdate = Omit<InferInsertModel<typeof savedItemsTable>, "id">
type NewSavedItemInput = Pick<
  InferInsertModel<typeof savedItemsTable>,
  "url" | "host" | "isRead"
>

const decodeCategories = (value: string): readonly string[] => {
  const parsed = JSON.parse(value)
  return Array.isArray(parsed)
    ? parsed.filter((entry): entry is string => typeof entry === "string")
    : []
}

const toSavedItem = (record: SavedItemRecord) =>
  new SavedItem({
    id: record.id,
    url: record.url,
    host: record.host,
    title: record.title ?? undefined,
    description: record.description ?? undefined,
    siteName: record.siteName ?? undefined,
    imageUrl: record.imageUrl ?? undefined,
    canonicalUrl: record.canonicalUrl ?? undefined,
    summary: record.summary ?? undefined,
    extractedContent: record.extractedContent ?? undefined,
    excerpt: record.excerpt ?? undefined,
    wordCount: record.wordCount ?? undefined,
    extractedAt: record.extractedAt ?? undefined,
    categories: decodeCategories(record.categoriesJson),
    isRead: record.isRead,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  })

const toSavedItemUpdate = (savedItem: SavedItem): SavedItemUpdate => ({
  url: savedItem.url,
  host: savedItem.host,
  title: savedItem.title,
  description: savedItem.description,
  siteName: savedItem.siteName,
  imageUrl: savedItem.imageUrl,
  canonicalUrl: savedItem.canonicalUrl,
  summary: savedItem.summary,
  extractedContent: savedItem.extractedContent,
  excerpt: savedItem.excerpt,
  wordCount: savedItem.wordCount,
  extractedAt: savedItem.extractedAt,
  categoriesJson: JSON.stringify(savedItem.categories),
  isRead: savedItem.isRead,
  createdAt: savedItem.createdAt,
  updatedAt: savedItem.updatedAt,
})

export class SavedItemRepository extends Effect.Service<SavedItemRepository>()(
  "@app/modules/saved-items/SavedItemRepository",
  {
    effect: Effect.gen(function* () {
      const { db } = yield* SqliteClient

      return {
        findById: (id: SavedItem["id"]) =>
          Effect.sync(() => {
            const row = db.query.savedItemsTable.findFirst({
              where: eq(savedItemsTable.id, id),
            }).sync()

            return Option.map(Option.fromNullable(row), toSavedItem)
          }),

        findByUrl: (url: string) =>
          Effect.sync(() => {
            const row = db.query.savedItemsTable.findFirst({
              where: eq(savedItemsTable.url, url),
            }).sync()

            return Option.map(Option.fromNullable(row), toSavedItem)
          }),

        insert: (input: NewSavedItemInput) =>
          Effect.sync(() => {
            const row = db.insert(savedItemsTable).values(input).returning().get()

            return toSavedItem(row)
          }),

        update: (savedItem: SavedItem) =>
          Effect.sync(() => {
            db
              .update(savedItemsTable)
              .set(toSavedItemUpdate(savedItem))
              .where(eq(savedItemsTable.id, savedItem.id))
              .run()

            return savedItem
          }),
      }
    }),
  },
) {}

export const SavedItemRepositoryLayer = SavedItemRepository.Default
