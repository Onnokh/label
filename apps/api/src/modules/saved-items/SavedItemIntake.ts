import { randomUUID } from "node:crypto"

import { and, desc, eq } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"

import { EnrichmentJob, type EnrichmentJobId } from "../../domain/EnrichmentJob.js"
import { SavedItem, type AccountId } from "../../domain/SavedItem.js"
import { InvalidUrl } from "../capture/CaptureError.js"
import { SavedItemNotFound } from "../enrichment/SavedItemNotFound.js"
import { PostgresClient } from "../persistence/PostgresClient.js"
import { enrichmentJobsTable, savedItemsTable } from "../persistence/schema.js"
import { toSavedItem } from "./SavedItemRepository.js"

type PersistedStage = {
  readonly stage: EnrichmentJob["stages"][number]["stage"]
  readonly status: EnrichmentJob["stages"][number]["status"]
  readonly message?: string
  readonly startedAt: number
  readonly completedAt: number
}

type NormalizedUrl = {
  readonly originalUrl: string
  readonly normalizedUrl: string
  readonly host: string
}

export type CaptureSavedItemResult = {
  readonly savedItem: SavedItem
  readonly captureResult: "created" | "updated"
}

export type StartEnrichmentResult = {
  readonly savedItem: SavedItem
  readonly job: EnrichmentJob
}

const normalizeUrl = (input: string): Effect.Effect<NormalizedUrl, InvalidUrl> =>
  Effect.try({
    try: () => {
      const original = new URL(input.trim())
      const normalized = new URL(original)
      normalized.hash = ""
      normalized.protocol = normalized.protocol.toLowerCase()
      normalized.hostname = normalized.hostname.toLowerCase()

      if (
        (normalized.protocol === "https:" && normalized.port === "443") ||
        (normalized.protocol === "http:" && normalized.port === "80")
      ) {
        normalized.port = ""
      }

      normalized.searchParams.sort()

      return {
        originalUrl: original.toString(),
        normalizedUrl: normalized.toString(),
        host: normalized.host,
      }
    },
    catch: () => new InvalidUrl({ url: input }),
  })

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
        capture: (accountId: AccountId, inputUrl: string) =>
          Effect.gen(function* () {
            const url = yield* normalizeUrl(inputUrl)

            return yield* db.transaction((tx) =>
              Effect.gen(function* () {
                  const existingRows = yield* tx
                    .select()
                    .from(savedItemsTable)
                    .where(and(
                      eq(savedItemsTable.accountId, accountId),
                      eq(savedItemsTable.normalizedUrl, url.normalizedUrl),
                    ))
                    .limit(1)
                  const existing = existingRows[0]

                  if (existing) {
                    const now = new Date()
                    const [updated] = yield* tx
                      .update(savedItemsTable)
                      .set({
                        originalUrl: url.originalUrl,
                        host: url.host,
                        isRead: false,
                        lastSavedAt: now,
                        updatedAt: now,
                      })
                      .where(eq(savedItemsTable.id, existing.id))
                      .returning()

                    return {
                      savedItem: toSavedItem(updated ?? existing),
                      captureResult: "updated" as const,
                    }
                  }

                  const [created] = yield* tx
                    .insert(savedItemsTable)
                    .values({
                      accountId,
                      originalUrl: url.originalUrl,
                      normalizedUrl: url.normalizedUrl,
                      host: url.host,
                      isRead: false,
                      enrichmentStatus: "pending",
                    })
                    .returning()

                  if (!created) {
                    throw new Error("SavedItem insert did not return a row.")
                  }

                  return {
                    savedItem: toSavedItem(created),
                    captureResult: "created" as const,
                  }
                }),
            )
          }),

        startEnrichment: (savedItemId: SavedItem["id"]) =>
          db.transaction((tx) =>
            Effect.gen(function* () {
                const savedItemRows = yield* tx
                  .select()
                  .from(savedItemsTable)
                  .where(eq(savedItemsTable.id, savedItemId))
                  .limit(1)
                const savedItemRow = savedItemRows[0]

                if (!savedItemRow) {
                  return yield* new SavedItemNotFound({ savedItemId })
                }

                const latestJobs = yield* tx
                  .select()
                  .from(enrichmentJobsTable)
                  .where(eq(enrichmentJobsTable.savedItemId, savedItemId))
                  .orderBy(desc(enrichmentJobsTable.attempt))
                  .limit(1)
                const latestJob = latestJobs[0]

                const now = new Date()
                const job = new EnrichmentJob({
                  id: randomUUID() as EnrichmentJobId,
                  savedItemId,
                  attempt: (latestJob?.attempt ?? 0) + 1,
                  status: "running",
                  stages: [],
                  queuedAt: now,
                  startedAt: now,
                })

                yield* tx.insert(enrichmentJobsTable).values({
                  id: job.id,
                  savedItemId: job.savedItemId,
                  attempt: job.attempt,
                  status: job.status,
                  stagesJson: [],
                  queuedAt: job.queuedAt,
                  startedAt: job.startedAt,
                  completedAt: job.completedAt,
                })

                yield* tx
                  .update(savedItemsTable)
                  .set({ enrichmentStatus: "pending", updatedAt: now })
                  .where(eq(savedItemsTable.id, savedItemId))

                return {
                  savedItem: toSavedItem(savedItemRow),
                  job,
                }
              }),
          ),

        finishEnrichment: (savedItem: SavedItem, job: EnrichmentJob) =>
          db.transaction((tx) =>
            Effect.gen(function* () {
              const [savedItemRow] = yield* tx
                .update(savedItemsTable)
                .set({
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
                  updatedAt: savedItem.updatedAt,
                })
                .where(eq(savedItemsTable.id, savedItem.id))
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

              return { savedItem: toSavedItem(savedItemRow ?? savedItem), job }
            }),
          ),
      }
    }),
  },
) {
  static readonly layer = Layer.effect(SavedItemIntake, SavedItemIntake.make)
}
