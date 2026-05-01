import { desc, eq, type InferSelectModel } from "drizzle-orm"
import { Effect, Option } from "effect"

import {
  EnrichmentJob,
  EnrichmentStageResult,
} from "../../domain/EnrichmentJob.js"
import { SqliteClient } from "../persistence/SqliteClient.js"
import { enrichmentJobsTable } from "../persistence/schema.js"

type EnrichmentJobRecord = InferSelectModel<typeof enrichmentJobsTable>

type PersistedStage = {
  readonly stage: EnrichmentStageResult["stage"]
  readonly status: EnrichmentStageResult["status"]
  readonly message?: string
  readonly startedAt: number
  readonly completedAt: number
}

const decodeStages = (value: string) => {
  const parsed = JSON.parse(value) as ReadonlyArray<PersistedStage>

  return parsed.map(
    (stage) =>
      new EnrichmentStageResult({
        stage: stage.stage,
        status: stage.status,
        message: stage.message,
        startedAt: new Date(stage.startedAt),
        completedAt: new Date(stage.completedAt),
      }),
  )
}

const encodeStages = (stages: ReadonlyArray<EnrichmentStageResult>) =>
  JSON.stringify(
    stages.map((stage) => ({
      stage: stage.stage,
      status: stage.status,
      message: stage.message,
      startedAt: stage.startedAt.getTime(),
      completedAt: stage.completedAt.getTime(),
    })),
  )

const toEnrichmentJob = (record: EnrichmentJobRecord) =>
  new EnrichmentJob({
    id: record.id,
    savedItemId: record.savedItemId,
    attempt: record.attempt,
    status: record.status,
    stages: decodeStages(record.stagesJson),
    queuedAt: record.queuedAt,
    startedAt: record.startedAt ?? undefined,
    completedAt: record.completedAt ?? undefined,
  })

export class EnrichmentJobRepository extends Effect.Service<EnrichmentJobRepository>()(
  "@app/modules/enrichment/EnrichmentJobRepository",
  {
    effect: Effect.gen(function* () {
      const { db } = yield* SqliteClient

      return {
        findLatestBySavedItemId: (savedItemId: EnrichmentJob["savedItemId"]) =>
          Effect.sync(() => {
            const row = db.query.enrichmentJobsTable.findFirst({
              where: eq(enrichmentJobsTable.savedItemId, savedItemId),
              orderBy: [desc(enrichmentJobsTable.attempt)],
            }).sync()

            return Option.map(Option.fromNullable(row), toEnrichmentJob)
          }),

        insert: (job: EnrichmentJob) =>
          Effect.sync(() => {
            db.insert(enrichmentJobsTable).values({
              id: job.id,
              savedItemId: job.savedItemId,
              attempt: job.attempt,
              status: job.status,
              stagesJson: encodeStages(job.stages),
              queuedAt: job.queuedAt,
              startedAt: job.startedAt,
              completedAt: job.completedAt,
            }).run()

            return job
          }),

        update: (job: EnrichmentJob) =>
          Effect.sync(() => {
            db
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

            return job
          }),
      }
    }),
  },
) { }

export const enrichmentJobRepositoryLayer = EnrichmentJobRepository.Default
