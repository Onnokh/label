// Gives an already-captured post its Type and its Link Author.
//
// Capture is the only writer of the Type, so every tweet saved before the Type
// "post" existed is still stored as a `website` whose Link Metadata title holds
// the whole message and whose author columns are empty. A Public Profile draws
// those as a Link Card: the message sits in the title slot as though it were a
// headline, the source reads x.com instead of the writer, and the Preview
// Summary underneath restates the message. This one-shot backfill asks the
// capture classifier the same question it would ask today, and for every Saved
// Item whose answer is "post" it re-resolves the provider payload and writes the
// Type, the Link Author, and a cleared Preview Summary.
//
// Usage, from apps/api:
//
//   bun scripts/backfill-post-type.ts             # dry run, writes nothing
//   bun scripts/backfill-post-type.ts --apply     # write the changes
//
// Deliberately narrow, because this runs against real Libraries:
//
//   * Only rows the classifier calls a post are touched, and only their Type,
//     Preview Summary, and the Link Metadata fields the provider itself states.
//     Tags, Folders, favicons, and timestamps of a Saved Item are left alone.
//   * Link Enrichment is not re-run and no Enrichment Job is recorded, so no AI
//     call is paid for and no Tags are rewritten. The provider lookup is the
//     only work a post actually needs.
//   * A row whose provider lookup returns nothing — a deleted post, or a proxy
//     having a bad day — is reported and skipped whole, never half-written. A
//     post with no Link Author reads worse than a Link, so it stays a Link until
//     a re-run can resolve it.
//
// Re-running is safe and is the way to pick up rows a provider missed.

import { drizzle } from "drizzle-orm/node-postgres"
import { eq } from "drizzle-orm"
import { Effect, Option } from "effect"
import { Pool } from "pg"

import type { LinkId } from "../src/domain/SavedItem.js"
import { inferLinkType } from "../src/modules/capture/CaptureService.js"
import { OEmbedFetcher } from "../src/modules/metadata/OEmbedFetcher.js"
import {
  linkEnrichmentTable,
  linkMetadataTable,
  linksTable,
} from "../src/modules/persistence/schema.js"

const apply = process.argv.includes("--apply")

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error("DATABASE_URL is not set. Run this from apps/api.")

const pool = new Pool({ connectionString: databaseUrl })
const db = drizzle({ client: pool })

const resolveProvider = (url: string) =>
  Effect.runPromise(
    OEmbedFetcher.pipe(
      Effect.flatMap((fetcher) => fetcher.fetch(url)),
      Effect.provide(OEmbedFetcher.layer),
      // A provider that cannot answer is a skip, not a failure of the backfill.
      Effect.catchCause(() => Effect.succeed(Option.none())),
    ),
  )

const classifiesAsPost = (normalizedUrl: string) => {
  try {
    return inferLinkType(new URL(normalizedUrl)) === "post"
  } catch {
    return false
  }
}

const main = async () => {
  console.log(`Database: ${new URL(databaseUrl).hostname}`)
  console.log(apply ? "Mode: apply\n" : "Mode: dry run, nothing is written\n")

  // The classifier reads a URL, not a column, so the candidates cannot be found
  // by a WHERE clause without restating its rules here. A Library holds few
  // enough Links that reading their URLs and asking the classifier is cheaper
  // than a second copy of the rules that can drift from the first.
  const rows = await db
    .select({
      linkId: linksTable.id,
      originalUrl: linksTable.originalUrl,
      normalizedUrl: linksTable.normalizedUrl,
      type: linkEnrichmentTable.type,
      previewSummary: linkEnrichmentTable.previewSummary,
      authorHandle: linkMetadataTable.authorHandle,
    })
    .from(linksTable)
    .innerJoin(linkEnrichmentTable, eq(linksTable.id, linkEnrichmentTable.linkId))
    .innerJoin(linkMetadataTable, eq(linksTable.id, linkMetadataTable.linkId))

  const candidates = rows.filter(
    (row) =>
      classifiesAsPost(row.normalizedUrl) &&
      (row.type !== "post" || row.authorHandle === null || row.previewSummary !== null),
  )

  console.log(`${rows.length} Links, ${candidates.length} of them an unconverted post`)
  if (candidates.length === 0) {
    console.log("Nothing to do.")
    return
  }

  let converted = 0
  const unresolved: string[] = []

  for (const row of candidates) {
    const resolved = await resolveProvider(row.originalUrl)

    if (Option.isNone(resolved) || !resolved.value.authorHandle) {
      unresolved.push(row.originalUrl)
      console.log(`  skip  ${row.originalUrl}  (provider stated no author)`)
      continue
    }

    const metadata = resolved.value
    console.log(
      `  post  ${row.originalUrl}\n` +
      `        author ${metadata.authorHandle}` +
      `${row.previewSummary === null ? "" : ", drops a Preview Summary"}` +
      `${row.type === "post" ? "" : `, type ${row.type} -> post`}`,
    )

    if (!apply) {
      converted += 1
      continue
    }

    const linkId = row.linkId as LinkId
    const now = new Date()

    // Only the fields the provider states. A favicon, a canonical URL, and the
    // Saved Item's own timestamps are not the provider's to answer for.
    await db
      .update(linkMetadataTable)
      .set({
        title: metadata.title,
        siteName: metadata.siteName ?? null,
        ...(metadata.imageUrl ? { imageUrl: metadata.imageUrl } : {}),
        authorName: metadata.authorName ?? null,
        authorHandle: metadata.authorHandle,
        authorAvatarUrl: metadata.authorAvatarUrl ?? null,
        updatedAt: now,
      })
      .where(eq(linkMetadataTable.linkId, linkId))

    // A post is its own preview, so the summary is cleared rather than left to
    // restate the message the card now shows in full.
    await db
      .update(linkEnrichmentTable)
      .set({ type: "post", previewSummary: null, updatedAt: now })
      .where(eq(linkEnrichmentTable.linkId, linkId))

    converted += 1
  }

  console.log()
  console.log(
    apply
      ? `Converted ${converted} Saved Items into posts.`
      : `Would convert ${converted} Saved Items into posts. Re-run with --apply to write.`,
  )
  if (unresolved.length > 0) {
    console.log(
      `${unresolved.length} left as Links because no author could be resolved. ` +
      `Re-run later to pick them up.`,
    )
  }
}

await main()
  .catch((cause) => {
    console.error(cause instanceof Error ? cause.message : cause)
    process.exitCode = 1
  })
  .finally(() => pool.end())
