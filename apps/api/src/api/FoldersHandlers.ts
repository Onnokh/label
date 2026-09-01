import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

import { FolderRepository } from "../modules/folders/FolderRepository.js"
import { Analytics } from "../modules/analytics/Analytics.js"
import { ProfileRepository } from "../modules/profiles/ProfileRepository.js"
import { PublicProfileCachePurger } from "../modules/profiles/PublicProfileCachePurger.js"
import {
  CurrentUser,
  FolderDto,
  FolderNameConflictError,
  FolderNotFoundError,
  FoldersResponse,
  InvalidFolderNameError,
  sleevyApi,
} from "./ApiContract.js"
import { gated } from "./AuthMiddleware.js"

const toDto = (folder: {
  readonly id: string
  readonly name: string
  readonly emoji: string | null
  readonly color: string | null
  readonly isPublished: boolean
}) =>
  new FolderDto({
    id: folder.id,
    name: folder.name,
    emoji: folder.emoji,
    color: folder.color,
    isPublished: folder.isPublished,
  })

const validateName = (name: string) => {
  const normalized = name.trim()
  return normalized.length === 0 || normalized.length > 80
    ? Effect.fail(new InvalidFolderNameError({
        message: "Folder name must contain between 1 and 80 characters.",
      }))
    : Effect.succeed(normalized)
}

const notFound = (folderId: string) => new FolderNotFoundError({
  message: "Folder was not found.",
  folderId,
})

const conflict = () => new FolderNameConflictError({
  message: "A Folder with this name already exists.",
})

export const foldersGroupLive = HttpApiBuilder.group(sleevyApi, "folders", (handlers) =>
  handlers
    .handle("list", gated("folders:read", () =>
      Effect.gen(function* () {
        const repo = yield* FolderRepository
        const userId = yield* CurrentUser
        const folders = yield* repo.listByUser(userId).pipe(Effect.orDie)
        return new FoldersResponse({ folders: folders.map(toDto) })
      }),
    ))
    .handle("create", gated("folders:write", ({ payload }) =>
      Effect.gen(function* () {
        const repo = yield* FolderRepository
        const analytics = yield* Analytics
        const userId = yield* CurrentUser
        const name = yield* validateName(payload.name)
        const existing = yield* repo.findByNormalizedName(userId, name).pipe(Effect.orDie)
        if (existing._tag === "Some") return yield* conflict()
        const created = yield* repo.create(userId, name, payload.emoji ?? null, payload.color ?? null).pipe(Effect.orDie)
        if (created._tag === "None") return yield* conflict()
        yield* analytics
          .track({ name: "folder_created", userId })
          .pipe(Effect.forkDetach)
        return toDto(created.value)
      }),
    ))
    .handle("update", gated("folders:write", ({ params, payload }) =>
      Effect.gen(function* () {
        const repo = yield* FolderRepository
        const profiles = yield* ProfileRepository
        const cachePurger = yield* PublicProfileCachePurger
        const analytics = yield* Analytics
        const userId = yield* CurrentUser
        const found = yield* repo.findByUserAndId(userId, params.id).pipe(Effect.orDie)
        if (found._tag === "None") return yield* notFound(params.id)
        // The name is validated and checked for conflicts only when the caller
        // sends one, so a payload that carries the publish flag alone leaves
        // the name as it is.
        let name: string | undefined
        if (payload.name !== undefined) {
          name = yield* validateName(payload.name)
          const existing = yield* repo.findByNormalizedName(userId, name, params.id).pipe(Effect.orDie)
          if (existing._tag === "Some") return yield* conflict()
        }
        const updated = yield* repo.update(userId, params.id, {
          ...(name !== undefined ? { name } : {}),
          ...(payload.emoji !== undefined ? { emoji: payload.emoji } : {}),
          ...(payload.color !== undefined ? { color: payload.color } : {}),
          ...(payload.isPublished !== undefined ? { isPublished: payload.isPublished } : {}),
        }).pipe(Effect.orDie)
        if (updated._tag === "None") return yield* notFound(params.id)
        if (name !== undefined) {
          yield* analytics
            .track({ name: "folder_renamed", userId })
            .pipe(Effect.forkDetach)
        }
        if (payload.isPublished !== undefined) {
          const profile = yield* profiles.findByUser(userId).pipe(Effect.orDie)
          if (profile._tag === "Some" && profile.value.visibility === "public") {
            yield* cachePurger.purge(profile.value.handle)
          }
          yield* analytics
            .track({
              name: "folder_publish_changed",
              userId,
              properties: { is_published: payload.isPublished },
            })
            .pipe(Effect.forkDetach)
        }
        return toDto(updated.value)
      }),
    ))
    .handle("remove", gated("folders:delete", ({ params }) =>
      Effect.gen(function* () {
        const repo = yield* FolderRepository
        const profiles = yield* ProfileRepository
        const cachePurger = yield* PublicProfileCachePurger
        const analytics = yield* Analytics
        const userId = yield* CurrentUser
        const found = yield* repo.findByUserAndId(userId, params.id).pipe(Effect.orDie)
        if (found._tag === "None") return yield* notFound(params.id)
        const removed = yield* repo.deleteByUserAndId(userId, params.id).pipe(Effect.orDie)
        if (!removed) return yield* notFound(params.id)
        if (found.value.isPublished) {
          const profile = yield* profiles.findByUser(userId).pipe(Effect.orDie)
          if (profile._tag === "Some" && profile.value.visibility === "public") {
            yield* cachePurger.purge(profile.value.handle)
          }
        }
        yield* Effect.logInfo("Deleted folder")
        yield* analytics
          .track({ name: "folder_deleted", userId })
          .pipe(Effect.forkDetach)
      }),
    )),
)
