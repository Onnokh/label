import { and, asc, desc, eq, isNull, type InferSelectModel, type SQL } from "drizzle-orm"
import { Context, Effect, Layer, Option, Schema } from "effect"

import {
  SavedItem,
  Source,
  Folder,
  Link,
  LinkEnrichment,
  LinkMetadata,
  type SavedItemWithLink,
  type UserId,
  type LinkId,
  type FolderId,
} from "../../domain/SavedItem.js"
import { PostgresClient } from "../persistence/PostgresClient.js"
import {
  linkEnrichmentTable,
  linkMetadataTable,
  linksTable,
  savedItemsTable,
  sourcesTable,
  foldersTable,
} from "../persistence/schema.js"

export type SavedItemRecord = InferSelectModel<typeof savedItemsTable>
export type LinkRecord = InferSelectModel<typeof linksTable>
export type LinkMetadataRecord = InferSelectModel<typeof linkMetadataTable>
export type LinkEnrichmentRecord = InferSelectModel<typeof linkEnrichmentTable>
export type SourceRecord = InferSelectModel<typeof sourcesTable>
export type FolderRecord = InferSelectModel<typeof foldersTable>

export type SavedItemSort = "newest" | "oldest" | "title" | "unread"

const decodeSavedItem = Schema.decodeUnknownSync(SavedItem)
const decodeLink = Schema.decodeUnknownSync(Link)
const decodeLinkMetadata = Schema.decodeUnknownSync(LinkMetadata)
const decodeLinkEnrichment = Schema.decodeUnknownSync(LinkEnrichment)
const decodeSource = Schema.decodeUnknownSync(Source)
const decodeFolder = Schema.decodeUnknownSync(Folder)

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

export const toLink = (record: LinkRecord): Link =>
  decodeLink(nullsToUndefined(record))

export const toLinkMetadata = (record: LinkMetadataRecord): LinkMetadata =>
  decodeLinkMetadata(nullsToUndefined(record))

export const toLinkEnrichment = (record: LinkEnrichmentRecord): LinkEnrichment =>
  decodeLinkEnrichment(nullsToUndefined(record))

export const toSource = (record: SourceRecord): Source =>
  decodeSource(nullsToUndefined(record))

export const toFolder = (record: FolderRecord): Folder => decodeFolder(record)

export const toSavedItemWithLink = (
  savedItem: SavedItemRecord,
  link: LinkRecord,
  metadata: LinkMetadataRecord,
  enrichment: LinkEnrichmentRecord,
  source?: SourceRecord | null,
  folder?: FolderRecord | null,
): SavedItemWithLink => ({
  savedItem: toSavedItem(savedItem),
  link: toLink(link),
  metadata: toLinkMetadata(metadata),
  enrichment: toLinkEnrichment(enrichment),
  ...(source?.id ? { source: toSource(source) } : {}),
  ...(folder?.id ? { folder: toFolder(folder) } : {}),
})

export class SavedItemRepository extends Context.Service<SavedItemRepository>()(
  "@app/modules/saved-items/SavedItemRepository",
  {
    make: Effect.gen(function* () {
      const { db } = yield* PostgresClient

      const selectSavedItemWithLink = (filter: SQL | undefined) =>
        db
          .select({
            savedItem: savedItemsTable,
            link: linksTable,
            metadata: linkMetadataTable,
            enrichment: linkEnrichmentTable,
            source: sourcesTable,
            folder: foldersTable,
          })
          .from(savedItemsTable)
          .innerJoin(linksTable, eq(savedItemsTable.linkId, linksTable.id))
          .innerJoin(linkMetadataTable, eq(linksTable.id, linkMetadataTable.linkId))
          .innerJoin(linkEnrichmentTable, eq(linksTable.id, linkEnrichmentTable.linkId))
          .leftJoin(sourcesTable, eq(savedItemsTable.sourceId, sourcesTable.id))
          .leftJoin(foldersTable, eq(savedItemsTable.folderId, foldersTable.id))
          .where(filter)

      const selectLinkWithCompanions = (linkId: LinkId) =>
        db
          .select({
            link: linksTable,
            metadata: linkMetadataTable,
            enrichment: linkEnrichmentTable,
          })
          .from(linksTable)
          .innerJoin(linkMetadataTable, eq(linksTable.id, linkMetadataTable.linkId))
          .innerJoin(linkEnrichmentTable, eq(linksTable.id, linkEnrichmentTable.linkId))
          .where(eq(linksTable.id, linkId))
          .limit(1)

      const toAggregate = (row: {
        savedItem: SavedItemRecord
        link: LinkRecord
        metadata: LinkMetadataRecord
        enrichment: LinkEnrichmentRecord
        source: SourceRecord | null
        folder: FolderRecord | null
      }) => toSavedItemWithLink(row.savedItem, row.link, row.metadata, row.enrichment, row.source, row.folder)

      const orderByForSort = (sort: SavedItemSort = "newest") => {
        switch (sort) {
          case "oldest":
            return [asc(savedItemsTable.lastSavedAt), asc(savedItemsTable.id)]
          case "title":
            return [asc(linkMetadataTable.title), desc(savedItemsTable.lastSavedAt), desc(savedItemsTable.id)]
          case "unread":
            return [asc(savedItemsTable.isRead), desc(savedItemsTable.lastSavedAt), desc(savedItemsTable.id)]
          case "newest":
            return [desc(savedItemsTable.lastSavedAt), desc(savedItemsTable.id)]
        }
      }

      return {
        findByUserAndId: Effect.fn("SavedItemRepository.findByUserAndId")(function* (userId: UserId, id: SavedItem["id"]) {
          const rows = yield* selectSavedItemWithLink(
            and(eq(savedItemsTable.userId, userId), eq(savedItemsTable.id, id)),
          ).limit(1)

          return rows[0]
            ? Option.some(toAggregate(rows[0]))
            : Option.none<SavedItemWithLink>()
        }),

        listByUser: Effect.fn("SavedItemRepository.listByUser")(function* (userId: UserId, sort: SavedItemSort = "newest", folderId?: FolderId | null) {
          const rows = yield* selectSavedItemWithLink(
            folderId === undefined
              ? eq(savedItemsTable.userId, userId)
              : and(
                  eq(savedItemsTable.userId, userId),
                  folderId === null
                    ? isNull(savedItemsTable.folderId)
                    : eq(savedItemsTable.folderId, folderId),
                ),
          ).orderBy(...orderByForSort(sort))

          return rows.map(toAggregate)
        }),

        setReadState: Effect.fn("SavedItemRepository.setReadState")(function* (id: SavedItem["id"], isRead: boolean) {
          const [row] = yield* db
            .update(savedItemsTable)
            .set({ isRead, updatedAt: new Date() })
            .where(eq(savedItemsTable.id, id))
            .returning()

          if (!row) {
            return Option.none<SavedItemWithLink>()
          }

          const linkRows = yield* selectLinkWithCompanions(row.linkId)
          const joined = linkRows[0]

          if (!joined) {
            return Option.none<SavedItemWithLink>()
          }

          const sourceRow = row.sourceId
            ? (yield* db.select().from(sourcesTable).where(eq(sourcesTable.id, row.sourceId)).limit(1))[0] ?? null
            : null

          const folderRow = row.folderId
            ? (yield* db.select().from(foldersTable).where(eq(foldersTable.id, row.folderId)).limit(1))[0] ?? null
            : null

          return Option.some(toSavedItemWithLink(row, joined.link, joined.metadata, joined.enrichment, sourceRow, folderRow))
        }),

        setFolder: Effect.fn("SavedItemRepository.setFolder")(function* (userId: UserId, id: SavedItem["id"], folderId: FolderId | null) {
          const [row] = yield* db
            .update(savedItemsTable)
            .set({ folderId, updatedAt: new Date() })
            .where(and(eq(savedItemsTable.userId, userId), eq(savedItemsTable.id, id)))
            .returning()

          if (!row) return Option.none<SavedItemWithLink>()

          const rows = yield* selectSavedItemWithLink(
            and(eq(savedItemsTable.userId, userId), eq(savedItemsTable.id, id)),
          ).limit(1)
          return rows[0] ? Option.some(toAggregate(rows[0])) : Option.none<SavedItemWithLink>()
        }),

        deleteByUserAndId: Effect.fn("SavedItemRepository.deleteByUserAndId")(function* (userId: UserId, id: SavedItem["id"]) {
          return yield* db.delete(savedItemsTable).where(and(
            eq(savedItemsTable.userId, userId),
            eq(savedItemsTable.id, id),
          ))
        }),
      }
    }),
  },
) {
  static readonly layer = Layer.effect(SavedItemRepository, SavedItemRepository.make)

  static readonly defaultLayer = SavedItemRepository.layer.pipe(
    Layer.provide(PostgresClient.defaultLayer),
  )
}
