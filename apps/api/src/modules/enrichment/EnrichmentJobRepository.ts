import { desc, eq, type InferSelectModel } from "drizzle-orm"
import { Context, Effect, Layer, Option } from "effect"

import {
  EnrichmentJob,
  EnrichmentStageResult,
} from "../../domain/EnrichmentJob.js"
import { PostgresClient } from "../persistence/PostgresClient.js"
import { enrichmentJobsTable } from "../persistence/schema.js"

type EnrichmentJobRecord = InferSelectModel<typeof enrichmentJobsTable>

type PersistedStage = {
  readonly stage: EnrichmentStageResult["stage"]
  readonly status: EnrichmentStageResult["status"]
  readonly message?: string
  readonly startedAt: number
  readonly completedAt: number
}

const decodeStages = (value: unknown) =>
  (Array.isArray(value) ? value as ReadonlyArray<PersistedStage> : []).map(
    (stage) =>
      new EnrichmentStageResult({
        stage: stage.stage,
        status: stage.status,
        message: stage.message,
        startedAt: new Date(stage.startedAt),
        completedAt: new Date(stage.completedAt),
      }),
  )

const encodeStages = (stages: ReadonlyArray<EnrichmentStageResult>) =>
  stages.map((stage) => ({
    stage: stage.stage,
    status: stage.status,
    message: stage.message,
    startedAt: stage.startedAt.getTime(),
    completedAt: stage.completedAt.getTime(),
  }))

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

export class EnrichmentJobRepository extends Context.Service<EnrichmentJobRepository>()(
  "@app/modules/enrichment/EnrichmentJobRepository",
  {
    make: Effect.gen(function* () {
      const { db } = yield* PostgresClient

      return {
        findLatestBySavedItemId: (savedItemId: EnrichmentJob["savedItemId"]) =>
          Effect.gen(function* () {
            const rows = yield* db
              .select()
              .from(enrichmentJobsTable)
              .where(eq(enrichmentJobsTable.savedItemId, savedItemId))
              .orderBy(desc(enrichmentJobsTable.attempt))
              .limit(1)
            const row = rows[0]

            return row ? Option.some(toEnrichmentJob(row)) : Option.none<EnrichmentJob>()
          }),

        insert: (job: EnrichmentJob) =>
          Effect.gen(function* () {
            yield* db.insert(enrichmentJobsTable).values({
              id: job.id,
              savedItemId: job.savedItemId,
              attempt: job.attempt,
              status: job.status,
              stagesJson: encodeStages(job.stages),
              queuedAt: job.queuedAt,
              startedAt: job.startedAt,
              completedAt: job.completedAt,
            })

            return job
          }),

        update: (job: EnrichmentJob) =>
          Effect.gen(function* () {
            yield* db
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

            return job
          }),
      }
    }),
  },
) {
  static readonly layer = Layer.effect(EnrichmentJobRepository, EnrichmentJobRepository.make)
}
