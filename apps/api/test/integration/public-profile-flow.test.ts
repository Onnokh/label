import { beforeAll, beforeEach, describe, expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { PgDialect } from "drizzle-orm/pg-core"
import { Effect, Option } from "effect"
import { Pool } from "pg"

import type { UserId } from "../../src/domain/SavedItem.js"
import { PublicProfileRepository } from "../../src/modules/profiles/PublicProfileRepository.js"
import { publicSavedItemFilter } from "../../src/modules/profiles/PublicSavedItems.js"
import {
  cleanTestDatabase,
  setupTestDatabase,
  testDatabaseUrl,
  withTestDatabaseUrl,
} from "../lib/postgres.js"

// No skip guard on purpose: which Saved Items a Public Profile counts, and the
// one-hour boundary that Postgres owns, are database rules. A missing database
// must fail this suite loudly instead of letting it pass empty.
//
// Every test asserts on the value this returns rather than inside the Effect,
// so an Effect that never ran cannot leave a test green with nothing checked.
const runIntegration = <A, E>(
  effect: Effect.Effect<A, E, PublicProfileRepository>,
) =>
  withTestDatabaseUrl(() =>
    Effect.runPromise(effect.pipe(Effect.provide(PublicProfileRepository.defaultLayer))),
  )

const findPublicByHandle = (handle: string) =>
  runIntegration(
    Effect.gen(function* () {
      const repo = yield* PublicProfileRepository
      return yield* repo.findPublicByHandle(handle)
    }),
  )

const withPool = async <A>(run: (pool: Pool) => Promise<A>) => {
  const pool = new Pool({ connectionString: testDatabaseUrl })
  try {
    return await run(pool)
  } finally {
    await pool.end()
  }
}

const insertUser = (userId: UserId, accountAgeDays: number) =>
  withPool((pool) =>
    pool.query(
      `
        insert into "user" (id, name, email, email_verified, created_at, updated_at)
        values ($1, $2, $3, true, now() - ($4 || ' days')::interval, now())
      `,
      [userId, "Integration User", `${userId}@example.com`, String(accountAgeDays)],
    ),
  )

const insertProfile = (
  userId: UserId,
  handle: string,
  visibility: "private" | "public",
) =>
  withPool((pool) =>
    pool.query(
      `insert into "profiles" (id, user_id, handle, visibility) values ($1, $2, $3, $4)`,
      [randomUUID(), userId, handle, visibility],
    ),
  )

const insertFolder = async (userId: UserId, name: string, isPrivate: boolean) => {
  const folderId = randomUUID()
  await withPool((pool) =>
    pool.query(
      `insert into "folders" (id, user_id, name, is_private) values ($1, $2, $3, $4)`,
      [folderId, userId, name, isPrivate],
    ),
  )
  return folderId
}

// One Saved Item with a chosen age, privacy, and Folder, written straight to
// Postgres so the row timestamps decide what the query sees.
const insertSavedItem = (
  userId: UserId,
  input: {
    readonly ageMinutes: number
    readonly isPrivate?: boolean
    readonly folderId?: string | null
  },
) =>
  withPool(async (pool) => {
    const linkId = randomUUID()
    const url = `https://example.com/${randomUUID()}`
    await pool.query(
      `insert into "links" (id, original_url, normalized_url, host) values ($1, $2, $2, $3)`,
      [linkId, url, "example.com"],
    )
    await pool.query(
      `
        insert into "saved_items" (id, user_id, link_id, folder_id, is_private, created_at)
        values ($1, $2, $3, $4, $5, now() - ($6 || ' minutes')::interval)
      `,
      [
        randomUUID(),
        userId,
        linkId,
        input.folderId ?? null,
        input.isPrivate ?? false,
        String(input.ageMinutes),
      ],
    )
  })

const setVisibility = (userId: UserId, visibility: "private" | "public") =>
  withPool((pool) =>
    pool.query(`update "profiles" set visibility = $2 where user_id = $1`, [
      userId,
      visibility,
    ]),
  )

// Runs the shared predicate on its own, the way the Saved Item list and the
// Reading Activity grid will: given an Account, count what a Public Profile may
// show. This is what pins the Profile Visibility clause, which the Handle
// lookup would otherwise make look redundant.
const dialect = new PgDialect()

const countThroughSharedFilter = (userId: UserId) =>
  withPool(async (pool) => {
    const query = dialect.sqlToQuery(publicSavedItemFilter(userId)!)
    const result = await pool.query(
      `select count(*)::int as count from "saved_items" where ${query.sql}`,
      query.params as unknown[],
    )
    return Number(result.rows[0].count)
  })

beforeAll(async () => {
  await setupTestDatabase()
})

beforeEach(async () => {
  await cleanTestDatabase()
})

describe("public profile integration flow", () => {
  test("counts only the Saved Items a Public Profile shows", async () => {
    const userId = `integration-user-${randomUUID()}` as UserId
    const handle = `reader-${randomUUID().slice(0, 8)}`
    await insertUser(userId, 40)
    await insertProfile(userId, handle, "public")

    const privateFolderId = await insertFolder(userId, "Private work", true)
    const publicFolderId = await insertFolder(userId, "Reading", false)

    // Counted.
    await insertSavedItem(userId, { ageMinutes: 120 })
    await insertSavedItem(userId, { ageMinutes: 120, folderId: publicFolderId })
    // Counted: just past the one-hour boundary Postgres owns.
    await insertSavedItem(userId, { ageMinutes: 61 })
    // Withheld: a Private Saved Item.
    await insertSavedItem(userId, { ageMinutes: 120, isPrivate: true })
    // Withheld: inside a Private Folder.
    await insertSavedItem(userId, { ageMinutes: 120, folderId: privateFolderId })
    // Withheld: still inside the first hour.
    await insertSavedItem(userId, { ageMinutes: 59 })
    await insertSavedItem(userId, { ageMinutes: 0 })

    const found = await findPublicByHandle(handle)

    expect(Option.isSome(found)).toBe(true)
    const profile = Option.getOrThrow(found)
    expect(profile.handle).toBe(handle)
    expect(profile.publicSavedItemCount).toBe(3)
  })

  test("counts nothing while another Account owns the Saved Items", async () => {
    const userId = `integration-user-${randomUUID()}` as UserId
    const otherUserId = `integration-user-${randomUUID()}` as UserId
    const handle = `reader-${randomUUID().slice(0, 8)}`
    await insertUser(userId, 40)
    await insertUser(otherUserId, 40)
    await insertProfile(userId, handle, "public")
    await insertProfile(otherUserId, `other-${handle}`, "public")

    await insertSavedItem(otherUserId, { ageMinutes: 120 })
    await insertSavedItem(otherUserId, { ageMinutes: 120 })

    const found = await findPublicByHandle(handle)

    expect(Option.getOrThrow(found).publicSavedItemCount).toBe(0)
  })

  test("gives nothing for a private Public Profile or an unknown Handle", async () => {
    const userId = `integration-user-${randomUUID()}` as UserId
    const handle = `reader-${randomUUID().slice(0, 8)}`
    await insertUser(userId, 40)
    await insertProfile(userId, handle, "private")
    await insertSavedItem(userId, { ageMinutes: 120 })

    const claimedButPrivate = await findPublicByHandle(handle)
    const unknown = await findPublicByHandle(`nobody-${randomUUID().slice(0, 8)}`)

    // The claimed Handle and the Handle nobody holds are indistinguishable
    // here, which is what lets the route answer both the same way.
    expect(Option.isNone(claimedButPrivate)).toBe(true)
    expect(Option.isNone(unknown)).toBe(true)
  })

  test("shows no Saved Item through the shared filter while Profile Visibility is private", async () => {
    const userId = `integration-user-${randomUUID()}` as UserId
    const handle = `reader-${randomUUID().slice(0, 8)}`
    await insertUser(userId, 40)
    await insertProfile(userId, handle, "private")
    await insertSavedItem(userId, { ageMinutes: 120 })
    await insertSavedItem(userId, { ageMinutes: 120 })

    const whilePrivate = await countThroughSharedFilter(userId)
    await setVisibility(userId, "public")
    const whilePublic = await countThroughSharedFilter(userId)

    expect(whilePrivate).toBe(0)
    expect(whilePublic).toBe(2)
  })

  test("resolves a Handle whatever case the request used", async () => {
    const userId = `integration-user-${randomUUID()}` as UserId
    const handle = `reader-${randomUUID().slice(0, 8)}`
    await insertUser(userId, 40)
    await insertProfile(userId, handle, "public")

    const found = await findPublicByHandle(handle.toUpperCase())

    expect(Option.getOrThrow(found).handle).toBe(handle)
  })

  test("reports the join date of the Account, not of the Public Profile record", async () => {
    const userId = `integration-user-${randomUUID()}` as UserId
    const handle = `reader-${randomUUID().slice(0, 8)}`
    // The Account is 40 days old; its Public Profile record is claimed now.
    await insertUser(userId, 40)
    await insertProfile(userId, handle, "public")

    const found = await findPublicByHandle(handle)

    const ageDays =
      (Date.now() - Option.getOrThrow(found).joinedAt.getTime()) / (24 * 60 * 60 * 1000)
    expect(ageDays).toBeGreaterThan(39.9)
    expect(ageDays).toBeLessThan(40.1)
  })
})
