import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

import type { FolderId, SavedItemId } from "../domain/SavedItem.js"
import { FolderRepository } from "../modules/folders/FolderRepository.js"
import { SavedItemRepository } from "../modules/saved-items/SavedItemRepository.js"
import { Analytics } from "../modules/analytics/Analytics.js"
import {
  CurrentUser,
  FolderNotFoundError,
  SavedItemNotFoundError,
  SavedItemsResponse,
  savedItemToDto,
  sleevyApi,
} from "./ApiContract.js"
import { gated, gatedAny } from "./AuthMiddleware.js"

const setSavedItemReadState = (id: SavedItemId, isRead: boolean) =>
  Effect.gen(function* () {
    const repo = yield* SavedItemRepository
    const userId = yield* CurrentUser
    const item = yield* repo.findByUserAndId(userId, id).pipe(Effect.orDie)
    if (item._tag === "None") {
      return yield* new SavedItemNotFoundError({
        message: "Saved Item was not found.",
        savedItemId: id,
      })
    }
    const updated = yield* repo.setReadState(userId, id, isRead).pipe(Effect.orDie)
    if (updated._tag === "None") {
      return yield* new SavedItemNotFoundError({
        message: "Saved Item was not found.",
        savedItemId: id,
      })
    }
    return savedItemToDto(updated.value)
  })

const missingFolder = (id: string) => new FolderNotFoundError({
  message: "Folder was not found.",
  folderId: id,
})

export const savedItemsGroupLive = HttpApiBuilder.group(sleevyApi, "saved-items", (handlers) =>
  handlers
    .handle("list", gated("saved-items:read", ({ query }) =>
      Effect.gen(function* () {
        const repo = yield* SavedItemRepository
        const folders = yield* FolderRepository
        const userId = yield* CurrentUser
        let folderId: FolderId | null | undefined
        if (query.folder === "none") {
          folderId = null
        } else if (query.folder !== undefined) {
          const folder = yield* folders.findByUserAndId(userId, query.folder as FolderId).pipe(Effect.orDie)
          if (folder._tag === "None") return yield* missingFolder(query.folder)
          folderId = query.folder as FolderId
        }
        const items = yield* repo.listByUser(userId, query.sort ?? "newest", folderId).pipe(Effect.orDie)
        return new SavedItemsResponse({ savedItems: items.map(savedItemToDto) })
      }),
    ))
    .handle("markOpened", gated("saved-items:write", ({ params }) =>
      Effect.gen(function* () {
        const repo = yield* SavedItemRepository
        const analytics = yield* Analytics
        const userId = yield* CurrentUser
        const item = yield* repo.findByUserAndId(userId, params.id).pipe(Effect.orDie)
        if (item._tag === "None") {
          return yield* new SavedItemNotFoundError({
            message: "Saved Item was not found.",
            savedItemId: params.id,
          })
        }
        const updated = yield* repo.setReadState(userId, params.id, true).pipe(Effect.orDie)
        if (updated._tag === "None") {
          return yield* new SavedItemNotFoundError({
            message: "Saved Item was not found.",
            savedItemId: params.id,
          })
        }
        yield* analytics
          .track({ name: "item_opened", userId })
          .pipe(Effect.forkDetach)
        return savedItemToDto(updated.value)
      }),
    ))
    .handle("markRead", gated("saved-items:write", ({ params }) => setSavedItemReadState(params.id, true)))
    .handle("markUnread", gated("saved-items:write", ({ params }) => setSavedItemReadState(params.id, false)))
    .handle("setReadState", gated("saved-items:write", ({ params, payload }) => setSavedItemReadState(params.id, payload.isRead)))
    .handle("setFolder", gated("saved-items:write", ({ params, payload }) =>
      Effect.gen(function* () {
        const repo = yield* SavedItemRepository
        const folders = yield* FolderRepository
        const analytics = yield* Analytics
        const userId = yield* CurrentUser
        const folderId = payload.folderId as FolderId | null

        if (folderId !== null) {
          const folder = yield* folders.findByUserAndId(userId, folderId).pipe(Effect.orDie)
          if (folder._tag === "None") return yield* missingFolder(folderId)
        }

        const updated = yield* repo.setFolder(userId, params.id, folderId).pipe(Effect.orDie)
        if (updated._tag === "None") {
          return yield* new SavedItemNotFoundError({
            message: "Saved Item was not found.",
            savedItemId: params.id,
          })
        }
        yield* analytics
          .track({
            name: "item_moved",
            userId,
            properties: { destination: folderId === null ? "none" : "folder" },
          })
          .pipe(Effect.forkDetach)
        return savedItemToDto(updated.value)
      }),
    ))
    // Accept either saved-items:write or the dedicated saved-items:delete scope.
    // Raycast tokens only carry :write, so this lets them delete without a plugin
    // republish, while explicit :delete grants keep working.
    .handle("remove", gatedAny(["saved-items:write", "saved-items:delete"], ({ params }) =>
      Effect.gen(function* () {
        const repo = yield* SavedItemRepository
        const analytics = yield* Analytics
        const userId = yield* CurrentUser
        yield* repo.deleteByUserAndId(userId, params.id).pipe(Effect.orDie)
        yield* Effect.logInfo("Deleted bookmark")
        yield* analytics
          .track({ name: "item_deleted", userId })
          .pipe(Effect.forkDetach)
      }),
    )),
)
