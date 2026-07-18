import { beforeAll, beforeEach, describe, expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { Effect, Layer, Option } from "effect"
import { Pool } from "pg"

import {
  EnrichmentJob,
  EnrichmentStageResult,
} from "../../src/domain/EnrichmentJob.js"
import type { UserId } from "../../src/domain/SavedItem.js"
import { CaptureService } from "../../src/modules/capture/CaptureService.js"
import { SavedItemIntake } from "../../src/modules/saved-items/SavedItemIntake.js"
import { SavedItemRepository } from "../../src/modules/saved-items/SavedItemRepository.js"
import {
  cleanTestDatabase,
  setupTestDatabase,
  testDatabaseUrl,
  withTestDatabaseUrl,
} from "../lib/postgres.js"

let databaseAvailable = false
let setupError: unknown

// Each service now provides its own dependencies via `defaultLayer`
// (PostgresClient + AppConfig are shared across them by layer-identity
// memoization), so the test wiring is a flat, order-independent merge.
const persistenceLayer = Layer.mergeAll(
  CaptureService.defaultLayer,
  SavedItemRepository.defaultLayer,
  SavedItemIntake.defaultLayer,
)

const runIntegration = <A, E>(
  effect: Effect.Effect<A, E, CaptureService | SavedItemRepository | SavedItemIntake>,
) =>
  withTestDatabaseUrl(() =>
    Effect.runPromise(effect.pipe(Effect.provide(persistenceLayer))),
  )

const insertUser = async (userId: UserId) => {
  const pool = new Pool({ connectionString: testDatabaseUrl })
  try {
    await pool.query(
      `
        insert into "user" (id, name, email, email_verified, created_at, updated_at)
        values ($1, $2, $3, true, now(), now())
      `,
      [userId, "Integration User", `${userId}@example.com`],
    )
  } finally {
    await pool.end()
  }
}

beforeAll(async () => {
  try {
    await setupTestDatabase()
    databaseAvailable = true
  } catch (error) {
    setupError = error
    databaseAvailable = false
  }
})

beforeEach(async () => {
  if (databaseAvailable) {
    await cleanTestDatabase()
  }
})

describe("saved item integration flow", () => {
  test("captures, updates, enriches, and serves a saved item", async () => {
    if (!databaseAvailable) {
      console.warn(
        `Skipping Postgres integration test; ${testDatabaseUrl} is unavailable.`,
        setupError,
      )
      return
    }

    const runId = randomUUID()
    const userId = `integration-user-${runId}` as UserId
    const originalUrl = `https://example.com/articles/effect-api-${runId}?b=2&a=1#fragment`
    const duplicateUrl = `https://EXAMPLE.com:443/articles/effect-api-${runId}?a=1&b=2`
    const normalizedUrl = `https://example.com/articles/effect-api-${runId}?a=1&b=2`
    await insertUser(userId)

    await runIntegration(
      Effect.gen(function* () {
        const capture = yield* CaptureService
        const repo = yield* SavedItemRepository
        const intake = yield* SavedItemIntake

        const created = yield* capture.save({
          userId,
          url: originalUrl,
          captureChannel: "api",
          sourceName: "integration-test",
          tags: ["backend"],
        })

        expect(created.captureResult).toBe("created")
        expect(created.savedItem.link.normalizedUrl).toBe(
          normalizedUrl,
        )
        expect(created.savedItem.savedItem.tags).toEqual(["backend"])
        expect(created.enrichment._tag).toBe("start")

        const listedAfterCreate = yield* repo.listByUser(userId, "newest")
        expect(listedAfterCreate).toHaveLength(1)
        expect(listedAfterCreate[0]?.source?.name).toBe("integration-test")

        const updated = yield* capture.save({
          userId,
          url: duplicateUrl,
          captureChannel: "api",
          tags: ["typescript"],
        })

        expect(updated.captureResult).toBe("updated")

        const listedAfterUpdate = yield* repo.listByUser(userId, "newest")
        expect(listedAfterUpdate).toHaveLength(1)
        expect(listedAfterUpdate[0]?.savedItem.tags).toEqual(["typescript"])

        if (updated.enrichment._tag !== "start") {
          throw new Error("expected capture to request enrichment")
        }

        const started = yield* intake.startEnrichment(updated.enrichment.linkId)
        const completedAt = new Date("2026-05-19T12:00:00.000Z")
        const finished = yield* intake.finishEnrichment(
          started.link,
          {
            ...started.metadata,
            title: "Effect API Testing",
            description: "A real database-backed saved item flow.",
            siteName: "Example Docs",
            fetchedAt: completedAt,
            updatedAt: completedAt,
          },
          {
            ...started.enrichment,
            previewSummary: "A real database-backed saved item flow.",
            tags: ["backend", "typescript"],
            status: "enriched",
            enrichedAt: completedAt,
            updatedAt: completedAt,
          },
          new EnrichmentJob({
            ...started.job,
            status: "succeeded",
            stages: [
              new EnrichmentStageResult({
                stage: "metadata",
                status: "succeeded",
                startedAt: completedAt,
                completedAt,
              }),
            ],
            completedAt,
          }),
        )

        expect(finished.metadata.title).toBe("Effect API Testing")
        expect(finished.enrichment.status).toBe("enriched")

        const served = yield* repo.listByUser(userId, "newest")
        expect(served).toHaveLength(1)
        expect(served[0]?.metadata.title).toBe("Effect API Testing")
        expect(served[0]?.enrichment.previewSummary).toBe(
          "A real database-backed saved item flow.",
        )
        expect(served[0]?.enrichment.tags).toEqual(["backend", "typescript"])

        const read = yield* repo.setReadState(userId, served[0]!.savedItem.id, true)
        expect(Option.isSome(read)).toBe(true)
        if (Option.isSome(read)) {
          expect(read.value.savedItem.isRead).toBe(true)
        }
      }),
    )
  })
})
