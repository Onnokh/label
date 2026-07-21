import { useRef } from "react"
import clsx from "clsx"
import { differenceInHours, differenceInMinutes, format } from "date-fns"
import { MoreVertical } from "lucide-react"

import type { SavedItem } from "../../sleevy/saved-items"
import { SAVED_ITEM_DRAG_TYPE, useFolders, useMoveSavedItemToFolder } from "../../sleevy/folders"
import { ContextMenu, type ContextMenuItem } from "../ui/context-menu/context-menu"
import styles from "./saved-card.module.scss"

type Props = {
  readonly item: SavedItem
  readonly isSelected?: boolean
  readonly pendingDelete?: boolean
  readonly onDelete: (id: string) => void
  readonly onOpen: (id: string) => void
  readonly onSetReadState: (id: string, isRead: boolean) => void
}

function faviconUrl(host: string) {
  return `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://${host}&size=64`
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  const now = new Date()
  const minutes = differenceInMinutes(now, date)
  if (minutes < 1) return "now"
  if (minutes < 60) return `${minutes}m`

  const hours = differenceInHours(now, date)
  if (hours < 24) return `${hours}h`

  return format(date, date.getFullYear() === now.getFullYear() ? "MMM d" : "MMM d, yyyy")
}

export function SavedCard({ item, isSelected, pendingDelete, onDelete, onOpen, onSetReadState }: Props) {
  const foldersQuery = useFolders()
  const moveMutation = useMoveSavedItemToFolder()
  const rowRef = useRef<HTMLDivElement>(null)
  const wasSelectedRef = useRef(false)

  if (isSelected && !wasSelectedRef.current) {
    rowRef.current?.scrollIntoView({ block: "nearest" })
  }
  wasSelectedRef.current = isSelected ?? false

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(item.originalUrl)
    } catch {
      /* clipboard not available */
    }
  }

  const moveItems: ContextMenuItem[] = item.folder
    ? [{ key: "move-root", label: "Library", onClick: () => moveMutation.mutate({ itemId: item.id, folderId: null }) }]
    : []
  for (const folder of foldersQuery.data?.folders ?? []) {
    if (folder.id !== item.folder?.id) {
      moveItems.push({
        key: `move-${folder.id}`,
        label: folder.name,
        onClick: () => moveMutation.mutate({ itemId: item.id, folderId: folder.id }),
      })
    }
  }
  const items: readonly ContextMenuItem[] = [
    { key: "open", label: "Open", href: item.originalUrl },
    { key: "read", label: item.isRead ? "Mark Unread" : "Mark Read", onClick: () => onSetReadState(item.id, !item.isRead) },
    { key: "copy", label: "Copy URL", onClick: copyUrl },
    ...(moveItems.length > 0 ? [{ key: "move", label: "Move to", items: moveItems }] : []),
    { key: "delete", label: "Delete", destructive: true, onClick: () => onDelete(item.id) },
  ]

  const date = formatDate(item.lastSavedAt)

  if (pendingDelete) {
    return (
      <div ref={rowRef} className={clsx(styles.row, styles.selected, styles.deleteConfirm)}>
        <span className={styles.deletePrompt}>
          Delete this item? <kbd className={styles.kbd}>y</kbd> yes <kbd className={styles.kbd}>n</kbd> no
        </span>
      </div>
    )
  }

  return (
    <div
      ref={rowRef}
      className={clsx(styles.row, isSelected && styles.selected)}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move"
        event.dataTransfer.setData(SAVED_ITEM_DRAG_TYPE, item.id)
      }}
    >
      <a
        className={styles.link}
        href={item.originalUrl}
        target="_blank"
        rel="noreferrer"
        title={item.previewSummary}
        onClick={() => { if (!item.isRead) onOpen(item.id) }}
      >
        <img
          className={styles.favicon}
          src={faviconUrl(item.host)}
          alt=""
          width={28}
          height={28}
          loading="lazy"
        />

        <div className={styles.body}>
          <span className={styles.title}>{item.title ?? item.host}</span>
          <span className={styles.host}>{item.host}</span>
        </div>

        <span className={clsx(styles.date, !item.isRead && styles.unreadDate)}>{date}</span>
      </a>

      <div className={styles["menu-wrapper"]}>
        <ContextMenu
          items={items}
          triggerClassName={styles["menu-trigger"]}
          triggerLabel={<MoreVertical size={16} />}
        />
      </div>
    </div>
  )
}
