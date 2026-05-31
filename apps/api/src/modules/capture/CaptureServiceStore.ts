import { and, eq, type InferSelectModel } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

import type {
  CaptureChannel,
  FolderId,
  LinkId,
  LinkType,
  SavedItemWithLink,
  SourceId,
  Topic,
  UserId,
} from "../../domain/SavedItem.js"
import { FolderReferenceNotFound } from "../folders/FolderReferenceError.js"
import { PostgresClient } from "../persistence/PostgresClient.js"
import {
  foldersTable,
  linkEnrichmentTable,
  linkMetadataTable,
  linksTable,
  savedItemsTable,
  sourcesTable,
} from "../persistence/schema.js"
import { toSavedItemWithLink } from "../saved-items/SavedItemRepository.js"

type LinkMetadataRecord = InferSelectModel<typeof linkMetadataTable>
type LinkEnrichmentRecord = InferSelectModel<typeof linkEnrichmentTable>

export type NormalizedCaptureUrl = {
  readonly originalUrl: string
  readonly normalizedUrl: string
  readonly host: string
  readonly type: LinkType
}

export type SaveCaptureCommand = {
  readonly userId: UserId
  readonly url: NormalizedCaptureUrl
  readonly sourceName?: string
  readonly captureChannel?: CaptureChannel
  readonly tags?: readonly Topic[]
  readonly folderId?: FolderId | null
}

export type CaptureResult = {
  readonly savedItem: SavedItemWithLink
  readonly captureResult: "created" | "updated"
  readonly enrichment:
    | { readonly _tag: "start"; readonly linkId: LinkId }
    | { readonly _tag: "skip"; readonly reason: "policy" | "already-enriched" }
}

export class CaptureServiceStore extends Context.Service<CaptureServiceStore>()(
  "@app/modules/capture/CaptureServiceStore",
  {
    make: Effect.gen(function* () {
      const { db } = yield* PostgresClient

      return {
        save: Effect.fn("CaptureServiceStore.save")(function* (input: SaveCaptureCommand) {
          return yield* db.transaction((tx) =>
            Effect.gen(function* () {
              let sourceId: SourceId | undefined
              let sourceRecord: InferSelectModel<typeof sourcesTable> | undefined
              let folderId: FolderId | null = null
              let folderRecord: InferSelectModel<typeof foldersTable> | undefined

              if (input.sourceName) {
                yield* tx
                  .insert(sourcesTable)
                  .values({ userId: input.userId, name: input.sourceName })
                  .onConflictDoNothing()

                const [row] = yield* tx
                  .select()
                  .from(sourcesTable)
                  .where(and(
                    eq(sourcesTable.userId, input.userId),
                    eq(sourcesTable.name, input.sourceName),
                  ))
                  .limit(1)

                if (row) {
                  sourceRecord = row
                  sourceId = row.id
                }
              }

              if (input.folderId) {
                const [row] = yield* tx
                  .select()
                  .from(foldersTable)
                  .where(and(
                    eq(foldersTable.userId, input.userId),
                    eq(foldersTable.id, input.folderId),
                  ))
                  .limit(1)

                if (!row) {
                  return yield* new FolderReferenceNotFound({ folderId: input.folderId })
                }

                folderRecord = row
                folderId = row.id
              }

              const linkRows = yield* tx
                .select()
                .from(linksTable)
                .where(eq(linksTable.normalizedUrl, input.url.normalizedUrl))
                .limit(1)
              let link = linkRows[0]
              let metadata: LinkMetadataRecord | undefined
              let enrichment: LinkEnrichmentRecord | undefined

              if (!link) {
                const [createdLink] = yield* tx
                  .insert(linksTable)
                  .values({
                    originalUrl: input.url.originalUrl,
                    normalizedUrl: input.url.normalizedUrl,
                    host: input.url.host,
                  })
                  .returning()

                if (!createdLink) {
                  throw new Error("Link insert did not return a row.")
                }

                const [createdMetadata] = yield* tx
                  .insert(linkMetadataTable)
                  .values({ linkId: createdLink.id })
                  .returning()
                const [createdEnrichment] = yield* tx
                  .insert(linkEnrichmentTable)
                  .values({
                    linkId: createdLink.id,
                    type: input.url.type,
                    tags: [],
                    status: "pending",
                  })
                  .returning()

                if (!createdMetadata || !createdEnrichment) {
                  throw new Error("Link companion insert did not return a row.")
                }

                link = createdLink
                metadata = createdMetadata
                enrichment = createdEnrichment
              } else {
                const metadataRows = yield* tx
                  .select()
                  .from(linkMetadataTable)
                  .where(eq(linkMetadataTable.linkId, link.id))
                  .limit(1)
                const enrichmentRows = yield* tx
                  .select()
                  .from(linkEnrichmentTable)
                  .where(eq(linkEnrichmentTable.linkId, link.id))
                  .limit(1)

                metadata = metadataRows[0]
                enrichment = enrichmentRows[0]

                if (!metadata) {
                  const [createdMetadata] = yield* tx
                    .insert(linkMetadataTable)
                    .values({ linkId: link.id })
                    .returning()
                  metadata = createdMetadata
                }

                if (!enrichment) {
                  const [createdEnrichment] = yield* tx
                    .insert(linkEnrichmentTable)
                    .values({
                      linkId: link.id,
                      type: input.url.type,
                      tags: [],
                      status: "pending",
                    })
                    .returning()
                  enrichment = createdEnrichment
                }

                if (!metadata || !enrichment) {
                  throw new Error("Link companion insert did not return a row.")
                }
              }

              const existingRows = yield* tx
                .select()
                .from(savedItemsTable)
                .where(and(
                  eq(savedItemsTable.userId, input.userId),
                  eq(savedItemsTable.linkId, link.id),
                ))
                .limit(1)
              const existing = existingRows[0]

              if (existing) {
                const now = new Date()
                const [updated] = yield* tx
                  .update(savedItemsTable)
                  .set({
                    isRead: false,
                    lastSavedAt: now,
                    updatedAt: now,
                    ...(sourceId !== undefined ? { sourceId } : {}),
                    ...(input.captureChannel !== undefined ? { captureChannel: input.captureChannel } : {}),
                    ...(input.tags !== undefined ? { tags: [...input.tags] } : {}),
                    folderId,
                  })
                  .where(eq(savedItemsTable.id, existing.id))
                  .returning()

                return {
                  savedItem: toSavedItemWithLink(
                    updated ?? existing,
                    link,
                    metadata,
                    enrichment,
                    sourceRecord,
                    folderRecord,
                  ),
                  captureResult: "updated" as const,
                  enrichment: { _tag: "start" as const, linkId: link.id },
                }
              }

              const [created] = yield* tx
                .insert(savedItemsTable)
                .values({
                  userId: input.userId,
                  linkId: link.id,
                  isRead: false,
                  tags: input.tags ? [...input.tags] : [],
                  folderId,
                  ...(sourceId !== undefined ? { sourceId } : {}),
                  ...(input.captureChannel !== undefined ? { captureChannel: input.captureChannel } : {}),
                })
                .returning()

              if (!created) {
                throw new Error("SavedItem insert did not return a row.")
              }

              return {
                savedItem: toSavedItemWithLink(created, link, metadata, enrichment, sourceRecord, folderRecord),
                captureResult: "created" as const,
                enrichment: { _tag: "start" as const, linkId: link.id },
              }
            }),
          )
        }),
      }
    }),
  },
) {
  static readonly layer = Layer.effect(CaptureServiceStore, CaptureServiceStore.make)

  static readonly defaultLayer = CaptureServiceStore.layer.pipe(
    Layer.provide(PostgresClient.defaultLayer),
  )
}
