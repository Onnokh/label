import { Link } from "@tanstack/react-router"
import { CircleUserRound } from "lucide-react"
import { useState, type DragEvent } from "react"

import type { SavedItem } from "../../sleevy/saved-items"
import { useIsProfilePublic } from "../../sleevy/profile"
import {
  SAVED_ITEM_DRAG_TYPE,
  type Folder,
  useMoveSavedItemToFolder,
} from "../../sleevy/folders"
import { FolderCardBackground } from "./folder-card-background"
import styles from "./folder-card-grid.module.scss"

type FolderCardGridProps = {
  readonly folders: readonly Folder[]
  readonly items: readonly SavedItem[]
}

export function FolderCardGrid({ folders, items }: FolderCardGridProps) {
  const moveMutation = useMoveSavedItemToFolder()
  const isProfilePublic = useIsProfilePublic()
  const [dropFolderId, setDropFolderId] = useState<string | null>(null)
  const counts = new Map<string, number>()

  for (const item of items) {
    if (item.folder) counts.set(item.folder.id, (counts.get(item.folder.id) ?? 0) + 1)
  }

  const dropItem = (event: DragEvent, folderId: string) => {
    event.preventDefault()
    setDropFolderId(null)
    const itemId = event.dataTransfer.getData(SAVED_ITEM_DRAG_TYPE)
    if (itemId) moveMutation.mutate({ itemId, folderId })
  }

  return (
    <section className={styles.section} aria-labelledby="folder-grid-title">
      <h2 className={styles.heading} id="folder-grid-title">Folders</h2>
      <ul className={styles.grid}>
        {folders.map((folder) => {
          const count = counts.get(folder.id) ?? 0
          const isPublished = isProfilePublic && folder.isPublished
          const countLabel = count === 1 ? "1 saved item" : `${count} saved items`
          const label = isPublished
            ? `${folder.name}, ${countLabel}, on your public profile`
            : `${folder.name}, ${countLabel}`

          return (
            <li key={folder.id}>
              <Link
                to="/library/folders/$folderId"
                params={{ folderId: folder.id }}
                className={styles.card}
                data-drop-active={dropFolderId === folder.id || undefined}
                aria-label={label}
                onDragOver={(event) => {
                  event.preventDefault()
                  setDropFolderId(folder.id)
                }}
                onDragLeave={() => setDropFolderId(null)}
                onDrop={(event) => dropItem(event, folder.id)}
              >
                <FolderCardBackground folderId={folder.id} color={folder.color} />
                <span className={styles.name}>{folder.name}</span>
                <span className={styles.meta} aria-hidden="true">
                  {isPublished ? (
                    <>
                      <CircleUserRound className={styles.published} size={16} strokeWidth={2} />
                      <span className={styles.divider} />
                    </>
                  ) : null}
                  <span className={styles.count}>{count}</span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
