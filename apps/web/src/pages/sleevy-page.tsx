import { useCallback, useEffect } from "react"

import { type SavedItem, useDeleteItem, useMarkAsRead, useSavedItems, useSetReadState } from "../sleevy/saved-items"
import { SavedCard } from "../components/saved-card/saved-card"
import { SavedListSkeleton } from "../components/saved-card/saved-card-skeleton"
import { useKeyboardNav } from "../contexts/keyboard-nav-context"
import { useSelectedItemActions } from "../hooks/use-selected-item-actions"

export function SleevyPage() {
  const savedItemsQuery = useSavedItems()
  const deleteMutation = useDeleteItem()
  const markAsReadMutation = useMarkAsRead()
  const setReadStateMutation = useSetReadState()
  const { selectedIndex, setSelectedIndex, setListLength, setItemActions, pendingDelete } = useKeyboardNav()

  const items = (savedItemsQuery.data?.savedItems ?? []).filter((item) => !item.isRead)

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
        <h1 className="page-title">Inbox</h1>
      </div>

      {savedItemsQuery.isLoading ? <SavedListSkeleton /> : null}
      {savedItemsQuery.isError ? <p>Could not load saved items.</p> : null}

      {!savedItemsQuery.isLoading && !savedItemsQuery.isError ? (
        items.length === 0 ? (
          <p>Inbox is empty. Save something above.</p>
        ) : (
          <ul className="item-list">
            {items.map((item, index) => (
              <li key={item.id}>
                <SavedCard item={item} isSelected={index === selectedIndex} pendingDelete={index === selectedIndex && pendingDelete} onDelete={(id) => deleteMutation.mutate(id)} onOpen={(id) => markAsReadMutation.mutate(id)} onSetReadState={(id, isRead) => setReadStateMutation.mutate({ id, isRead })} />
              </li>
            ))}
          </ul>
        )
      ) : null}
    </>
  )
}
