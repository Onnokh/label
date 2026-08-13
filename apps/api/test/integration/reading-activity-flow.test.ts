import { beforeAll, beforeEach, describe, expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { PgDialect } from "drizzle-orm/pg-core"
import { Effect, Layer, Option } from "effect"
import { Pool } from "pg"

import type { UserId } from "../../src/domain/SavedItem.js"
import { CaptureService } from "../../src/modules/capture/CaptureService.js"
import { PublicProfileRepository } from "../../src/modules/profiles/PublicProfileRepository.js"
import {
  READING_ACTIVITY_DAYS,
  readingActivityDayText,
} from "../../src/modules/profiles/ReadingActivity.js"
import {
  cleanTestDatabase,
  setupTestDatabase,
  testDatabaseUrl,
  withTestDatabaseUrl,
} from "../lib/postgres.js"

// No skip guard on purpose: which day a save lands in, how far back the window
// reaches, and what a Duplicate Save leaves alone are all Postgres rules. A
// missing database must fail this suite loudly instead of letting it pass empty.
//
// Every test asserts on the value the run returns rather than inside the Effect,
// so an Effect that never ran cannot leave a test green with nothing checked.
const persistenceLayer = Layer.mergeAll(
  CaptureService.defaultLayer,
  PublicProfileRepository.defaultLayer,
)

const runIntegration = <A, E>(
  effect: Effect.Effect<A, E, CaptureService | PublicProfileRepository>,
) =>
  withTestDatabaseUrl(() =>
    Effect.runPromise(effect.pipe(Effect.provide(persistenceLayer))),
  )

const findReadingActivity = (handle: string) =>
  runIntegration(
    Effect.gen(function* () {
      const repo = yield* PublicProfileRepository
      return yield* repo.findReadingActivity(handle)
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

// One Saved Item created at a chosen instant, written straight to Postgres so
// the row timestamp decides which day the save lands in.
const insertSavedItemAt = (
  userId: UserId,
  createdAt: Date,
  input: {
    readonly isPrivate?: boolean
    readonly folderId?: string | null
  } = {},
) =>
  withPool(async (pool) => {
    const linkId = randomUUID()
    const savedItemId = randomUUID()
    const url = `https://example.com/${randomUUID()}`
    await pool.query(
      `insert into "links" (id, original_url, normalized_url, host) values ($1, $2, $2, $3)`,
      [linkId, url, "example.com"],
    )
    await pool.query(
      `
        insert into "saved_items" (id, user_id, link_id, folder_id, is_private, created_at, last_saved_at)
        values ($1, $2, $3, $4, $5, $6, $6)
      `,
      [
        savedItemId,
        userId,
        linkId,
        input.folderId ?? null,
        input.isPrivate ?? false,
        createdAt.toISOString(),
      ],
    )
    return savedItemId
  })

// Moves an existing Saved Item into the past, both timestamps together, so a
// later Duplicate Save is the only thing that touches Last Saved At.
const backdateSavedItem = (savedItemId: string, createdAt: Date) =>
  withPool((pool) =>
    pool.query(
      `update "saved_items" set created_at = $2, last_saved_at = $2 where id = $1`,
      [savedItemId, createdAt.toISOString()],
    ),
  )

const countSavedItems = (userId: UserId) =>
  withPool(async (pool) => {
    const result = await pool.query(
      `select count(*)::int as count from "saved_items" where user_id = $1`,
      [userId],
    )
    return Number(result.rows[0].count)
  })

// Runs the exported day expression under a session timezone fourteen hours ahead
// of UTC. A save at 23:30 UTC is already tomorrow there, so this fails the moment
// the bucket stops naming UTC explicitly.
const dialect = new PgDialect()

const dayTextInSessionTimeZone = (savedItemId: string, timeZone: string) =>
  withPool(async (pool) => {
    const client = await pool.connect()
    try {
      await client.query(`set time zone '${timeZone}'`)
      const query = dialect.sqlToQuery(readingActivityDayText)
      const result = await client.query(
        `select ${query.sql} as date from "saved_items" where id = $1`,
        [savedItemId, ...(query.params as unknown[])],
      )
      return result.rows[0].date as string
    } finally {
      client.release()
    }
  })

const DAY_MS = 24 * 60 * 60 * 1000

// The UTC day the run started in. Every expectation is built from this one read,
// so the window the test expects is the window Postgres computes.
const utcMidnightToday = () => {
  const now = new Date()
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  )
}

const daysBefore = (day: Date, days: number) => new Date(day.getTime() - days * DAY_MS)

const at = (day: Date, hours: number, minutes: number) =>
  new Date(day.getTime() + hours * 60 * 60 * 1000 + minutes * 60 * 1000)

const dayText = (instant: Date) => instant.toISOString().slice(0, 10)

const totalCount = (days: ReadonlyArray<{ readonly count: number }>) =>
  days.reduce((total, day) => total + day.count, 0)

beforeAll(async () => {
  await setupTestDatabase()
})

beforeEach(async () => {
  await cleanTestDatabase()
})

describe("reading activity integration flow", () => {
  test("buckets each save by its UTC creation day", async () => {
    const userId = `integration-user-${randomUUID()}` as UserId
    const handle = `reader-${randomUUID().slice(0, 8)}`
    await insertUser(userId)
    await insertProfile(userId, handle, "public")

    const firstDay = daysBefore(utcMidnightToday(), 10)
    const secondDay = daysBefore(utcMidnightToday(), 9)

    // Half an hour before and half an hour after the same UTC midnight: two
    // saves an hour apart that belong to different days.
    const lateSavedItemId = await insertSavedItemAt(userId, at(firstDay, 23, 30))
    await insertSavedItemAt(userId, at(firstDay, 0, 5))
    await insertSavedItemAt(userId, at(secondDay, 0, 30))

    const found = await findReadingActivity(handle)
    const lateDayInFarZone = await dayTextInSessionTimeZone(
      lateSavedItemId,
      "Pacific/Kiritimati",
    )

    expect(Option.isSome(found)).toBe(true)
    const activity = Option.getOrThrow(found)
    expect(activity.handle).toBe(handle)
    expect(activity.days).toEqual([
      { date: dayText(firstDay), count: 2 },
      { date: dayText(secondDay), count: 1 },
    ])
    // The caller's session timezone changes nothing: the day is a UTC day.
    expect(lateDayInFarZone).toBe(dayText(firstDay))
  })

  test("reports a rolling 52-week window and drops the saves before it", async () => {
    const userId = `integration-user-${randomUUID()}` as UserId
    const handle = `reader-${randomUUID().slice(0, 8)}`
    await insertUser(userId)
    await insertProfile(userId, handle, "public")

    const today = utcMidnightToday()
    const windowStart = daysBefore(today, READING_ACTIVITY_DAYS - 1)

    // One hour inside the window, and one hour before it.
    await insertSavedItemAt(userId, at(windowStart, 1, 0))
    await insertSavedItemAt(userId, at(daysBefore(windowStart, 1), 23, 0))
    await insertSavedItemAt(userId, daysBefore(today, 400))

    const found = await findReadingActivity(handle)

    const activity = Option.getOrThrow(found)
    expect(activity.from).toBe(dayText(windowStart))
    expect(activity.to).toBe(dayText(today))
    expect(activity.days).toEqual([{ date: dayText(windowStart), count: 1 }])
  })

  test("counts a Duplicate Save on no day at all", async () => {
    const userId = `integration-user-${randomUUID()}` as UserId
    const handle = `reader-${randomUUID().slice(0, 8)}`
    const url = `https://example.com/articles/renewed-${randomUUID()}`
    await insertUser(userId)
    await insertProfile(userId, handle, "public")

    const firstCaptureDay = daysBefore(utcMidnightToday(), 10)

    const savedItemId = await runIntegration(
      Effect.gen(function* () {
        const capture = yield* CaptureService
        const created = yield* capture.save({ userId, url })
        expect(created.captureResult).toBe("created")
        return created.savedItem.savedItem.id
      }),
    )
    // The first capture happened ten days ago, so a count that moved to today
    // could not hide in the same bucket.
    await backdateSavedItem(savedItemId, at(firstCaptureDay, 9, 0))

    const duplicated = await runIntegration(
      Effect.gen(function* () {
        const capture = yield* CaptureService
        const again = yield* capture.save({ userId, url })
        return again.captureResult
      }),
    )

    const found = await findReadingActivity(handle)
    const rows = await countSavedItems(userId)

    // A Duplicate Save rewrites Last Saved At on the row it found and inserts
    // nothing, so the count stays on the day of the first capture and today has
    // none. Bucketing by Last Saved At would move it here.
    expect(duplicated).toBe("updated")
    expect(rows).toBe(1)
    const activity = Option.getOrThrow(found)
    expect(activity.days).toEqual([{ date: dayText(firstCaptureDay), count: 1 }])
    expect(activity.to).toBe(dayText(utcMidnightToday()))
  })

  test("counts the Saved Items the item list withholds", async () => {
    const userId = `integration-user-${randomUUID()}` as UserId
    const handle = `reader-${randomUUID().slice(0, 8)}`
    await insertUser(userId)
    await insertProfile(userId, handle, "public")

    const privateFolderId = await insertFolder(userId, "Private work", true)
    const savedDay = daysBefore(utcMidnightToday(), 3)
    const savedMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)

    await insertSavedItemAt(userId, at(savedDay, 12, 0), { isPrivate: true })
    await insertSavedItemAt(userId, at(savedDay, 13, 0), { folderId: privateFolderId })
    await insertSavedItemAt(userId, savedMinutesAgo)

    const activity = Option.getOrThrow(await findReadingActivity(handle))
    const profile = Option.getOrThrow(
      await runIntegration(
        Effect.gen(function* () {
          const repo = yield* PublicProfileRepository
          return yield* repo.findPublicByHandle(handle)
        }),
      ),
    )

    // A Private Saved Item, a Saved Item inside a Private Folder, and a save from
    // the last hour: the grid counts all three while the item list shows none of
    // them. The grid may therefore show a save today and the list none.
    expect(totalCount(activity.days)).toBe(3)
    expect(activity.days).toEqual([
      { date: dayText(savedDay), count: 2 },
      { date: dayText(savedMinutesAgo), count: 1 },
    ])
    expect(profile.publicSavedItemCount).toBe(0)
  })

  test("counts nothing while another Account owns the saves", async () => {
    const userId = `integration-user-${randomUUID()}` as UserId
    const otherUserId = `integration-user-${randomUUID()}` as UserId
    const handle = `reader-${randomUUID().slice(0, 8)}`
    await insertUser(userId)
    await insertUser(otherUserId)
    await insertProfile(userId, handle, "public")
    await insertProfile(otherUserId, `other-${handle}`, "public")

    await insertSavedItemAt(otherUserId, daysBefore(utcMidnightToday(), 2))

    const found = await findReadingActivity(handle)

    // A public Account with no save of its own still answers, with an empty grid
    // rather than a not-found.
    const activity = Option.getOrThrow(found)
    expect(activity.days).toEqual([])
  })

  test("gives nothing for a private Public Profile or an unknown Handle", async () => {
    const userId = `integration-user-${randomUUID()}` as UserId
    const handle = `reader-${randomUUID().slice(0, 8)}`
    await insertUser(userId)
    await insertProfile(userId, handle, "private")
    await insertSavedItemAt(userId, daysBefore(utcMidnightToday(), 2))

    const claimedButPrivate = await findReadingActivity(handle)
    const unknown = await findReadingActivity(`nobody-${randomUUID().slice(0, 8)}`)

    // Profile Visibility is the one part of the public predicate the grid keeps,
    // and it makes the two Handles indistinguishable here.
    expect(Option.isNone(claimedButPrivate)).toBe(true)
    expect(Option.isNone(unknown)).toBe(true)
  })

  test("resolves a Handle whatever case the request used", async () => {
    const userId = `integration-user-${randomUUID()}` as UserId
    const handle = `reader-${randomUUID().slice(0, 8)}`
    await insertUser(userId)
    await insertProfile(userId, handle, "public")
    await insertSavedItemAt(userId, daysBefore(utcMidnightToday(), 1))

    const found = await findReadingActivity(handle.toUpperCase())

    expect(Option.getOrThrow(found).handle).toBe(handle)
  })
})
