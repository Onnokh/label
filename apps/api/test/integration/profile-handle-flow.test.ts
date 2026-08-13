import { beforeAll, beforeEach, describe, expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { Effect, Option } from "effect"
import { Pool } from "pg"

import type { UserId } from "../../src/domain/SavedItem.js"
import { ProfileRepository } from "../../src/modules/profiles/ProfileRepository.js"
import {
  cleanTestDatabase,
  setupTestDatabase,
  testDatabaseUrl,
  withTestDatabaseUrl,
} from "../lib/postgres.js"

// No skip guard on purpose: Handle uniqueness is a Postgres rule, so a missing
// database must fail this suite loudly instead of letting it pass empty.
const runIntegration = <A, E>(
  effect: Effect.Effect<A, E, ProfileRepository>,
) =>
  withTestDatabaseUrl(() =>
    Effect.runPromise(effect.pipe(Effect.provide(ProfileRepository.defaultLayer))),
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

describe("profile handle integration flow", () => {
  test("claims a Handle, renames it, and keeps it through Profile Visibility changes", async () => {
    const userId = `integration-user-${randomUUID()}` as UserId
    await insertUser(userId)

    await runIntegration(
      Effect.gen(function* () {
        const repo = yield* ProfileRepository

        const claimed = yield* repo.claim(userId, "readerone")
        expect(Option.isSome(claimed)).toBe(true)
        if (Option.isSome(claimed)) {
          expect(claimed.value.handle).toBe("readerone")
          expect(claimed.value.visibility).toBe("private")
        }

        const published = yield* repo.setVisibility(userId, "public")
        expect(Option.isSome(published)).toBe(true)
        if (Option.isSome(published)) {
          expect(published.value.visibility).toBe("public")
        }

        const hidden = yield* repo.setVisibility(userId, "private")
        expect(Option.isSome(hidden)).toBe(true)
        if (Option.isSome(hidden)) {
          expect(hidden.value.visibility).toBe("private")
          // Turning Profile Visibility off keeps the Handle claimed.
          expect(hidden.value.handle).toBe("readerone")
        }

        expect(Option.isSome(yield* repo.renameHandle(userId, "reader-two"))).toBe(true)

        const byOldHandle = yield* repo.findByHandle("readerone")
        expect(Option.isNone(byOldHandle)).toBe(true)

        const byNewHandle = yield* repo.findByHandle("READER-TWO")
        expect(Option.isSome(byNewHandle)).toBe(true)
        if (Option.isSome(byNewHandle)) {
          expect(byNewHandle.value.userId).toBe(userId)
        }
      }),
    )
  })

  test("refuses a Handle another Account already holds in a different case", async () => {
    const firstUserId = `integration-user-${randomUUID()}` as UserId
    const secondUserId = `integration-user-${randomUUID()}` as UserId
    await insertUser(firstUserId)
    await insertUser(secondUserId)

    await runIntegration(
      Effect.gen(function* () {
        const repo = yield* ProfileRepository

        expect(Option.isSome(yield* repo.claim(firstUserId, "readerone"))).toBe(true)
        // The repository never compares Handles itself, so a None here can only
        // come from the lower(handle) unique index in Postgres.
        expect(Option.isNone(yield* repo.claim(secondUserId, "ReaderOne"))).toBe(true)
      }),
    )

    // Same rule stated directly against the database: an insert that bypasses
    // every application check still fails with a unique violation.
    const rejection = await withPool((pool) =>
      pool
        .query(
          `insert into "profiles" (id, user_id, handle) values ($1, $2, $3)`,
          [randomUUID(), secondUserId, "READERONE"],
        )
        .then(() => null)
        .catch((error: { readonly code?: string }) => error.code ?? "unknown"),
    )

    expect(rejection).toBe("23505")
  })
})
