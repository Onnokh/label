import { beforeAll, beforeEach, describe, expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { PgDialect } from "drizzle-orm/pg-core"
import { Effect, Option } from "effect"
import { Pool } from "pg"

import type { FolderId, UserId } from "../../src/domain/SavedItem.js"
import { FolderRepository } from "../../src/modules/folders/FolderRepository.js"
import { PublicProfileRepository } from "../../src/modules/profiles/PublicProfileRepository.js"
import { publicSavedItemFilter } from "../../src/modules/profiles/PublicSavedItems.js"
import {
  cleanTestDatabase,
  setupTestDatabase,
  testDatabaseUrl,
  withTestDatabaseUrl,
} from "../lib/postgres.js"

// No skip guard on purpose: which Saved Items a Public Profile shows is a
// database rule, and so is what a Folder row defaults to. A missing database
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

const runFolders = <A, E>(effect: Effect.Effect<A, E, FolderRepository>) =>
  withTestDatabaseUrl(() =>
    Effect.runPromise(effect.pipe(Effect.provide(FolderRepository.defaultLayer))),
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

const listIndexableProfiles = (
  page: { readonly page: number; readonly pageSize: number } = { page: 1, pageSize: 50 },
) =>
  runIntegration(
    Effect.gen(function* () {
      const repo = yield* PublicProfileRepository
      return yield* repo.listIndexableProfiles(page)
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

const insertFolder = async (userId: UserId, name: string, isPublished: boolean) => {
  const folderId = randomUUID()
  await withPool((pool) =>
    pool.query(
      `insert into "folders" (id, user_id, name, is_published) values ($1, $2, $3, $4)`,
      [folderId, userId, name, isPublished],
    ),
  )
  return folderId
}

const setFolderPublished = (folderId: string, isPublished: boolean) =>
  withPool((pool) =>
    pool.query(`update "folders" set is_published = $2 where id = $1`, [
      folderId,
      isPublished,
    ]),
  )

// One Saved Item with a chosen age and Folder, written straight to Postgres so
// the row itself decides what the query sees. `folderId` is the whole audience
// rule: omit it and the Saved Item is in no Folder, which never publishes. The
// Link gets its metadata and enrichment rows the way capture creates them,
// because the public list reads all three. Returns the Original URL, which is
// how a test recognizes the item in a published page.
const insertSavedItem = (
  userId: UserId,
  input: {
    readonly ageMinutes: number
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
        insert into "saved_items" (id, user_id, link_id, folder_id, tags, created_at, last_saved_at)
        values (
          $1, $2, $3, $4, $5,
          now() - ($6 || ' minutes')::interval,
          now() - ($7 || ' minutes')::interval
        )
      `,
      [
        randomUUID(),
        userId,
        linkId,
        input.folderId ?? null,
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
  test("counts only the Saved Items inside a Published Folder", async () => {
    const userId = `integration-user-${randomUUID()}` as UserId
    const handle = `reader-${randomUUID().slice(0, 8)}`
    await insertUser(userId, 40)
    await insertProfile(userId, handle, "public")

    const publishedFolderId = await insertFolder(userId, "Reading", true)
    const unpublishedFolderId = await insertFolder(userId, "Private work", false)

    // Counted: inside a Published Folder.
    await insertSavedItem(userId, { ageMinutes: 120, folderId: publishedFolderId })
    await insertSavedItem(userId, { ageMinutes: 61, folderId: publishedFolderId })
    // Counted the moment it lands: publishing the Folder was the decision, so
    // there is no delay left to wait out.
    await insertSavedItem(userId, { ageMinutes: 0, folderId: publishedFolderId })
    // Withheld: inside a Folder nobody published.
    await insertSavedItem(userId, { ageMinutes: 120, folderId: unpublishedFolderId })
    // Withheld: in no Folder at all.
    await insertSavedItem(userId, { ageMinutes: 120 })
    await insertSavedItem(userId, { ageMinutes: 0 })

    const found = await findPublicByHandle(handle)

    expect(Option.isSome(found)).toBe(true)
    const profile = Option.getOrThrow(found)
    expect(profile.handle).toBe(handle)
    expect(profile.publicSavedItemCount).toBe(3)
  })

  // The clause a null `folder_id` must never satisfy. A capture that files
  // nothing publishes nothing, whatever the Account's other Folders say.
  test("never publishes a Saved Item that is in no Folder", async () => {
    const userId = `integration-user-${randomUUID()}` as UserId
    const handle = `reader-${randomUUID().slice(0, 8)}`
    await insertUser(userId, 40)
    await insertProfile(userId, handle, "public")

    // The Account has a Published Folder, so the Profile Visibility clause and
    // the Published Folder clause both have something to match. Only the item's
    // own missing Folder keeps it off the page.
    const publishedFolderId = await insertFolder(userId, "Reading", true)
    const filed = await insertSavedItem(userId, {
      ageMinutes: 120,
      folderId: publishedFolderId,
      path: "filed-in-a-published-folder",
    })
    await insertSavedItem(userId, { ageMinutes: 120, path: "filed-nowhere" })
    await insertSavedItem(userId, { ageMinutes: 120, folderId: null, path: "filed-nowhere-too" })

    const counted = await countThroughSharedFilter(userId)
    const page = Option.getOrThrow(
      await listPublicSavedItems(handle, { page: 1, pageSize: 50 }),
    )

    expect(counted).toBe(1)
    expect(page.savedItems.map((item) => item.originalUrl)).toEqual([filed])
  })

  test("counts nothing while another Account owns the Saved Items", async () => {
    const userId = `integration-user-${randomUUID()}` as UserId
    const otherUserId = `integration-user-${randomUUID()}` as UserId
    const handle = `reader-${randomUUID().slice(0, 8)}`
    await insertUser(userId, 40)
    await insertUser(otherUserId, 40)
    await insertProfile(userId, handle, "public")
    await insertProfile(otherUserId, `other-${handle}`, "public")

    const otherFolderId = await insertFolder(otherUserId, "Reading", true)
    await insertSavedItem(otherUserId, { ageMinutes: 120, folderId: otherFolderId })
    await insertSavedItem(otherUserId, { ageMinutes: 120, folderId: otherFolderId })

    const found = await findPublicByHandle(handle)

    expect(Option.getOrThrow(found).publicSavedItemCount).toBe(0)
  })

  test("gives nothing for a private Public Profile or an unknown Handle", async () => {
    const userId = `integration-user-${randomUUID()}` as UserId
    const handle = `reader-${randomUUID().slice(0, 8)}`
    await insertUser(userId, 40)
    await insertProfile(userId, handle, "private")
    const folderId = await insertFolder(userId, "Reading", true)
    await insertSavedItem(userId, { ageMinutes: 120, folderId })

    const claimedButPrivate = await findPublicByHandle(handle)
    const unknown = await findPublicByHandle(`nobody-${randomUUID().slice(0, 8)}`)

    // The claimed Handle and the Handle nobody holds are indistinguishable
    // here, which is what lets the route answer both the same way.
    expect(Option.isNone(claimedButPrivate)).toBe(true)
    expect(Option.isNone(unknown)).toBe(true)
  })

  // The clause that a Published Folder alone must not be able to satisfy.
  test("shows no Saved Item through the shared filter while Profile Visibility is private", async () => {
    const userId = `integration-user-${randomUUID()}` as UserId
    const handle = `reader-${randomUUID().slice(0, 8)}`
    await insertUser(userId, 40)
    await insertProfile(userId, handle, "private")
    const folderId = await insertFolder(userId, "Reading", true)
    await insertSavedItem(userId, { ageMinutes: 120, folderId })
    await insertSavedItem(userId, { ageMinutes: 120, folderId })

    const whilePrivate = await countThroughSharedFilter(userId)
    await setVisibility(userId, "public")
    const whilePublic = await countThroughSharedFilter(userId)

    expect(whilePrivate).toBe(0)
    expect(whilePublic).toBe(2)
  })

  // Unpublishing is how an Account withdraws content, so it has to bite at
  // once. Nothing is denormalized onto the Saved Item rows that could lag.
  test("withdraws the Saved Items of a Folder the moment it is unpublished", async () => {
    const userId = `integration-user-${randomUUID()}` as UserId
    const handle = `reader-${randomUUID().slice(0, 8)}`
    await insertUser(userId, 40)
    await insertProfile(userId, handle, "public")
    const folderId = await insertFolder(userId, "Reading", true)
    await insertSavedItem(userId, { ageMinutes: 120, folderId })
    await insertSavedItem(userId, { ageMinutes: 120, folderId })

    const whilePublished = await countThroughSharedFilter(userId)
    await setFolderPublished(folderId, false)
    const afterWithdrawal = await countThroughSharedFilter(userId)
    await setFolderPublished(folderId, true)
    const afterRepublishing = await countThroughSharedFilter(userId)

    expect(whilePublished).toBe(2)
    expect(afterWithdrawal).toBe(0)
    expect(afterRepublishing).toBe(2)
  })

  test("resolves a Handle whatever case the request used", async () => {
    const userId = `integration-user-${randomUUID()}` as UserId
    const handle = `reader-${randomUUID().slice(0, 8)}`
    await insertUser(userId, 40)
    await insertProfile(userId, handle, "public")

    const found = await findPublicByHandle(handle.toUpperCase())

    expect(Option.getOrThrow(found).handle).toBe(handle)
  })

  test("lists only the Saved Items inside a Published Folder, newest first", async () => {
    const userId = `integration-user-${randomUUID()}` as UserId
    const handle = `reader-${randomUUID().slice(0, 8)}`
    await insertUser(userId, 40)
    await insertProfile(userId, handle, "public")

    const publishedFolderId = await insertFolder(userId, "Reading", true)
    const unpublishedFolderId = await insertFolder(userId, "Private work", false)

    // Published.
    const oldest = await insertSavedItem(userId, {
      ageMinutes: 240,
      folderId: publishedFolderId,
      path: "published-oldest",
    })
    const middle = await insertSavedItem(userId, {
      ageMinutes: 120,
      folderId: publishedFolderId,
      path: "published-middle",
    })
    // Published the moment it is saved, because the Folder was published first.
    const justNow = await insertSavedItem(userId, {
      ageMinutes: 0,
      folderId: publishedFolderId,
      path: "published-just-now",
    })
    // Withheld: inside a Folder nobody published.
    await insertSavedItem(userId, {
      ageMinutes: 120,
      folderId: unpublishedFolderId,
      path: "in-an-unpublished-folder",
    })
    // Withheld: in no Folder at all.
    await insertSavedItem(userId, { ageMinutes: 180, path: "filed-nowhere" })

    const page = Option.getOrThrow(
      await listPublicSavedItems(handle, { page: 1, pageSize: 50 }),
    )

    // Each withheld item is absent, with no placeholder standing in for it and
    // nothing counting it.
    expect(page.savedItems.map((item) => item.originalUrl)).toEqual([
      justNow,
      middle,
      oldest,
    ])
    expect(page.totalCount).toBe(3)
  })

  test("withholds every Saved Item while Profile Visibility is private", async () => {
    const userId = `integration-user-${randomUUID()}` as UserId
    const handle = `reader-${randomUUID().slice(0, 8)}`
    await insertUser(userId, 40)
    await insertProfile(userId, handle, "private")
    const folderId = await insertFolder(userId, "Reading", true)
    await insertSavedItem(userId, { ageMinutes: 120, folderId })

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
    // Turning the profile on publishes nothing by itself: both of these are
    // withheld until a Folder is published.
    const unpublishedFolderId = await insertFolder(userId, "Reading", false)
    await insertSavedItem(userId, { ageMinutes: 120, folderId: unpublishedFolderId })
    await insertSavedItem(userId, { ageMinutes: 120 })

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
    const folderId = await insertFolder(userId, "Reading", true)

    // Created three days ago and saved again a minute ago, the way Renewed
    // Intent leaves a row.
    const savedAgainJustNow = await insertSavedItem(userId, {
      ageMinutes: 3 * 24 * 60,
      lastSavedAgeMinutes: 1,
      folderId,
      path: "saved-again-just-now",
    })
    const createdLater = await insertSavedItem(userId, {
      ageMinutes: 120,
      folderId,
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
    const folderId = await insertFolder(userId, "Reading", true)

    const fourth = await insertSavedItem(userId, { ageMinutes: 240, folderId, path: "page-item-4" })
    const third = await insertSavedItem(userId, { ageMinutes: 180, folderId, path: "page-item-3" })
    const second = await insertSavedItem(userId, { ageMinutes: 120, folderId, path: "page-item-2" })
    const first = await insertSavedItem(userId, { ageMinutes: 61, folderId, path: "page-item-1" })

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
    const folderId = await insertFolder(userId, "Reading", true)

    const ownTags = await insertSavedItem(userId, {
      ageMinutes: 61,
      folderId,
      path: "with-saved-item-tags",
      title: "Saved Item Tags win",
      previewSummary: "One sentence a visitor reads before opening the Link.",
      tags: ["backend"],
      enrichmentTags: ["tools"],
    })
    const enrichedTags = await insertSavedItem(userId, {
      ageMinutes: 120,
      folderId,
      path: "with-enrichment-tags-only",
      title: "Enrichment Tags stand in",
      enrichmentTags: ["design"],
    })

    const page = Option.getOrThrow(
      await listPublicSavedItems(handle, { page: 1, pageSize: 50 }),
    )

    // The Folder that published this item is itself withheld: a visitor learns
    // nothing about how the Account files things.
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
    // The save date is the row's creation time, not when it was saved again.
    const savedMinutesAgo = (Date.now() - savedAt.getTime()) / 60_000
    expect(savedMinutesAgo).toBeGreaterThan(60)
    expect(savedMinutesAgo).toBeLessThan(62)
    expect(page.savedItems[1]?.originalUrl).toBe(enrichedTags)
    expect(page.savedItems[1]?.tags).toEqual(["design"])
  })

  // A public Account with enough published Saved Items to be worth indexing,
  // built from the numbers the rule uses rather than from a magic constant.
  const publishAccount = async (input: {
    readonly handle: string
    readonly accountAgeDays: number
    readonly publishedCount: number
  }) => {
    const userId = `integration-user-${randomUUID()}` as UserId
    await insertUser(userId, input.accountAgeDays)
    await insertProfile(userId, input.handle, "public")
    const folderId = await insertFolder(userId, "Reading", true)
    for (let index = 0; index < input.publishedCount; index += 1) {
      await insertSavedItem(userId, { ageMinutes: 61 + index * 60, folderId })
    }
    return userId
  }

  test("lists only the Public Profiles a search engine may index", async () => {
    const indexable = `a-indexable-${randomUUID().slice(0, 8)}`
    const tooFewItems = `b-too-few-${randomUUID().slice(0, 8)}`
    const tooYoung = `c-too-young-${randomUUID().slice(0, 8)}`
    const notPublic = `d-not-public-${randomUUID().slice(0, 8)}`

    await publishAccount({ handle: indexable, accountAgeDays: 40, publishedCount: 5 })

    // Four published Saved Items, plus two the Public Profile withholds. The
    // withheld ones would tip the count over the line if they counted, which is
    // what pins the shared filter to this rule.
    const shortUserId = await publishAccount({
      handle: tooFewItems,
      accountAgeDays: 40,
      publishedCount: 4,
    })
    const shortUnpublishedFolderId = await insertFolder(shortUserId, "Private work", false)
    await insertSavedItem(shortUserId, { ageMinutes: 120, folderId: shortUnpublishedFolderId })
    await insertSavedItem(shortUserId, { ageMinutes: 120 })

    await publishAccount({ handle: tooYoung, accountAgeDays: 6, publishedCount: 12 })

    // Old enough and full enough, but Profile Visibility is private.
    const privateUserId = `integration-user-${randomUUID()}` as UserId
    await insertUser(privateUserId, 40)
    await insertProfile(privateUserId, notPublic, "private")
    const privateFolderId = await insertFolder(privateUserId, "Reading", true)
    for (let index = 0; index < 12; index += 1) {
      await insertSavedItem(privateUserId, {
        ageMinutes: 61 + index * 60,
        folderId: privateFolderId,
      })
    }

    const page = await listIndexableProfiles()

    // Each of the other three is absent, with nothing standing in for it.
    expect(page.profiles.map((profile) => profile.handle)).toEqual([indexable])
    expect(page.totalCount).toBe(1)
  })

  test("dates a listed Public Profile by its newest published Saved Item", async () => {
    const handle = `reader-${randomUUID().slice(0, 8)}`
    const userId = `integration-user-${randomUUID()}` as UserId
    await insertUser(userId, 40)
    await insertProfile(userId, handle, "public")
    const publishedFolderId = await insertFolder(userId, "Reading", true)
    const unpublishedFolderId = await insertFolder(userId, "Private work", false)

    // Four published Saved Items, the oldest of them saved again a minute ago
    // the way Renewed Intent leaves a row.
    await insertSavedItem(userId, {
      ageMinutes: 300,
      lastSavedAgeMinutes: 1,
      folderId: publishedFolderId,
    })
    await insertSavedItem(userId, { ageMinutes: 240, folderId: publishedFolderId })
    await insertSavedItem(userId, { ageMinutes: 180, folderId: publishedFolderId })
    await insertSavedItem(userId, { ageMinutes: 120, folderId: publishedFolderId })
    // The newest published one: this is when the page last changed.
    await insertSavedItem(userId, { ageMinutes: 61, folderId: publishedFolderId })
    // Newer, and withheld: one inside a Folder nobody published and one in no
    // Folder at all change nothing a crawler can see.
    await insertSavedItem(userId, { ageMinutes: 45, folderId: unpublishedFolderId })
    await insertSavedItem(userId, { ageMinutes: 5 })

    const page = await listIndexableProfiles()

    const [profile] = page.profiles
    expect(profile?.handle).toBe(handle)
    const changedMinutesAgo = (Date.now() - profile!.lastModifiedAt.getTime()) / 60_000
    // The 61-minute-old published item, not the 5-minute-old withheld one and
    // not the Duplicate Save a minute ago.
    expect(changedMinutesAgo).toBeGreaterThan(60)
    expect(changedMinutesAgo).toBeLessThan(62)
  })

  test("reads the indexable listing one numbered page at a time", async () => {
    const first = `a-reader-${randomUUID().slice(0, 8)}`
    const second = `b-reader-${randomUUID().slice(0, 8)}`
    await publishAccount({ handle: first, accountAgeDays: 40, publishedCount: 5 })
    await publishAccount({ handle: second, accountAgeDays: 40, publishedCount: 5 })

    const pageOne = await listIndexableProfiles({ page: 1, pageSize: 1 })
    const pageTwo = await listIndexableProfiles({ page: 2, pageSize: 1 })
    const pageThree = await listIndexableProfiles({ page: 3, pageSize: 1 })

    // Consecutive windows over one order: nothing repeats and nothing is
    // skipped between the pages a crawler walks.
    expect(pageOne.profiles.map((profile) => profile.handle)).toEqual([first])
    expect(pageTwo.profiles.map((profile) => profile.handle)).toEqual([second])
    expect(pageThree.profiles).toEqual([])
    expect([pageOne.totalCount, pageTwo.totalCount, pageThree.totalCount]).toEqual([2, 2, 2])
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

  // The write side of the same rule. A Folder is the only thing that publishes
  // a Saved Item, so what its flag defaults to and what a partial update leaves
  // alone belong beside the query that reads it.
  test("leaves a Folder unpublished when a row is written without the flag", async () => {
    const userId = `integration-user-${randomUUID()}` as UserId
    const folderId = randomUUID()
    await insertUser(userId, 40)

    // Written the way a row existed before the column was added: the database,
    // not the application, decides that an unclaimed Folder publishes nothing.
    const isPublished = await withPool(async (pool) => {
      await pool.query(
        `insert into "folders" (id, user_id, name) values ($1, $2, $3)`,
        [folderId, userId, "Legacy"],
      )
      const row = await pool.query(
        `select is_published from "folders" where id = $1`,
        [folderId],
      )
      return row.rows[0]?.is_published
    })

    expect(isPublished).toBe(false)
  })

  test("publishes a Folder and leaves the flag alone on a name-only update", async () => {
    const userId = `integration-user-${randomUUID()}` as UserId
    await insertUser(userId, 40)

    const states = await runFolders(
      Effect.gen(function* () {
        const repo = yield* FolderRepository

        const created = yield* repo.create(userId, "Research", null, null)
        if (Option.isNone(created)) throw new Error("expected the Folder to be created")
        const folderId: FolderId = created.value.id

        const published = yield* repo.update(userId, folderId, { isPublished: true })
        if (Option.isNone(published)) throw new Error("expected the Folder to be updated")

        // A name-only caller never withdraws a Published Folder.
        const renamed = yield* repo.update(userId, folderId, { name: "Reading" })
        if (Option.isNone(renamed)) throw new Error("expected the Folder to be renamed")

        const withdrawn = yield* repo.update(userId, folderId, { isPublished: false })
        if (Option.isNone(withdrawn)) throw new Error("expected the Folder to be withdrawn")

        return {
          created: created.value.isPublished,
          published: published.value.isPublished,
          renamedName: renamed.value.name,
          renamedIsPublished: renamed.value.isPublished,
          withdrawn: withdrawn.value.isPublished,
        }
      }),
    )

    expect(states).toEqual({
      created: false,
      published: true,
      renamedName: "Reading",
      renamedIsPublished: true,
      withdrawn: false,
    })
  })
})
