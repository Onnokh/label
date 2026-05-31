import { randomUUID } from "node:crypto"

import { desc, eq } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

import { EnrichmentJob, type EnrichmentJobId } from "../../domain/EnrichmentJob.js"
import {
  Link,
  LinkEnrichment,
  LinkMetadata,
} from "../../domain/SavedItem.js"
import { LinkNotFound } from "../enrichment/LinkNotFound.js"
import { PostgresClient } from "../persistence/PostgresClient.js"
import {
  enrichmentJobsTable,
  linkEnrichmentTable,
  linkMetadataTable,
  linksTable,
} from "../persistence/schema.js"
import {
  toLink,
  toLinkEnrichment,
  toLinkMetadata,
} from "./SavedItemRepository.js"

type PersistedStage = {
  readonly stage: EnrichmentJob["stages"][number]["stage"]
  readonly status: EnrichmentJob["stages"][number]["status"]
  readonly message?: string
  readonly startedAt: number
  readonly completedAt: number
}

export type StartEnrichmentResult = {
  readonly link: Link
  readonly metadata: LinkMetadata
  readonly enrichment: LinkEnrichment
  readonly job: EnrichmentJob
}

const encodeStages = (stages: ReadonlyArray<EnrichmentJob["stages"][number]>) =>
  stages.map((stage): PersistedStage => ({
    stage: stage.stage,
    status: stage.status,
    ...(stage.message ? { message: stage.message } : {}),
    startedAt: stage.startedAt.getTime(),
    completedAt: stage.completedAt.getTime(),
  }))

export class SavedItemIntake extends Context.Service<SavedItemIntake>()(
  "@app/modules/saved-items/SavedItemIntake",
  {
    make: Effect.gen(function* () {
      const { db } = yield* PostgresClient

      return {
        getEnrichmentStatus: (linkId: Link["id"]) =>
          Effect.gen(function* () {
            const rows = yield* db
              .select({ status: linkEnrichmentTable.status })
              .from(linkEnrichmentTable)
              .where(eq(linkEnrichmentTable.linkId, linkId))
              .limit(1)
            return rows[0]?.status as LinkEnrichment["status"] | undefined
          }),

        startEnrichment: (linkId: Link["id"]) =>
          db.transaction((tx) =>
            Effect.gen(function* () {
              const linkRows = yield* tx
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
              const row = linkRows[0]

              if (!row) {
                return yield* new LinkNotFound({ linkId })
              }

              const latestJobs = yield* tx
                .select()
                .from(enrichmentJobsTable)
                .where(eq(enrichmentJobsTable.linkId, linkId))
                .orderBy(desc(enrichmentJobsTable.attempt))
                .limit(1)
              const latestJob = latestJobs[0]

              const now = new Date()
              const job = new EnrichmentJob({
                id: randomUUID() as EnrichmentJobId,
                linkId,
                attempt: (latestJob?.attempt ?? 0) + 1,
                status: "running",
                stages: [],
                queuedAt: now,
                startedAt: now,
              })

              yield* tx.insert(enrichmentJobsTable).values({
                id: job.id,
                linkId: job.linkId,
                attempt: job.attempt,
                status: job.status,
                stagesJson: [],
                queuedAt: job.queuedAt,
                startedAt: job.startedAt,
                completedAt: job.completedAt,
              })

              yield* tx
                .update(linkEnrichmentTable)
                .set({ status: "pending", updatedAt: now })
                .where(eq(linkEnrichmentTable.linkId, linkId))

              return {
                link: toLink(row.link),
                metadata: toLinkMetadata(row.metadata),
                enrichment: toLinkEnrichment(row.enrichment),
                job,
              }
            }),
          ),

        finishEnrichment: (
          link: Link,
          metadata: LinkMetadata,
          enrichment: LinkEnrichment,
          job: EnrichmentJob,
        ) =>
          db.transaction((tx) =>
            Effect.gen(function* () {
              const [metadataRow] = yield* tx
                .update(linkMetadataTable)
                .set({
                  title: metadata.title,
                  description: metadata.description,
                  siteName: metadata.siteName,
                  faviconUrl: metadata.faviconUrl,
                  faviconLightUrl: metadata.faviconLightUrl,
                  faviconDarkUrl: metadata.faviconDarkUrl,
                  imageUrl: metadata.imageUrl,
                  canonicalUrl: metadata.canonicalUrl,
                  fetchedAt: metadata.fetchedAt,
                  updatedAt: metadata.updatedAt,
                })
                .where(eq(linkMetadataTable.linkId, link.id))
                .returning()

              const [enrichmentRow] = yield* tx
                .update(linkEnrichmentTable)
                .set({
                  previewSummary: enrichment.previewSummary,
                  type: enrichment.type,
                  tags: [...enrichment.tags],
                  status: enrichment.status,
                  enrichedAt: enrichment.enrichedAt,
                  updatedAt: enrichment.updatedAt,
                })
                .where(eq(linkEnrichmentTable.linkId, link.id))
                .returning()

              yield* tx
                .update(enrichmentJobsTable)
                .set({
                  attempt: job.attempt,
                  status: job.status,
                  stagesJson: encodeStages(job.stages),
                  queuedAt: job.queuedAt,
                  startedAt: job.startedAt,
                  completedAt: job.completedAt,
                })
                .where(eq(enrichmentJobsTable.id, job.id))

              return {
                link,
                metadata: metadataRow ? toLinkMetadata(metadataRow) : metadata,
                enrichment: enrichmentRow ? toLinkEnrichment(enrichmentRow) : enrichment,
                job,
              }
            }),
          ),
      }
    }),
  },
) {
  static readonly layer = Layer.effect(SavedItemIntake, SavedItemIntake.make)

  static readonly defaultLayer = SavedItemIntake.layer.pipe(
    Layer.provide(PostgresClient.defaultLayer),
  )
}
