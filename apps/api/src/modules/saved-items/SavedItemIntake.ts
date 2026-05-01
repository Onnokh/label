import { randomUUID } from "node:crypto"

import { desc, eq, type InferSelectModel } from "drizzle-orm"
import { Data, Effect } from "effect"

import { SavedItem } from "../../domain/SavedItem.js"
import {
  CapturedLink,
  type CapturedLinkId,
} from "../../domain/CapturedLink.js"
import {
  EnrichmentJob,
  type EnrichmentJobId,
} from "../../domain/EnrichmentJob.js"
import { AlreadyCaptured, InvalidUrl } from "../capture/CaptureError.js"
import { SavedItemNotFound } from "../enrichment/SavedItemNotFound.js"
import { SqliteClient } from "../persistence/SqliteClient.js"
import {
  savedItemsTable,
  capturedLinksTable,
  enrichmentJobsTable,
} from "../persistence/schema.js"

type SavedItemRecord = InferSelectModel<typeof savedItemsTable>

type SavedItemUpdate = Omit<typeof savedItemsTable.$inferInsert, "id">

type PersistedStage = {
  readonly stage: EnrichmentJob["stages"][number]["stage"]
  readonly status: EnrichmentJob["stages"][number]["status"]
  readonly message?: string
  readonly startedAt: number
  readonly completedAt: number
}

type CanonicalUrl = {
  readonly url: string
  readonly host: string
}

export type CaptureSavedItemResult = {
  readonly savedItem: SavedItem
  readonly capturedLink: CapturedLink
}

export type StartEnrichmentResult = {
  readonly savedItem: SavedItem
  readonly job: EnrichmentJob
}

class SavedItemIntakeDefect extends Data.TaggedError("SavedItemIntakeDefect")<{
  readonly cause: unknown
}> { }

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

const encodeStages = (stages: ReadonlyArray<EnrichmentJob["stages"][number]>) =>
  JSON.stringify(
    stages.map((stage): PersistedStage => ({
      stage: stage.stage,
      status: stage.status,
      ...(stage.message ? { message: stage.message } : {}),
      startedAt: stage.startedAt.getTime(),
      completedAt: stage.completedAt.getTime(),
    })),
  )

const normalizeUrl = (input: string): Effect.Effect<CanonicalUrl, InvalidUrl> =>
  Effect.try({
    try: () => {
      const normalized = input.trim().toLowerCase()
      const url = new URL(normalized)
      return {
        url: url.toString(),
        host: url.host,
      }
    },
    catch: () => new InvalidUrl({ url: input }),
  })

export class SavedItemIntake extends Effect.Service<SavedItemIntake>()(
  "@app/modules/saved-items/SavedItemIntake",
  {
    effect: Effect.gen(function* () {
      const { db } = yield* SqliteClient

      return {
        capture: (inputUrl: string) =>
          Effect.gen(function* () {
            const { url, host } = yield* normalizeUrl(inputUrl)

            return yield* Effect.try({
              try: () =>
                db.transaction((tx) => {
                  const existingCapturedLink = tx.query.capturedLinksTable.findFirst({
                    where: eq(capturedLinksTable.url, url),
                  }).sync()

                  if (existingCapturedLink) {
                    throw new AlreadyCaptured({ url })
                  }

                  const savedItemRow =
                    tx.query.savedItemsTable.findFirst({
                      where: eq(savedItemsTable.url, url),
                    }).sync()
                    ?? tx.insert(savedItemsTable)
                      .values({ url, host, isRead: false })
                      .onConflictDoNothing({ target: savedItemsTable.url })
                      .returning()
                      .get()
                    ?? tx.query.savedItemsTable.findFirst({
                      where: eq(savedItemsTable.url, url),
                    }).sync()

                  if (!savedItemRow) {
                    throw new Error("SavedItem insert did not return a row.")
                  }

                  const capturedLinkRow = tx.insert(capturedLinksTable)
                    .values({
                      id: randomUUID() as CapturedLinkId,
                      savedItemId: savedItemRow.id,
                      url,
                      capturedAt: new Date(),
                    })
                    .onConflictDoNothing({ target: capturedLinksTable.url })
                    .returning()
                    .get()

                  if (!capturedLinkRow) {
                    throw new AlreadyCaptured({ url })
                  }

                  return {
                    savedItem: toSavedItem(savedItemRow),
                    capturedLink: new CapturedLink(capturedLinkRow),
                  }
                }),
              catch: (cause) =>
                cause instanceof AlreadyCaptured
                  ? cause
                  : new SavedItemIntakeDefect({ cause }),
            }).pipe(
              Effect.catchTag("SavedItemIntakeDefect", (error) => Effect.die(error.cause)),
              Effect.catchAll((cause) =>
                cause instanceof AlreadyCaptured ? Effect.fail(cause) : Effect.die(cause)
              ),
            )
          }),

        startEnrichment: (savedItemId: SavedItem["id"]) =>
          Effect.try({
            try: () =>
              db.transaction((tx) => {
                const savedItemRow = tx.query.savedItemsTable.findFirst({
                  where: eq(savedItemsTable.id, savedItemId),
                }).sync()

                if (!savedItemRow) {
                  throw new SavedItemNotFound({ savedItemId })
                }

                const latestJob = tx.query.enrichmentJobsTable.findFirst({
                  where: eq(enrichmentJobsTable.savedItemId, savedItemId),
                  orderBy: [desc(enrichmentJobsTable.attempt)],
                }).sync()

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

                tx.insert(enrichmentJobsTable).values({
                  id: job.id,
                  savedItemId: job.savedItemId,
                  attempt: job.attempt,
                  status: job.status,
                  stagesJson: "[]",
                  queuedAt: job.queuedAt,
                  startedAt: job.startedAt,
                  completedAt: job.completedAt,
                }).run()

                return {
                  savedItem: toSavedItem(savedItemRow),
                  job,
                }
              }),
            catch: (cause) =>
              cause instanceof SavedItemNotFound
                ? cause
                : new SavedItemIntakeDefect({ cause }),
          }).pipe(
            Effect.catchTag("SavedItemIntakeDefect", (error) => Effect.die(error.cause)),
          ),

        finishEnrichment: (savedItem: SavedItem, job: EnrichmentJob) =>
          Effect.sync(() =>
            db.transaction((tx) => {
              tx
                .update(savedItemsTable)
                .set(toSavedItemUpdate(savedItem))
                .where(eq(savedItemsTable.id, savedItem.id))
                .run()

              tx
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
                .run()

              return { savedItem, job }
            })
          ),
      }
    }),
  },
) { }

export const SavedItemIntakeLayer = SavedItemIntake.Default
