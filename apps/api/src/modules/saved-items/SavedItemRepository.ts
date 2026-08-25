import { and, asc, desc, eq, gt, inArray, isNull, lt, or, sql, type InferSelectModel, type SQL } from "drizzle-orm"
import { Context, Effect, Layer, Option, Schema } from "effect"

import {
  SavedItem,
  Source,
  Folder,
  Link,
  LinkEnrichment,
  LinkMetadata,
  type SavedItemWithLink,
  type SavedItemId,
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

export type SavedItemsPageCursor = {
  readonly lastSavedAt: Date
  readonly id: SavedItemId
  /**
   * The leading sort key of the row this cursor points at, for the sorts that
   * have one: the Link title for `title`, the read flag for `unread`. Absent
   * for `newest` and `oldest`, whose whole key is `(lastSavedAt, id)`.
   *
   * Without it a cursor is only correct for a time-ordered list, and paging a
   * title-sorted list would skip and repeat rows.
   */
  readonly title?: string | null
  readonly isRead?: boolean
}

export type SavedItemsPage = {
  readonly items: ReadonlyArray<SavedItemWithLink>
  readonly nextCursor: SavedItemsPageCursor | null
}

/**
 * The rows that come strictly after `cursor` in `sort`'s ordering.
 *
 * A keyset page is "every row whose ordering key sorts after this one", which
 * for a compound key is a lexicographic comparison: the leading column is past
 * the cursor's, or it ties and the next column is past, and so on. `(lastSavedAt,
 * id)` is the tail of every ordering here, and `id` is unique, so the key is
 * total and no row can be skipped or repeated between pages.
 */
const rowsAfter = (sort: SavedItemSort, cursor: SavedItemsPageCursor): SQL => {
  const afterTime = sort === "oldest"
    ? or(
        gt(savedItemsTable.lastSavedAt, cursor.lastSavedAt),
        and(eq(savedItemsTable.lastSavedAt, cursor.lastSavedAt), gt(savedItemsTable.id, cursor.id)),
      )!
    : or(
        lt(savedItemsTable.lastSavedAt, cursor.lastSavedAt),
        and(eq(savedItemsTable.lastSavedAt, cursor.lastSavedAt), lt(savedItemsTable.id, cursor.id)),
      )!

  switch (sort) {
    case "newest":
    case "oldest":
      return afterTime

    case "title": {
      // Title is nullable and sorts ascending. Postgres orders NULLs last for
      // ASC, so a row with a title is always before one without, and two
      // untitled rows fall back to the time key.
      const title = cursor.title ?? null
      return title === null
        ? and(isNull(linkMetadataTable.title), afterTime)!
        : or(
            sql`${linkMetadataTable.title} > ${title}`,
            isNull(linkMetadataTable.title),
            and(eq(linkMetadataTable.title, title), afterTime),
          )!
    }

    case "unread": {
      // Unread first: `isRead` ascending, so false precedes true.
      const isRead = cursor.isRead ?? false
      return isRead
        ? and(eq(savedItemsTable.isRead, true), afterTime)!
        : or(
            eq(savedItemsTable.isRead, true),
            and(eq(savedItemsTable.isRead, false), afterTime),
          )!
    }
  }
}

/** The cursor pointing at `row`, carrying whichever leading key `sort` uses. */
const cursorForRow = (
  sort: SavedItemSort,
  row: { readonly savedItem: SavedItemRecord; readonly metadata: LinkMetadataRecord | null },
): SavedItemsPageCursor => ({
  lastSavedAt: row.savedItem.lastSavedAt,
  id: row.savedItem.id as SavedItemId,
  ...(sort === "title" ? { title: row.metadata?.title ?? null } : {}),
  ...(sort === "unread" ? { isRead: row.savedItem.isRead } : {}),
})

/**
 * The opaque page token a client passes back.
 *
 * Base64url over JSON, so a cursor survives a query string and carries no
 * meaning a caller should read or construct. It lives here rather than beside
 * either caller because the shape it encodes is this module's, and the REST
 * list endpoint and the MCP `list_saved_items` tool must agree on it.
 */
const SavedItemsCursorCodec = Schema.StringFromBase64Url.pipe(
  Schema.decodeTo(
    Schema.fromJsonString(
      Schema.Struct({
        lastSavedAt: Schema.DateFromString.check(Schema.isDateValid()),
        id: Schema.String,
        title: Schema.optional(Schema.NullOr(Schema.String)),
        isRead: Schema.optional(Schema.Boolean),
      }),
    ),
  ),
)

export const encodeSavedItemsCursor = (cursor: SavedItemsPageCursor): string =>
  Schema.encodeSync(SavedItemsCursorCodec)({
    lastSavedAt: cursor.lastSavedAt,
    id: cursor.id,
    ...(cursor.title !== undefined ? { title: cursor.title } : {}),
    ...(cursor.isRead !== undefined ? { isRead: cursor.isRead } : {}),
  })

export const decodeSavedItemsCursor = (value: string): Option.Option<SavedItemsPageCursor> =>
  Option.map(
    Schema.decodeUnknownOption(SavedItemsCursorCodec)(value),
    (decoded) => ({
      lastSavedAt: decoded.lastSavedAt,
      id: decoded.id as SavedItemId,
      ...(decoded.title !== undefined ? { title: decoded.title } : {}),
      ...(decoded.isRead !== undefined ? { isRead: decoded.isRead } : {}),
    }),
  )

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

        listPageByUser: Effect.fn("SavedItemRepository.listPageByUser")(function* (
          userId: UserId,
          limit: number,
          cursor?: SavedItemsPageCursor,
          sort: SavedItemSort = "newest",
          folderId?: FolderId | null,
        ) {
          const filters: SQL[] = [eq(savedItemsTable.userId, userId)]
          if (folderId === null) {
            filters.push(isNull(savedItemsTable.folderId))
          } else if (folderId !== undefined) {
            filters.push(eq(savedItemsTable.folderId, folderId))
          }
          const cursorFilter = cursor ? rowsAfter(sort, cursor) : undefined
          if (cursorFilter) filters.push(cursorFilter)

          const rows = yield* selectSavedItemWithLink(and(...filters)!)
            .orderBy(...orderByForSort(sort))
            .limit(limit + 1)

          const pageRows = rows.slice(0, limit)
          const lastRow = pageRows.at(-1)
          return {
            items: pageRows.map(toAggregate),
            nextCursor: rows.length > limit && lastRow
              ? cursorForRow(sort, lastRow)
              : null,
          }
        }),

        setReadState: Effect.fn("SavedItemRepository.setReadState")(function* (userId: UserId, id: SavedItem["id"], isRead: boolean) {
          const [row] = yield* db
            .update(savedItemsTable)
            .set({ isRead, updatedAt: new Date() })
            .where(and(eq(savedItemsTable.userId, userId), eq(savedItemsTable.id, id)))
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

        moveItemsToSource: Effect.fn("SavedItemRepository.moveItemsToSource")(function* (
          userId: UserId,
          itemIds: ReadonlyArray<SavedItem["id"]>,
          sourceName: string,
        ) {
          const name = sourceName.trim()
          if (name.length === 0 || itemIds.length === 0) return

          // Find-or-create the destination source, mirroring capture's upsert.
          yield* db.insert(sourcesTable).values({ userId, name }).onConflictDoNothing()
          const [source] = yield* db
            .select()
            .from(sourcesTable)
            .where(and(eq(sourcesTable.userId, userId), eq(sourcesTable.name, name)))
            .limit(1)
          if (!source) return

          yield* db
            .update(savedItemsTable)
            .set({ sourceId: source.id, updatedAt: new Date() })
            .where(and(eq(savedItemsTable.userId, userId), inArray(savedItemsTable.id, [...itemIds])))
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
