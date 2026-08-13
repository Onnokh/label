import { and, desc, eq, sql } from "drizzle-orm"
import { Context, Effect, Layer, Option } from "effect"

import { effectiveTags, type LinkType, type Topic } from "../../domain/SavedItem.js"
import { PostgresClient } from "../persistence/PostgresClient.js"
import {
  linkEnrichmentTable,
  linkMetadataTable,
  linksTable,
  profilesTable,
  savedItemsTable,
  user,
} from "../persistence/schema.js"
import { publicSavedItemFilter } from "./PublicSavedItems.js"
import { isIndexable, MAX_INDEXABLE_PROFILES } from "./SearchIndexing.js"
import {
  readingActivityDay,
  readingActivityDayText,
  readingActivityFilter,
  readingActivityFrom,
  readingActivityTo,
} from "./ReadingActivity.js"

// What an anonymous visitor may read for a Handle. The Account identifier never
// leaves the repository, so nothing downstream can widen the response by
// accident.
export type PublicProfileSummary = {
  readonly handle: string
  readonly joinedAt: Date
  readonly publicSavedItemCount: number
}

// Reading Activity for one Handle: the inclusive UTC bounds of the rolling
// window, and the days inside it that carry at least one save. Days with no save
// are absent rather than zero, so the response stays small.
export type ReadingActivitySummary = {
  readonly handle: string
  readonly from: string
  readonly to: string
  readonly days: ReadonlyArray<{ readonly date: string; readonly count: number }>
}

// One published Saved Item. The withheld fields are not selected at all, so the
// Folder name, the Source name, the Capture Channel, the Read State, and the
// Saved Item identifier never enter application memory on a public read.
export type PublicSavedItem = {
  readonly originalUrl: string
  readonly host: string
  readonly title?: string | undefined
  readonly faviconUrl?: string | undefined
  readonly faviconLightUrl?: string | undefined
  readonly faviconDarkUrl?: string | undefined
  readonly imageUrl?: string | undefined
  readonly type: LinkType
  readonly tags: ReadonlyArray<Topic>
  readonly previewSummary?: string | undefined
  readonly savedAt: Date
}

export type PublicSavedItemsPage = {
  readonly savedItems: ReadonlyArray<PublicSavedItem>
  // Counts published Saved Items only. Withheld items add nothing here, so the
  // page total never advertises what a Public Profile hides.
  readonly totalCount: number
}

// One Public Profile a search engine may be offered. `lastModifiedAt` is the
// creation time of the newest Saved Item the profile publishes, because that is
// when the page last changed: a withheld save changes nothing a crawler sees,
// and a Duplicate Save changes nothing either.
export type IndexableProfile = {
  readonly handle: string
  readonly lastModifiedAt: Date
}

export type IndexableProfilesPage = {
  readonly profiles: ReadonlyArray<IndexableProfile>
  readonly totalCount: number
}

export class PublicProfileRepository extends Context.Service<PublicProfileRepository>()(
  "@app/modules/profiles/PublicProfileRepository",
  {
    make: Effect.gen(function* () {
      const { db } = yield* PostgresClient

      // The one condition that resolves a Handle publicly. Profile Visibility
      // sits inside it, so every public read below answers an unknown Handle and
      // a private Public Profile the same way, after the same work, and no
      // private row ever enters application memory.
      const publicProfileMatch = (handle: string) =>
        and(
          sql`lower(${profilesTable.handle}) = lower(${handle})`,
          eq(profilesTable.visibility, "public"),
        )

      // Counts the Saved Items the Account of the surrounding row publishes.
      // Correlated on `profiles.user_id`, so it works in any select over
      // profilesTable.
      const publicSavedItemCount = sql<number>`(
        select count(*)::int from ${savedItemsTable}
        where ${publicSavedItemFilter(profilesTable.userId)}
      )`

      // When the published page of the surrounding row last changed. The same
      // filter decides it, so an item a Public Profile withholds cannot date a
      // page it does not appear on. Null while the Account publishes nothing.
      const lastPublicSavedItemAt = sql<Date | null>`(
        select max(${savedItemsTable.createdAt}) from ${savedItemsTable}
        where ${publicSavedItemFilter(profilesTable.userId)}
      )`

      // The Account behind a Handle, plus how many Saved Items it publishes.
      // Private to the repository: the identifier is what the list query needs
      // and what nothing above may see.
      const findPublicOwner = (handle: string) =>
        Effect.gen(function* () {
          const [row] = yield* db
            .select({
              userId: profilesTable.userId,
              publicSavedItemCount,
            })
            .from(profilesTable)
            .where(publicProfileMatch(handle))
            .limit(1)

          return row
        })

      return {
        findPublicByHandle: Effect.fn("PublicProfileRepository.findPublicByHandle")(function* (
          handle: string,
        ) {
          const [row] = yield* db
            .select({
              handle: profilesTable.handle,
              // The join date is the Account's, not the Public Profile record's:
              // the indexing rule counts how long the Account has existed.
              joinedAt: user.createdAt,
              publicSavedItemCount,
            })
            .from(profilesTable)
            .innerJoin(user, eq(user.id, profilesTable.userId))
            .where(publicProfileMatch(handle))
            .limit(1)

          return row
            ? Option.some<PublicProfileSummary>({
                handle: row.handle,
                joinedAt: row.joinedAt,
                publicSavedItemCount: Number(row.publicSavedItemCount),
              })
            : Option.none<PublicProfileSummary>()
        }),

        // The Handles a search engine may be offered, one numbered page at a
        // time. Which of them qualify is `isIndexable`'s decision and is not
        // restated here: that rule reads the wall clock, which SQL has no access
        // to, so a WHERE clause could only be a second copy of it that drifts.
        // The query therefore hands back every public Handle together with the
        // two facts the rule needs, and the rule filters them.
        listIndexableProfiles: Effect.fn("PublicProfileRepository.listIndexableProfiles")(
          function* ({
            page,
            pageSize,
          }: { readonly page: number; readonly pageSize: number }) {
            const rows = yield* db
              .select({
                handle: profilesTable.handle,
                // The Account's join date, not the profile record's: the rule
                // counts how long the Account has existed.
                joinedAt: user.createdAt,
                publicSavedItemCount,
                lastModifiedAt: lastPublicSavedItemAt,
              })
              .from(profilesTable)
              .innerJoin(user, eq(user.id, profilesTable.userId))
              // Profile Visibility, and nothing further: the rest is the rule's
              // business. This clause is not what withholds a private profile —
              // the shared filter already counts nothing for one, so the rule
              // rejects it anyway. It keeps the row from being read at all, so
              // a Handle nobody may resolve never enters application memory.
              .where(eq(profilesTable.visibility, "public"))
              // A stable order, so a crawler walking the numbered pages sees
              // each Handle once.
              .orderBy(profilesTable.handle)
              .limit(MAX_INDEXABLE_PROFILES)

            const indexable = rows
              .map((row) => ({
                handle: row.handle,
                joinedAt: row.joinedAt,
                publicSavedItemCount: Number(row.publicSavedItemCount),
                lastModifiedAt: row.lastModifiedAt,
              }))
              // The date is required by the same rule that admits the row: a
              // profile publishing at least five Saved Items always has a newest
              // one. The narrowing is what keeps that a type, not a comment.
              .filter((row): row is typeof row & { readonly lastModifiedAt: Date } =>
                row.lastModifiedAt !== null && isIndexable(row),
              )

            const start = (page - 1) * pageSize
            return {
              profiles: indexable
                .slice(start, start + pageSize)
                .map(({ handle, lastModifiedAt }) => ({ handle, lastModifiedAt })),
              totalCount: indexable.length,
            } satisfies IndexableProfilesPage
          },
        ),

        // The Saved Items arrive through a left join, so a public Account that
        // saved nothing inside the window still answers with a row and its
        // window bounds instead of a not-found. Postgres groups and counts, so
        // no withheld row and no per-item timestamp enters application memory.
        findReadingActivity: Effect.fn("PublicProfileRepository.findReadingActivity")(function* (
          handle: string,
        ) {
          const rows = yield* db
            .select({
              handle: profilesTable.handle,
              from: readingActivityFrom,
              to: readingActivityTo,
              date: readingActivityDayText,
              count: sql<number>`count(${savedItemsTable.id})::int`,
            })
            .from(profilesTable)
            .leftJoin(savedItemsTable, readingActivityFilter(profilesTable.userId))
            .where(publicProfileMatch(handle))
            .groupBy(profilesTable.handle, readingActivityDay)
            .orderBy(readingActivityDay)

          const [first] = rows
          if (!first) return Option.none<ReadingActivitySummary>()

          return Option.some<ReadingActivitySummary>({
            handle: first.handle,
            from: first.from,
            to: first.to,
            days: rows
              .filter((row): row is typeof row & { readonly date: string } => row.date !== null)
              .map((row) => ({ date: row.date, count: Number(row.count) })),
          })
        }),

        // One page of the Saved Items a Public Profile shows. The Handle is
        // resolved first, so no page at all means a Handle nobody holds or a
        // private Public Profile, while an empty page belongs to a public Account
        // that publishes nothing.
        //
        // Which items appear is the shared filter's decision and is not restated
        // here. Ordering is by Saved Item creation time, not Last Saved At, so a
        // Duplicate Save cannot reorder a published page.
        listPublicSavedItems: Effect.fn("PublicProfileRepository.listPublicSavedItems")(
          function* (
            handle: string,
            { page, pageSize }: { readonly page: number; readonly pageSize: number },
          ) {
            const owner = yield* findPublicOwner(handle)
            if (!owner) return Option.none<PublicSavedItemsPage>()

            const rows = yield* db
              .select({
                originalUrl: linksTable.originalUrl,
                host: linksTable.host,
                title: linkMetadataTable.title,
                faviconUrl: linkMetadataTable.faviconUrl,
                faviconLightUrl: linkMetadataTable.faviconLightUrl,
                faviconDarkUrl: linkMetadataTable.faviconDarkUrl,
                imageUrl: linkMetadataTable.imageUrl,
                type: linkEnrichmentTable.type,
                savedItemTags: savedItemsTable.tags,
                enrichmentTags: linkEnrichmentTable.tags,
                previewSummary: linkEnrichmentTable.previewSummary,
                savedAt: savedItemsTable.createdAt,
              })
              .from(savedItemsTable)
              .innerJoin(linksTable, eq(savedItemsTable.linkId, linksTable.id))
              .innerJoin(linkMetadataTable, eq(linksTable.id, linkMetadataTable.linkId))
              .innerJoin(linkEnrichmentTable, eq(linksTable.id, linkEnrichmentTable.linkId))
              .where(publicSavedItemFilter(owner.userId))
              // The identifier breaks ties without being selected, so two items
              // saved in the same instant keep one stable page boundary.
              .orderBy(desc(savedItemsTable.createdAt), desc(savedItemsTable.id))
              .limit(pageSize)
              .offset((page - 1) * pageSize)

            return Option.some<PublicSavedItemsPage>({
              savedItems: rows.map((row) => ({
                originalUrl: row.originalUrl,
                host: row.host,
                title: row.title ?? undefined,
                faviconUrl: row.faviconUrl ?? undefined,
                faviconLightUrl: row.faviconLightUrl ?? undefined,
                faviconDarkUrl: row.faviconDarkUrl ?? undefined,
                imageUrl: row.imageUrl ?? undefined,
                type: row.type,
                tags: effectiveTags(row.savedItemTags, row.enrichmentTags) as ReadonlyArray<Topic>,
                previewSummary: row.previewSummary ?? undefined,
                savedAt: row.savedAt,
              })),
              totalCount: Number(owner.publicSavedItemCount),
            })
          },
        ),
      }
    }),
  },
) {
  static readonly layer = Layer.effect(PublicProfileRepository, PublicProfileRepository.make)

  static readonly defaultLayer = PublicProfileRepository.layer.pipe(
    Layer.provide(PostgresClient.defaultLayer),
  )
}
