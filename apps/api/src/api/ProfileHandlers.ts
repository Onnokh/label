import { Effect, Option } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

import { Analytics } from "../modules/analytics/Analytics.js"
import { invalidHandleMessage, normalizeHandle } from "../modules/profiles/Handle.js"
import { ProfileRepository } from "../modules/profiles/ProfileRepository.js"
import { PublicProfileCachePurger } from "../modules/profiles/PublicProfileCachePurger.js"
import {
  CurrentUser,
  HandleAvailabilityResponse,
  HandleConflictError,
  InvalidHandleError,
  ProfileNotFoundError,
  profileToDto,
  sleevyApi,
} from "./ApiContract.js"

const validateHandle = (raw: string) => {
  const handle = normalizeHandle(raw)
  const message = invalidHandleMessage(handle)
  return message === null
    ? Effect.succeed(handle)
    : Effect.fail(new InvalidHandleError({ message }))
}

const notFound = () => new ProfileNotFoundError({
  message: "Claim a Handle before reading or changing your Public Profile.",
})

const taken = () => new HandleConflictError({
  message: "This Handle is already claimed.",
})

export const profileGroupLive = HttpApiBuilder.group(sleevyApi, "profile", (handlers) =>
  handlers
    .handle("get", () =>
      Effect.gen(function* () {
        const repo = yield* ProfileRepository
        const userId = yield* CurrentUser
        const profile = yield* repo.findByUser(userId).pipe(Effect.orDie)
        if (Option.isNone(profile)) return yield* notFound()
        return profileToDto(profile.value)
      }),
    )
    .handle("checkHandle", ({ query }) =>
      Effect.gen(function* () {
        const repo = yield* ProfileRepository
        const userId = yield* CurrentUser
        const handle = yield* validateHandle(query.handle)
        const existing = yield* repo.findByHandle(handle).pipe(Effect.orDie)
        // An Account's own Handle stays available to it, so renaming between
        // two spellings of the same Handle is never reported as taken.
        const available = Option.isNone(existing) || existing.value.userId === userId
        return new HandleAvailabilityResponse({ handle, available })
      }),
    )
    .handle("claimHandle", ({ payload }) =>
      Effect.gen(function* () {
        const repo = yield* ProfileRepository
        const analytics = yield* Analytics
        const userId = yield* CurrentUser
        const handle = yield* validateHandle(payload.handle)
        const claimed = yield* repo.claim(userId, handle).pipe(Effect.orDie)
        if (Option.isNone(claimed)) {
          const owned = yield* repo.findByUser(userId).pipe(Effect.orDie)
          return yield* Option.isSome(owned)
            ? new HandleConflictError({
                message: "This Account already claimed a Handle. Rename it instead.",
              })
            : taken()
        }
        yield* analytics
          .track({ name: "handle_claimed", userId })
          .pipe(Effect.forkDetach)
        return profileToDto(claimed.value)
      }),
    )
    .handle("renameHandle", ({ payload }) =>
      Effect.gen(function* () {
        const repo = yield* ProfileRepository
        const cachePurger = yield* PublicProfileCachePurger
        const analytics = yield* Analytics
        const userId = yield* CurrentUser
        const owned = yield* repo.findByUser(userId).pipe(Effect.orDie)
        if (Option.isNone(owned)) return yield* notFound()
        const handle = yield* validateHandle(payload.handle)
        // The read answers the common case with a clear message. The unique
        // index answers the race the read cannot see, and both arrive here as
        // the same conflict.
        const existing = yield* repo.findByHandle(handle).pipe(Effect.orDie)
        if (Option.isSome(existing) && existing.value.userId !== userId) {
          return yield* taken()
        }
        const outcome = yield* repo.renameHandle(userId, handle).pipe(Effect.orDie)
        if (outcome._tag === "taken") return yield* taken()
        if (outcome._tag === "no-profile") return yield* notFound()
        yield* cachePurger.purge(owned.value.handle)
        if (outcome.profile.handle !== owned.value.handle) {
          yield* cachePurger.purge(outcome.profile.handle)
        }
        yield* analytics
          .track({ name: "handle_renamed", userId })
          .pipe(Effect.forkDetach)
        return profileToDto(outcome.profile)
      }),
    )
    .handle("setVisibility", ({ payload }) =>
      Effect.gen(function* () {
        const repo = yield* ProfileRepository
        const cachePurger = yield* PublicProfileCachePurger
        const analytics = yield* Analytics
        const userId = yield* CurrentUser
        const updated = yield* repo.setVisibility(userId, payload.visibility).pipe(Effect.orDie)
        if (Option.isNone(updated)) return yield* notFound()
        yield* cachePurger.purge(updated.value.handle)
        yield* analytics
          .track({
            name: "profile_visibility_changed",
            userId,
            properties: { visibility: payload.visibility },
          })
          .pipe(Effect.forkDetach)
        return profileToDto(updated.value)
      }),
    ),
)
