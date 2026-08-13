import { and, eq, sql } from "drizzle-orm"
import { Context, Effect, Layer, Option } from "effect"

import { PostgresClient } from "../persistence/PostgresClient.js"
import { profilesTable, savedItemsTable, user } from "../persistence/schema.js"
import { publicSavedItemFilter } from "./PublicSavedItems.js"

// What an anonymous visitor may read for a Handle. The Account identifier never
// leaves the repository, so nothing downstream can widen the response by
// accident.
export type PublicProfileSummary = {
  readonly handle: string
  readonly joinedAt: Date
  readonly publicSavedItemCount: number
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
      }
    }),
  },
) {
  static readonly layer = Layer.effect(PublicProfileRepository, PublicProfileRepository.make)

  static readonly defaultLayer = PublicProfileRepository.layer.pipe(
    Layer.provide(PostgresClient.defaultLayer),
  )
}
