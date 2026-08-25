import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import type { FolderDto, FoldersResponse } from "@sleevy/contract"

import { apiFetch } from "./api"
import { savedItemsQueryKey } from "./saved-items"

export type Folder = FolderDto.Encoded
type FoldersResponseJson = FoldersResponse.Encoded

const foldersQueryKey = ["folders"] as const
export const SAVED_ITEM_DRAG_TYPE = "application/x-sleevy-saved-item"

// apiFetch throws the response body as the message of an Error, and the API
// writes every failure as a tagged JSON object. This reads that body so a
// folder dialog can show the text the API sent.
export function folderErrorMessage(cause: unknown): string {
  if (!(cause instanceof Error)) return "Something went wrong."
  try {
    const data = JSON.parse(cause.message) as { message?: string }
    return data.message ?? cause.message
  } catch {
    return cause.message
  }
}

export function useFolders() {
  return useQuery({
    queryKey: foldersQueryKey,
    queryFn: () => apiFetch<FoldersResponseJson>("/v1/folders"),
    staleTime: 30_000,
  })
}

export function useCreateFolder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (name: string) =>
      apiFetch<Folder>("/v1/folders", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: foldersQueryKey }),
  })
}

export function useRenameFolder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, name, color }: {
      readonly id: string
      readonly name: string
      readonly color?: string | null
    }) => {
      const body: { name: string; color?: string | null } = { name }
      if (color !== undefined) body.color = color
      return apiFetch<Folder>(`/v1/folders/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: foldersQueryKey })
      void queryClient.invalidateQueries({ queryKey: savedItemsQueryKey })
    },
  })
}

// Publishes one Folder to the Public Profile, or takes it back off. Every Saved
// Item inside a published Folder appears on the page while Profile Visibility is
// public; nothing else publishes a Saved Item. The payload carries `isPublished`
// alone, because an omitted field keeps its stored value and the name, emoji,
// and colour are not being changed here. Saved Items are invalidated too, since
// every row carries its Folder Summary and reads the publish state from it.
export function useSetFolderPublished() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, isPublished }: { readonly id: string; readonly isPublished: boolean }) =>
      apiFetch<Folder>(`/v1/folders/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ isPublished }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: foldersQueryKey })
      void queryClient.invalidateQueries({ queryKey: savedItemsQueryKey })
    },
  })
}

export function useDeleteFolder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/v1/folders/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: foldersQueryKey })
      void queryClient.invalidateQueries({ queryKey: savedItemsQueryKey })
    },
  })
}

export function useMoveSavedItemToFolder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ itemId, folderId }: { readonly itemId: string; readonly folderId: string | null }) =>
      apiFetch<void>(`/v1/saved-items/${encodeURIComponent(itemId)}/folder`, {
        method: "PUT",
        body: JSON.stringify({ folderId }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: savedItemsQueryKey })
    },
  })
}
