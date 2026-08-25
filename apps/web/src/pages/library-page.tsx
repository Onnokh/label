import { useCallback, useEffect, useState } from "react"
import { Library, Pencil } from "lucide-react"

import { type SavedItem, type SavedItemSort, useDeleteItem, useMarkAsRead, useSavedItems, useSetReadState } from "../sleevy/saved-items"
import { SavedCard } from "../components/saved-card/saved-card"
import { SavedListSkeleton } from "../components/saved-card/saved-card-skeleton"
import { FolderCardGrid } from "../components/folders/folder-card-grid"
import { FolderEditDialog } from "../components/folders/folder-dialog"
import { useSourceFilter } from "../components/source-filter/source-filter"
import { getSourceGroup } from "../components/source-filter/source-filter-utils"
import { useKeyboardNav } from "../contexts/keyboard-nav-context"
import { useSelectedItemActions } from "../hooks/use-selected-item-actions"
import { folderErrorMessage, type Folder, useFolders, useRenameFolder } from "../sleevy/folders"
import { Button } from "../components/ui/button/button"

export function LibraryPage({ folderId }: { readonly folderId?: string }) {
  const [sort, setSort] = useState<SavedItemSort>("newest")
  // TanStack Query should fetch again when users select a different sort or folder.
  // eslint-disable-next-line react-doctor/no-event-handler
  const savedItemsQuery = useSavedItems(sort, folderId ?? "none")
  const allSavedItemsQuery = useSavedItems()
  const foldersQuery = useFolders()
  const renameMutation = useRenameFolder()
  const deleteMutation = useDeleteItem()
  const markAsReadMutation = useMarkAsRead()
  const setReadStateMutation = useSetReadState()
  const { activeSource, activeType, activeTag } = useSourceFilter()
  const { selectedIndex, setSelectedIndex, setListLength, setItemActions, pendingDelete } = useKeyboardNav()
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null)

  const activeFilters = [
    activeType ? { label: "Type", value: activeType } : null,
    activeTag ? { label: "Tag", value: activeTag } : null,
    activeSource ? { label: "Source", value: activeSource } : null,
  ].filter((filter): filter is { label: string; value: string } => filter !== null)

  const allItems = savedItemsQuery.data?.savedItems ?? []
  const folders = foldersQuery.data?.folders ?? []
  const showFolderGrid = !folderId && folders.length > 0
  const folder = foldersQuery.data?.folders.find((candidate) => candidate.id === folderId)
  const items = allItems.filter((item) =>
    (!activeSource || getSourceGroup(item) === activeSource)
    && (!activeType || item.type === activeType)
    && (!activeTag || item.tags.includes(activeTag as (typeof item.tags)[number]))
  )
  const unreadCount = items.filter((item) => !item.isRead).length

  const getItemActions = useCallback((item: SavedItem) => ({
    onOpen: () => {
      if (!item.isRead) markAsReadMutation.mutate(item.id)
      window.open(item.originalUrl, "_blank", "noreferrer")
    },
    onToggleRead: () => setReadStateMutation.mutate({ id: item.id, isRead: !item.isRead }),
    onCopyUrl: () => void navigator.clipboard.writeText(item.originalUrl).catch(() => {}),
    onDelete: () => deleteMutation.mutate(item.id),
  }), [deleteMutation, markAsReadMutation, setReadStateMutation])

  useSelectedItemActions({ items, selectedIndex, setListLength, setItemActions, getItemActions })

  useEffect(() => {
    if (selectedIndex >= items.length) setSelectedIndex(Math.max(items.length - 1, -1))
  }, [items.length, selectedIndex, setSelectedIndex])

  return (
    <>
      <div className="page-header">
        <div className="page-heading">
          <h1 className="page-title">
            <span>{folderId ? (folder?.name ?? "Folder") : "Library"}</span>
            {activeFilters.length > 0 && (
              <span className="page-title-filters">
                {activeFilters.map((filter) => (
                  <span className="page-title-filter" key={`${filter.label}:${filter.value}`}>
                    <span className="page-title-filter-label">{filter.label}</span>
                    <span className="page-title-filter-value">{filter.value}</span>
                  </span>
                ))}
              </span>
            )}
          </h1>
          {savedItemsQuery.data ? (
            <p className="page-subtitle">
              {items.length} {items.length === 1 ? "save" : "saves"} · {unreadCount} unread
            </p>
          ) : null}
        </div>
        <div className="page-header-actions">
          {folder ? (
            <Button variant="ghost" className="folder-edit-button" type="button" onClick={() => setEditingFolder(folder)}>
              <Pencil size={15} aria-hidden="true" />
              <span>Edit</span>
            </Button>
          ) : null}
          <label className="library-sort">
            <span>Sort</span>
            <select
              aria-label="Sort library"
              value={sort}
              onChange={(event) => setSort(event.target.value as SavedItemSort)}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="title">Title A-Z</option>
              <option value="unread">Unread first</option>
            </select>
          </label>
        </div>
      </div>

      {showFolderGrid ? (
        <FolderCardGrid
          folders={folders}
          items={allSavedItemsQuery.data?.savedItems ?? []}
        />
      ) : null}

      {savedItemsQuery.isLoading ? <SavedListSkeleton /> : null}
      {savedItemsQuery.isError ? <p>Could not load saved items.</p> : null}

      {!savedItemsQuery.isLoading && !savedItemsQuery.isError ? (
        items.length === 0 && !showFolderGrid ? (
          <div className="empty-state">
            <span className="empty-state-icon" aria-hidden="true">
              <Library size={28} strokeWidth={1.75} />
            </span>
            <p>{folderId ? "This folder is empty." : "Your Library home is empty."}</p>
          </div>
        ) : items.length > 0 ? (
          <ul className="item-list">
            {items.map((item, index) => (
              <li key={item.id}>
                <SavedCard item={item} isSelected={index === selectedIndex} pendingDelete={index === selectedIndex && pendingDelete} onDelete={(id) => deleteMutation.mutate(id)} onOpen={(id) => markAsReadMutation.mutate(id)} onSetReadState={(id, isRead) => setReadStateMutation.mutate({ id, isRead })} />
              </li>
            ))}
          </ul>
        ) : null
      ) : null}

      {editingFolder ? (
        <FolderEditDialog
          folder={editingFolder}
          isPending={renameMutation.isPending}
          error={renameMutation.error ? folderErrorMessage(renameMutation.error) : null}
          onClose={() => {
            renameMutation.reset()
            setEditingFolder(null)
          }}
          onSubmit={(name, color) => renameMutation.mutate({ id: editingFolder.id, name, color }, { onSuccess: () => setEditingFolder(null) })}
        />
      ) : null}
    </>
  )
}
