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

const listPublicSavedItems = (
  handle: string,
  page: { readonly page: number; readonly pageSize: number },
) =>
  runIntegration(
    Effect.gen(function* () {
      const repo = yield* PublicProfileRepository
      return yield* repo.listPublicSavedItems(handle, page)
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
// Postgres so the row timestamps decide what the query sees. The Link gets its
// metadata and enrichment rows the way capture creates them, because the public
// list reads all three. Returns the Original URL, which is how a test recognizes
// the item in a published page.
const insertSavedItem = (
  userId: UserId,
  input: {
    readonly ageMinutes: number
    readonly isPrivate?: boolean
    readonly folderId?: string | null
    readonly path?: string
    readonly title?: string
    readonly previewSummary?: string
    readonly tags?: ReadonlyArray<string>
    readonly enrichmentTags?: ReadonlyArray<string>
    // Set it apart from the creation time to write what a Duplicate Save leaves
    // behind: the same row, saved again later.
    readonly lastSavedAgeMinutes?: number
  },
) =>
  withPool(async (pool) => {
    const linkId = randomUUID()
    const url = `https://example.com/${input.path ?? randomUUID()}`
    await pool.query(
      `insert into "links" (id, original_url, normalized_url, host) values ($1, $2, $2, $3)`,
      [linkId, url, "example.com"],
    )
    await pool.query(
      `insert into "link_metadata" (link_id, title, favicon_url, image_url) values ($1, $2, $3, $4)`,
      [
        linkId,
        input.title ?? null,
        `${url}/favicon.ico`,
        `${url}/cover.png`,
      ],
    )
    await pool.query(
      `
        insert into "link_enrichment" (link_id, type, tags, preview_summary, status)
        values ($1, 'article', $2, $3, 'enriched')
      `,
      [linkId, input.enrichmentTags ?? [], input.previewSummary ?? null],
    )
    await pool.query(
      `
        insert into "saved_items" (id, user_id, link_id, folder_id, is_private, tags, created_at, last_saved_at)
        values (
          $1, $2, $3, $4, $5, $6,
          now() - ($7 || ' minutes')::interval,
          now() - ($8 || ' minutes')::interval
        )
      `,
      [
        randomUUID(),
        userId,
        linkId,
        input.folderId ?? null,
        input.isPrivate ?? false,
        input.tags ?? [],
        String(input.ageMinutes),
        String(input.lastSavedAgeMinutes ?? input.ageMinutes),
      ],
    )
    return url
  })

const setVisibility = (userId: UserId, visibility: "private" | "public") =>
  withPool((pool) =>
    pool.query(`update "profiles" set visibility = $2 where user_id = $1`, [
      userId,
      visibility,
    ]),
  )

// Runs the shared filter on its own, the way the published count and the
// published page do: given an Account, count what a Public Profile may show.
// This is what pins the Profile Visibility clause, which the Handle lookup would
// otherwise make look redundant.
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

  test("lists only the Saved Items a Public Profile shows, newest first", async () => {
    const userId = `integration-user-${randomUUID()}` as UserId
    const handle = `reader-${randomUUID().slice(0, 8)}`
    await insertUser(userId, 40)
    await insertProfile(userId, handle, "public")

    const privateFolderId = await insertFolder(userId, "Private work", true)
    const publicFolderId = await insertFolder(userId, "Reading", false)

    // Published.
    const oldest = await insertSavedItem(userId, { ageMinutes: 240, path: "published-oldest" })
    const inPublicFolder = await insertSavedItem(userId, {
      ageMinutes: 120,
      folderId: publicFolderId,
      path: "published-in-a-folder",
    })
    // Published: just past the one-hour boundary Postgres owns.
    const justPastTheHour = await insertSavedItem(userId, {
      ageMinutes: 61,
      path: "published-just-past-the-hour",
    })
    // Withheld: a Private Saved Item.
    await insertSavedItem(userId, { ageMinutes: 120, isPrivate: true, path: "private-item" })
    // Withheld: inside a Private Folder.
    await insertSavedItem(userId, {
      ageMinutes: 120,
      folderId: privateFolderId,
      path: "in-a-private-folder",
    })
    // Withheld: still inside the first hour.
    await insertSavedItem(userId, { ageMinutes: 59, path: "inside-the-first-hour" })
    await insertSavedItem(userId, { ageMinutes: 0, path: "saved-just-now" })

    const page = Option.getOrThrow(
      await listPublicSavedItems(handle, { page: 1, pageSize: 50 }),
    )

    // Each withheld item is absent, with no placeholder standing in for it and
    // nothing counting it.
    expect(page.savedItems.map((item) => item.originalUrl)).toEqual([
      justPastTheHour,
      inPublicFolder,
      oldest,
    ])
    expect(page.totalCount).toBe(3)
  })

  test("withholds every Saved Item while Profile Visibility is private", async () => {
    const userId = `integration-user-${randomUUID()}` as UserId
    const handle = `reader-${randomUUID().slice(0, 8)}`
    await insertUser(userId, 40)
    await insertProfile(userId, handle, "private")
    await insertSavedItem(userId, { ageMinutes: 120 })

    const whilePrivate = await listPublicSavedItems(handle, { page: 1, pageSize: 50 })
    await setVisibility(userId, "public")
    const whilePublic = await listPublicSavedItems(handle, { page: 1, pageSize: 50 })

    // A private Public Profile has no page at all, which is what lets the route
    // answer it exactly like a Handle nobody holds.
    expect(Option.isNone(whilePrivate)).toBe(true)
    expect(Option.getOrThrow(whilePublic).savedItems.length).toBe(1)
  })

  test("gives an empty page, not a not-found, while a public Account publishes nothing", async () => {
    const userId = `integration-user-${randomUUID()}` as UserId
    const handle = `reader-${randomUUID().slice(0, 8)}`
    await insertUser(userId, 40)
    await insertProfile(userId, handle, "public")
    // Both are withheld, so the Account publishes nothing yet.
    await insertSavedItem(userId, { ageMinutes: 30 })
    await insertSavedItem(userId, { ageMinutes: 120, isPrivate: true })

    const page = Option.getOrThrow(
      await listPublicSavedItems(handle, { page: 1, pageSize: 50 }),
    )

    expect(page.savedItems).toEqual([])
    expect(page.totalCount).toBe(0)
  })

  test("gives no page for a Handle nobody holds", async () => {
    const unknown = await listPublicSavedItems(
      `nobody-${randomUUID().slice(0, 8)}`,
      { page: 1, pageSize: 50 },
    )

    expect(Option.isNone(unknown)).toBe(true)
  })

  test("keeps a Duplicate Save from reordering a published page", async () => {
    const userId = `integration-user-${randomUUID()}` as UserId
    const handle = `reader-${randomUUID().slice(0, 8)}`
    await insertUser(userId, 40)
    await insertProfile(userId, handle, "public")

    // Created three days ago and saved again a minute ago, the way Renewed
    // Intent leaves a row.
    const savedAgainJustNow = await insertSavedItem(userId, {
      ageMinutes: 3 * 24 * 60,
      lastSavedAgeMinutes: 1,
      path: "saved-again-just-now",
    })
    const createdLater = await insertSavedItem(userId, {
      ageMinutes: 120,
      path: "created-two-hours-ago",
    })

    const page = Option.getOrThrow(
      await listPublicSavedItems(handle, { page: 1, pageSize: 50 }),
    )

    // Creation time orders the page, so the Duplicate Save stays where it was.
    expect(page.savedItems.map((item) => item.originalUrl)).toEqual([
      createdLater,
      savedAgainJustNow,
    ])
  })

  test("reads a Public Profile one numbered page at a time", async () => {
    const userId = `integration-user-${randomUUID()}` as UserId
    const handle = `reader-${randomUUID().slice(0, 8)}`
    await insertUser(userId, 40)
    await insertProfile(userId, handle, "public")

    const fourth = await insertSavedItem(userId, { ageMinutes: 240, path: "page-item-4" })
    const third = await insertSavedItem(userId, { ageMinutes: 180, path: "page-item-3" })
    const second = await insertSavedItem(userId, { ageMinutes: 120, path: "page-item-2" })
    const first = await insertSavedItem(userId, { ageMinutes: 61, path: "page-item-1" })

    const pageOne = Option.getOrThrow(await listPublicSavedItems(handle, { page: 1, pageSize: 2 }))
    const pageTwo = Option.getOrThrow(await listPublicSavedItems(handle, { page: 2, pageSize: 2 }))
    const pageThree = Option.getOrThrow(await listPublicSavedItems(handle, { page: 3, pageSize: 2 }))

    // Consecutive windows over one order: nothing repeats and nothing is skipped.
    expect(pageOne.savedItems.map((item) => item.originalUrl)).toEqual([first, second])
    expect(pageTwo.savedItems.map((item) => item.originalUrl)).toEqual([third, fourth])
    expect(pageThree.savedItems).toEqual([])
    expect([pageOne.totalCount, pageTwo.totalCount, pageThree.totalCount]).toEqual([4, 4, 4])
  })

  test("publishes the Saved Metadata and Effective Tags of a listed Saved Item", async () => {
    const userId = `integration-user-${randomUUID()}` as UserId
    const handle = `reader-${randomUUID().slice(0, 8)}`
    await insertUser(userId, 40)
    await insertProfile(userId, handle, "public")

    const ownTags = await insertSavedItem(userId, {
      ageMinutes: 61,
      path: "with-saved-item-tags",
      title: "Saved Item Tags win",
      previewSummary: "One sentence a visitor reads before opening the Link.",
      tags: ["backend"],
      enrichmentTags: ["tools"],
    })
    const enrichedTags = await insertSavedItem(userId, {
      ageMinutes: 120,
      path: "with-enrichment-tags-only",
      title: "Enrichment Tags stand in",
      enrichmentTags: ["design"],
    })

    const page = Option.getOrThrow(
      await listPublicSavedItems(handle, { page: 1, pageSize: 50 }),
    )

    const { savedAt, ...published } = page.savedItems[0]!
    expect(published).toEqual({
      originalUrl: ownTags,
      host: "example.com",
      title: "Saved Item Tags win",
      faviconUrl: `${ownTags}/favicon.ico`,
      faviconLightUrl: undefined,
      faviconDarkUrl: undefined,
      imageUrl: `${ownTags}/cover.png`,
      type: "article",
      // Saved Item Tags win over Enrichment Tags.
      tags: ["backend"],
      previewSummary: "One sentence a visitor reads before opening the Link.",
    })
    // The save date is the row's creation time, which is also why this item is
    // past the one-hour boundary.
    const savedMinutesAgo = (Date.now() - savedAt.getTime()) / 60_000
    expect(savedMinutesAgo).toBeGreaterThan(60)
    expect(savedMinutesAgo).toBeLessThan(62)
    expect(page.savedItems[1]?.originalUrl).toBe(enrichedTags)
    expect(page.savedItems[1]?.tags).toEqual(["design"])
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
