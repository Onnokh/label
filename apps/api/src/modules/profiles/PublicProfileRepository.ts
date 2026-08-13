import { and, eq, sql } from "drizzle-orm"
import { Context, Effect, Layer, Option } from "effect"

import { PostgresClient } from "../persistence/PostgresClient.js"
import { profilesTable, savedItemsTable, user } from "../persistence/schema.js"
import { publicSavedItemFilter } from "./PublicSavedItems.js"
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

export class PublicProfileRepository extends Context.Service<PublicProfileRepository>()(
  "@app/modules/profiles/PublicProfileRepository",
  {
    make: Effect.gen(function* () {
      const { db } = yield* PostgresClient

      return {
        // One statement for every Handle. Profile Visibility is part of the
        // WHERE clause, so an unknown Handle and a private Public Profile both
        // leave this without a row after the same work — the caller cannot tell
        // them apart, and a private row never enters application memory.
        findPublicByHandle: Effect.fn("PublicProfileRepository.findPublicByHandle")(function* (
          handle: string,
        ) {
          const [row] = yield* db
            .select({
              handle: profilesTable.handle,
              // The join date is the Account's, not the Public Profile record's:
              // the indexing rule counts how long the Account has existed.
              joinedAt: user.createdAt,
              publicSavedItemCount: sql<number>`(
                select count(*)::int from ${savedItemsTable}
                where ${publicSavedItemFilter(profilesTable.userId)}
              )`,
            })
            .from(profilesTable)
            .innerJoin(user, eq(user.id, profilesTable.userId))
            .where(
              and(
                sql`lower(${profilesTable.handle}) = lower(${handle})`,
                eq(profilesTable.visibility, "public"),
              ),
            )
            .limit(1)

          return row
            ? Option.some<PublicProfileSummary>({
                handle: row.handle,
                joinedAt: row.joinedAt,
                publicSavedItemCount: Number(row.publicSavedItemCount),
              })
            : Option.none<PublicProfileSummary>()
        }),

        // Reading Activity for a Handle, in one statement for the same reason as
        // the lookup above: Profile Visibility sits in the WHERE clause, so a
        // private Account leaves this without a row and cannot be told apart
        // from a Handle nobody holds.
        //
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
            .where(
              and(
                sql`lower(${profilesTable.handle}) = lower(${handle})`,
                eq(profilesTable.visibility, "public"),
              ),
            )
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
      }
    }),
  },
) {
  static readonly layer = Layer.effect(PublicProfileRepository, PublicProfileRepository.make)

  static readonly defaultLayer = PublicProfileRepository.layer.pipe(
    Layer.provide(PostgresClient.defaultLayer),
  )
}
