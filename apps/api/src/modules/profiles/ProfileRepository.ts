import { eq, sql } from "drizzle-orm"
import { Context, Effect, Layer, Option, Schema } from "effect"

import { Profile, type ProfileVisibility } from "../../domain/Profile.js"
import type { UserId } from "../../domain/SavedItem.js"
import { PostgresClient } from "../persistence/PostgresClient.js"
import { profilesTable } from "../persistence/schema.js"

const decodeProfile = Schema.decodeUnknownSync(Profile)

const toProfile = (record: typeof profilesTable.$inferSelect): Profile =>
  decodeProfile(record)

// What a rename can end in. A rename cannot use the insert's conflict guard, so
// the unique index is the only thing that sees a rename lose a race to another
// Account, and the caller needs to tell that apart from a missing record.
export type RenameOutcome =
  | { readonly _tag: "renamed"; readonly profile: Profile }
  | { readonly _tag: "taken" }
  | { readonly _tag: "no-profile" }

const UNIQUE_VIOLATION = "23505"

// Only the driver's innermost error carries the SQLSTATE, and it sits a long way
// down: the query error wraps an Effect cause, whose reasons wrap the failure
// that finally holds the code. How deep that is belongs to the driver and not to
// us, so this searches rather than reaching for a fixed path.
const holdsUniqueViolation = (value: unknown, depth = 0): boolean => {
  if (value === null || typeof value !== "object" || depth > 8) return false
  if ((value as { readonly code?: unknown }).code === UNIQUE_VIOLATION) return true
  if (Array.isArray(value)) {
    return value.some((entry) => holdsUniqueViolation(entry, depth + 1))
  }
  const { cause, reasons, error } = value as {
    readonly cause?: unknown
    readonly reasons?: unknown
    readonly error?: unknown
  }
  return (
    holdsUniqueViolation(cause, depth + 1) ||
    holdsUniqueViolation(reasons, depth + 1) ||
    holdsUniqueViolation(error, depth + 1)
  )
}

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

        // Postgres is the authority here too. Reading the Handle first and then
        // updating leaves a window where another Account claims it in between,
        // and the unique index is what closes that window, so the violation is
        // caught and reported as a conflict rather than failing the request.
        renameHandle: Effect.fn("ProfileRepository.renameHandle")(function* (userId: UserId, handle: string) {
          return yield* Effect.gen(function* () {
            const [row] = yield* db
              .update(profilesTable)
              .set({ handle, updatedAt: new Date() })
              .where(eq(profilesTable.userId, userId))
              .returning()
            return row
              ? ({ _tag: "renamed", profile: toProfile(row) } as const satisfies RenameOutcome)
              : ({ _tag: "no-profile" } as const satisfies RenameOutcome)
          }).pipe(
            Effect.catchIf(
              holdsUniqueViolation,
              () => Effect.succeed({ _tag: "taken" } as const satisfies RenameOutcome),
            ),
          )
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
