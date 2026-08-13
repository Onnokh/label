// Fills a local Public Profile with real content, so a Post Card or a Link Card
// can be judged against the pages people actually save rather than lorem ipsum.
//
// The content comes from a live Public Profile through the public REST API, which
// needs no credentials. Every Saved Item lands in one Folder that this script
// owns, so the whole seed is removable with one delete.
//
// Usage, from apps/api:
//
//   bun scripts/seed-public-profile.ts                     # onno -> onkie
//   bun scripts/seed-public-profile.ts --handle other      # into another Handle
//   bun scripts/seed-public-profile.ts --pages 1           # fewer Saved Items
//
// Re-running is safe: a Link that is already there keeps its row and has its
// Link Metadata and Link Enrichment written again, so a re-run picks up new
// fields without duplicating anything.

import { drizzle } from "drizzle-orm/node-postgres"
import { and, eq, inArray, sql } from "drizzle-orm"
import { Effect, Result } from "effect"
import { Pool } from "pg"

import type { LinkId, UserId } from "../src/domain/SavedItem.js"
import { normalizeCaptureUrl } from "../src/modules/capture/CaptureService.js"
import {
  foldersTable,
  linkEnrichmentTable,
  linkMetadataTable,
  linksTable,
  profilesTable,
  savedItemsTable,
} from "../src/modules/persistence/schema.js"

type PublicSavedItem = {
  readonly originalUrl: string
  readonly host: string
  readonly title?: string
  readonly faviconUrl?: string
  readonly faviconLightUrl?: string
  readonly faviconDarkUrl?: string
  readonly imageUrl?: string
  readonly type: string
  readonly tags: ReadonlyArray<string>
  readonly previewSummary?: string
  readonly savedAt: string
}

const arg = (name: string, fallback: string): string => {
  const at = process.argv.indexOf(`--${name}`)
  return at === -1 ? fallback : (process.argv[at + 1] ?? fallback)
}

const targetHandle = arg("handle", "onkie")
const sourceHandle = arg("profile", "onno")
const sourceApi = arg("source", "https://api.sleevy.app")
const folderName = arg("folder", "Seeded")
const maxPages = Number(arg("pages", "3"))

// This script writes rows nobody asked for and publishes them, so it refuses to
// speak to anything but a database on this machine.
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error("DATABASE_URL is not set. Run this from apps/api.")
const databaseHost = new URL(databaseUrl).hostname
if (databaseHost !== "localhost" && databaseHost !== "127.0.0.1") {
  throw new Error(`Refusing to seed a database at ${databaseHost}. Local only.`)
}

const fetchPage = async (page: number): Promise<{
  readonly savedItems: ReadonlyArray<PublicSavedItem>
  readonly totalPages: number
}> => {
  const response = await fetch(
    `${sourceApi}/v1/public/profiles/${sourceHandle}/saved-items?page=${page}`,
  )
  if (!response.ok) {
    throw new Error(`Source profile @${sourceHandle} answered ${response.status}`)
  }
  return await response.json()
}

const isPostUrl = (url: string) =>
  /^https?:\/\/(www\.)?(twitter\.com|x\.com)\/[^/]+\/status\//i.test(url)

type PostFields = {
  readonly authorName?: string
  readonly authorHandle?: string
  readonly avatarUrl?: string
  readonly imageUrl?: string
}

// The same community proxy the OEmbedFetcher uses. A seeded post therefore holds
// the fields a real capture holds, including the ones the public API does not
// publish yet.
const fetchPostFields = async (url: string): Promise<PostFields> => {
  try {
    const path = url.replace(/^https?:\/\/(www\.)?(twitter\.com|x\.com)/i, "")
    const response = await fetch(`https://api.fxtwitter.com${path}`)
    if (!response.ok) return {}
    const json = await response.json() as {
      readonly tweet?: {
        readonly author?: {
          readonly name?: string
          readonly screen_name?: string
          readonly avatar_url?: string
        }
        readonly media?: { readonly photos?: ReadonlyArray<{ readonly url?: string }> }
      }
    }
    const tweet = json.tweet
    if (!tweet) return {}
    return {
      ...(tweet.author?.name ? { authorName: tweet.author.name } : {}),
      ...(tweet.author?.screen_name ? { authorHandle: `@${tweet.author.screen_name}` } : {}),
      ...(tweet.author?.avatar_url ? { avatarUrl: tweet.author.avatar_url } : {}),
      ...(tweet.media?.photos?.[0]?.url ? { imageUrl: tweet.media.photos[0].url } : {}),
    }
  } catch {
    return {}
  }
}

const pool = new Pool({ connectionString: databaseUrl })
const db = drizzle({ client: pool })

const main = async () => {
  const [profile] = await db
    .select({ userId: profilesTable.userId })
    .from(profilesTable)
    .where(eq(sql`lower(${profilesTable.handle})`, targetHandle.toLowerCase()))
    .limit(1)

  if (!profile) {
    throw new Error(`No local profile holds the handle @${targetHandle}.`)
  }
  const userId = profile.userId as UserId

  // A Published Folder of its own. Nothing else in the Library is touched, and
  // deleting this one Folder removes the whole seed.
  const [existingFolder] = await db
    .select({ id: foldersTable.id })
    .from(foldersTable)
    .where(and(eq(foldersTable.userId, userId), eq(foldersTable.name, folderName)))
    .limit(1)

  const folderId = existingFolder?.id ?? (
    await db
      .insert(foldersTable)
      .values({ userId, name: folderName, emoji: "🌱", isPublished: true })
      .returning({ id: foldersTable.id })
  )[0]!.id

  await db
    .update(foldersTable)
    .set({ isPublished: true })
    .where(eq(foldersTable.id, folderId))

  const items: PublicSavedItem[] = []
  let page = 1
  for (;;) {
    const answer = await fetchPage(page)
    items.push(...answer.savedItems)
    if (page >= Math.min(answer.totalPages, maxPages)) break
    page += 1
  }
  console.log(`Fetched ${items.length} Saved Items from @${sourceHandle}`)

  let seeded = 0
  for (const item of items) {
    const url = Effect.runSync(Effect.result(normalizeCaptureUrl(item.originalUrl)))
    if (Result.isFailure(url)) {
      console.warn(`Skipped an unusable URL: ${item.originalUrl}`)
      continue
    }
    const { originalUrl, normalizedUrl, host, type } = url.success

    const post = isPostUrl(originalUrl) ? await fetchPostFields(originalUrl) : {}
    const savedAt = new Date(item.savedAt)

    const [link] = await db
      .insert(linksTable)
      .values({ originalUrl, normalizedUrl, host, createdAt: savedAt, updatedAt: savedAt })
      .onConflictDoUpdate({
        target: linksTable.normalizedUrl,
        set: { updatedAt: savedAt },
      })
      .returning({ id: linksTable.id })
    const linkId = link!.id as LinkId

    await db
      .insert(linkMetadataTable)
      .values({
        linkId,
        title: item.title ?? null,
        siteName: post.authorHandle ?? null,
        faviconUrl: item.faviconUrl ?? null,
        faviconLightUrl: item.faviconLightUrl ?? null,
        faviconDarkUrl: item.faviconDarkUrl ?? null,
        imageUrl: post.imageUrl ?? item.imageUrl ?? null,
        authorName: post.authorName ?? null,
        authorHandle: post.authorHandle ?? null,
        authorAvatarUrl: post.avatarUrl ?? null,
        fetchedAt: savedAt,
        updatedAt: savedAt,
      })
      .onConflictDoUpdate({
        target: linkMetadataTable.linkId,
        set: {
          title: item.title ?? null,
          siteName: post.authorHandle ?? null,
          imageUrl: post.imageUrl ?? item.imageUrl ?? null,
          authorName: post.authorName ?? null,
          authorHandle: post.authorHandle ?? null,
          authorAvatarUrl: post.avatarUrl ?? null,
          updatedAt: savedAt,
        },
      })

    // A post carries its own words, so it gets no Preview Summary here: that is
    // the behaviour the Post Card is designed against.
    const previewSummary = isPostUrl(originalUrl) ? null : (item.previewSummary ?? null)

    await db
      .insert(linkEnrichmentTable)
      .values({
        linkId,
        previewSummary,
        type,
        tags: [...item.tags],
        status: "enriched",
        enrichedAt: savedAt,
        updatedAt: savedAt,
      })
      .onConflictDoUpdate({
        target: linkEnrichmentTable.linkId,
        set: { previewSummary, type, tags: [...item.tags], status: "enriched", updatedAt: savedAt },
      })

    await db
      .insert(savedItemsTable)
      .values({
        userId,
        linkId,
        folderId,
        captureChannel: "api",
        // Creation time is what a Public Profile orders and buckets by, so the
        // seeded page has the same shape as the profile it was taken from.
        createdAt: savedAt,
        lastSavedAt: savedAt,
        updatedAt: savedAt,
      })
      .onConflictDoUpdate({
        target: [savedItemsTable.userId, savedItemsTable.linkId],
        set: { folderId, createdAt: savedAt, lastSavedAt: savedAt },
      })

    seeded += 1
  }

  const posts = items.filter((item) => isPostUrl(item.originalUrl)).length
  console.log(
    `Seeded ${seeded} Saved Items (${posts} posts) into the published Folder "${folderName}" of @${targetHandle}`,
  )
  console.log(`Local page: http://localhost:4000/u/${targetHandle}`)
}

const removeSeed = async () => {
  const [profile] = await db
    .select({ userId: profilesTable.userId })
    .from(profilesTable)
    .where(eq(sql`lower(${profilesTable.handle})`, targetHandle.toLowerCase()))
    .limit(1)
  if (!profile) throw new Error(`No local profile holds the handle @${targetHandle}.`)

  const folders = await db
    .select({ id: foldersTable.id })
    .from(foldersTable)
    .where(and(eq(foldersTable.userId, profile.userId as UserId), eq(foldersTable.name, folderName)))

  if (folders.length === 0) {
    console.log(`Nothing to remove: @${targetHandle} has no Folder "${folderName}".`)
    return
  }

  const ids = folders.map((folder) => folder.id)
  const removed = await db
    .delete(savedItemsTable)
    .where(inArray(savedItemsTable.folderId, ids))
    .returning({ id: savedItemsTable.id })
  await db.delete(foldersTable).where(inArray(foldersTable.id, ids))
  console.log(`Removed ${removed.length} seeded Saved Items and the Folder "${folderName}".`)
}

const run = process.argv.includes("--remove") ? removeSeed : main

await run()
  .catch((cause) => {
    console.error(cause instanceof Error ? cause.message : cause)
    process.exitCode = 1
  })
  .finally(() => pool.end())
