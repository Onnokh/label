import { beforeAll, beforeEach, describe, expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { Effect, Layer, Option } from "effect"
import { Pool } from "pg"

import type { FolderId, UserId } from "../../src/domain/SavedItem.js"
import { CaptureService } from "../../src/modules/capture/CaptureService.js"
import { FolderRepository } from "../../src/modules/folders/FolderRepository.js"
import { SavedItemRepository } from "../../src/modules/saved-items/SavedItemRepository.js"
import {
  cleanTestDatabase,
  setupTestDatabase,
  testDatabaseUrl,
  withTestDatabaseUrl,
} from "../lib/postgres.js"

// No skip guard on purpose: what a Duplicate Save keeps and what the column
// defaults to are Postgres facts, so a missing database must fail this suite
// loudly instead of letting it pass empty.
const persistenceLayer = Layer.mergeAll(
  CaptureService.defaultLayer,
  FolderRepository.defaultLayer,
  SavedItemRepository.defaultLayer,
)

const runIntegration = <A, E>(
  effect: Effect.Effect<A, E, CaptureService | FolderRepository | SavedItemRepository>,
) =>
  withTestDatabaseUrl(() =>
    Effect.runPromise(effect.pipe(Effect.provide(persistenceLayer))),
  )

const withPool = async <A>(run: (pool: Pool) => Promise<A>) => {
  const pool = new Pool({ connectionString: testDatabaseUrl })
  try {
    return await run(pool)
  } finally {
    await pool.end()
  }
}

const insertUser = (userId: UserId) =>
  withPool((pool) =>
    pool.query(
      `
        insert into "user" (id, name, email, email_verified, created_at, updated_at)
        values ($1, $2, $3, true, now(), now())
      `,
      [userId, "Integration User", `${userId}@example.com`],
    ),
  )

beforeAll(async () => {
  await setupTestDatabase()
})

beforeEach(async () => {
  await cleanTestDatabase()
})

describe("saved item privacy integration flow", () => {
  test("captures a Private Saved Item and keeps it private through a Duplicate Save", async () => {
    const runId = randomUUID()
    const userId = `integration-user-${runId}` as UserId
    const url = `https://example.com/articles/private-${runId}`
    await insertUser(userId)

    await runIntegration(
      Effect.gen(function* () {
        const capture = yield* CaptureService
        const repo = yield* SavedItemRepository

        const created = yield* capture.save({ userId, url, isPrivate: true })
        expect(created.captureResult).toBe("created")
        expect(created.savedItem.savedItem.isPrivate).toBe(true)

        // A Duplicate Save without the flag must not republish the item.
        const kept = yield* capture.save({ userId, url })
        expect(kept.captureResult).toBe("updated")
        expect(kept.savedItem.savedItem.isPrivate).toBe(true)

        const afterKeep = yield* repo.listByUser(userId, "newest")
        expect(afterKeep).toHaveLength(1)
        expect(afterKeep[0]?.savedItem.isPrivate).toBe(true)

        // A Duplicate Save that sends the flag sets the new value.
        const published = yield* capture.save({ userId, url, isPrivate: false })
        expect(published.savedItem.savedItem.isPrivate).toBe(false)

        const afterPublish = yield* repo.listByUser(userId, "newest")
        expect(afterPublish[0]?.savedItem.isPrivate).toBe(false)
      }),
    )
  })

  test("captures a public Saved Item when the flag is omitted and marks it private afterwards", async () => {
    const runId = randomUUID()
    const userId = `integration-user-${runId}` as UserId
    const url = `https://example.com/articles/public-${runId}`
    await insertUser(userId)

    await runIntegration(
      Effect.gen(function* () {
        const capture = yield* CaptureService
        const repo = yield* SavedItemRepository

        const created = yield* capture.save({ userId, url })
        expect(created.savedItem.savedItem.isPrivate).toBe(false)

        const savedItemId = created.savedItem.savedItem.id
        const marked = yield* repo.setPrivate(userId, savedItemId, true)
        expect(Option.isSome(marked)).toBe(true)
        if (Option.isSome(marked)) {
          expect(marked.value.savedItem.isPrivate).toBe(true)
        }

        const reread = yield* repo.findByUserAndId(userId, savedItemId)
        expect(Option.isSome(reread)).toBe(true)
        if (Option.isSome(reread)) {
          expect(reread.value.savedItem.isPrivate).toBe(true)
        }

        const restored = yield* repo.setPrivate(userId, savedItemId, false)
        expect(Option.isSome(restored)).toBe(true)
        if (Option.isSome(restored)) {
          expect(restored.value.savedItem.isPrivate).toBe(false)
        }
      }),
    )
  })

  test("marks a Folder private and leaves the flag alone on a name-only update", async () => {
    const runId = randomUUID()
    const userId = `integration-user-${runId}` as UserId
    await insertUser(userId)

    await runIntegration(
      Effect.gen(function* () {
        const repo = yield* FolderRepository

        const created = yield* repo.create(userId, "Research", null, null)
        expect(Option.isSome(created)).toBe(true)
        if (Option.isNone(created)) throw new Error("expected the Folder to be created")
        expect(created.value.isPrivate).toBe(false)

        const folderId: FolderId = created.value.id

        const marked = yield* repo.update(userId, folderId, { isPrivate: true })
        expect(Option.isSome(marked)).toBe(true)
        if (Option.isSome(marked)) {
          expect(marked.value.isPrivate).toBe(true)
          expect(marked.value.name).toBe("Research")
        }

        const renamed = yield* repo.update(userId, folderId, { name: "Reading" })
        expect(Option.isSome(renamed)).toBe(true)
        if (Option.isSome(renamed)) {
          expect(renamed.value.name).toBe("Reading")
          // A name-only caller never republishes a Private Folder.
          expect(renamed.value.isPrivate).toBe(true)
        }
      }),
    )
  })

  test("defaults both flags to false for rows written without them", async () => {
    const runId = randomUUID()
    const userId = `integration-user-${runId}` as UserId
    const linkId = randomUUID()
    const savedItemId = randomUUID()
    const folderId = randomUUID()
    await insertUser(userId)

    // Rows inserted the way they existed before the columns were added: the
    // database, not the application, decides what they mean.
    const rows = await withPool(async (pool) => {
      await pool.query(
        `insert into "links" (id, original_url, normalized_url, host) values ($1, $2, $3, $4)`,
        [linkId, `https://example.com/${runId}`, `https://example.com/${runId}`, "example.com"],
      )
      await pool.query(
        `insert into "saved_items" (id, user_id, link_id) values ($1, $2, $3)`,
        [savedItemId, userId, linkId],
      )
      await pool.query(
        `insert into "folders" (id, user_id, name) values ($1, $2, $3)`,
        [folderId, userId, "Legacy"],
      )
      const savedItem = await pool.query(
        `select is_private from "saved_items" where id = $1`,
        [savedItemId],
      )
      const folder = await pool.query(
        `select is_private from "folders" where id = $1`,
        [folderId],
      )
      return {
        savedItem: savedItem.rows[0]?.is_private,
        folder: folder.rows[0]?.is_private,
      }
    })

    expect(rows).toEqual({ savedItem: false, folder: false })
  })
})
