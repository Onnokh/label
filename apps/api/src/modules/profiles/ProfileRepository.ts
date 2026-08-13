import { eq, sql } from "drizzle-orm"
import { Context, Effect, Layer, Option, Schema } from "effect"

import { Profile, type ProfileVisibility } from "../../domain/Profile.js"
import type { UserId } from "../../domain/SavedItem.js"
import { PostgresClient } from "../persistence/PostgresClient.js"
import { profilesTable } from "../persistence/schema.js"

const decodeProfile = Schema.decodeUnknownSync(Profile)

const toProfile = (record: typeof profilesTable.$inferSelect): Profile =>
  decodeProfile(record)

export class ProfileRepository extends Context.Service<ProfileRepository>()(
  "@app/modules/profiles/ProfileRepository",
  {
    make: Effect.gen(function* () {
      const { db } = yield* PostgresClient

      return {
        findByUser: Effect.fn("ProfileRepository.findByUser")(function* (userId: UserId) {
          const [row] = yield* db
            .select()
            .from(profilesTable)
            .where(eq(profilesTable.userId, userId))
            .limit(1)
          return row ? Option.some(toProfile(row)) : Option.none<Profile>()
        }),

        findByHandle: Effect.fn("ProfileRepository.findByHandle")(function* (handle: string) {
          const [row] = yield* db
            .select()
            .from(profilesTable)
            .where(sql`lower(${profilesTable.handle}) = lower(${handle})`)
            .limit(1)
          return row ? Option.some(toProfile(row)) : Option.none<Profile>()
        }),

        // Postgres is the authority on Handle uniqueness: the insert leaves the
        // existing row alone and returns nothing when the Handle is taken, or
        // when this Account already claimed one.
        claim: Effect.fn("ProfileRepository.claim")(function* (userId: UserId, handle: string) {
          const [row] = yield* db
            .insert(profilesTable)
            .values({ userId, handle })
            .onConflictDoNothing()
            .returning()
          return row ? Option.some(toProfile(row)) : Option.none<Profile>()
        }),

        renameHandle: Effect.fn("ProfileRepository.renameHandle")(function* (userId: UserId, handle: string) {
          const [row] = yield* db
            .update(profilesTable)
            .set({ handle, updatedAt: new Date() })
            .where(eq(profilesTable.userId, userId))
            .returning()
          return row ? Option.some(toProfile(row)) : Option.none<Profile>()
        }),

        // Turning Profile Visibility off keeps the record, so the Account keeps
        // its Handle reserved until the Account is deleted.
        setVisibility: Effect.fn("ProfileRepository.setVisibility")(function* (userId: UserId, visibility: ProfileVisibility) {
          const [row] = yield* db
            .update(profilesTable)
            .set({ visibility, updatedAt: new Date() })
            .where(eq(profilesTable.userId, userId))
            .returning()
          return row ? Option.some(toProfile(row)) : Option.none<Profile>()
        }),
      }
    }),
  },
) {
  static readonly layer = Layer.effect(ProfileRepository, ProfileRepository.make)

  static readonly defaultLayer = ProfileRepository.layer.pipe(
    Layer.provide(PostgresClient.defaultLayer),
  )
}
