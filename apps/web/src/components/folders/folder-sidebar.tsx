import { Link, useLocation, useNavigate } from "@tanstack/react-router"
import { EyeOff, Folder as FolderIcon, MoreVertical, Plus } from "lucide-react"
import { type DragEvent, useState } from "react"

import { ContextMenu, type ContextMenuItem } from "../ui/context-menu/context-menu"
import { FolderDeleteDialog, FolderNameDialog } from "./folder-dialog"
import {
  SAVED_ITEM_DRAG_TYPE,
  type Folder,
  useCreateFolder,
  useDeleteFolder,
  useFolders,
  useMoveSavedItemToFolder,
  useRenameFolder,
  useSetFolderPrivate,
} from "../../sleevy/folders"
import { useIsProfilePublic } from "../../sleevy/profile"
import { useSavedItems } from "../../sleevy/saved-items"
import styles from "./folder-sidebar.module.scss"

const privateFolderLabel =
  "Private folder. A visitor to your Public Profile sees nothing inside it."

function errorMessage(cause: unknown): string {
  if (!(cause instanceof Error)) return "Something went wrong."
  try {
    const data = JSON.parse(cause.message) as { message?: string }
    return data.message ?? cause.message
  } catch {
    return cause.message
  }
}

export function FolderSidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const foldersQuery = useFolders()
  const allItemsQuery = useSavedItems()
  const createMutation = useCreateFolder()
  const renameMutation = useRenameFolder()
  const deleteMutation = useDeleteFolder()
  const moveMutation = useMoveSavedItemToFolder()
  const setPrivateMutation = useSetFolderPrivate()
  const isProfilePublic = useIsProfilePublic()
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState<Folder | null>(null)
  const [deleting, setDeleting] = useState<Folder | null>(null)
  const [dragFolderId, setDragFolderId] = useState<string | null>(null)

  const folders = foldersQuery.data?.folders ?? []
  const items = allItemsQuery.data?.savedItems ?? []
  const counts = new Map<string, number>()
  for (const item of items) {
    if (item.folder) counts.set(item.folder.id, (counts.get(item.folder.id) ?? 0) + 1)
  }

  const dropItem = (event: DragEvent, folderId: string) => {
    event.preventDefault()
    setDragFolderId(null)
    const itemId = event.dataTransfer.getData(SAVED_ITEM_DRAG_TYPE)
    if (itemId) moveMutation.mutate({ itemId, folderId })
  }

  return (
    <>
      <div className={styles.section}>
        <div className={styles.header}>
          <h3 className={styles.heading}>Folders</h3>
          <button className={styles.add} type="button" aria-label="New folder" onClick={() => setCreating(true)}>
            <Plus size={14} />
          </button>
        </div>
        {foldersQuery.isError ? <p className={styles.feedback}>Could not load folders.</p> : null}
        <ul className={styles.list}>
          {folders.map((folder) => {
            const menu: readonly ContextMenuItem[] = [
              { key: "rename", label: "Rename", onClick: () => setRenaming(folder) },
              {
                key: "private",
                // The label states the stored marker, which is how the flag stays
                // legible while Profile Visibility is private and the row shows
                // no marker.
                label: folder.isPrivate ? "Show on Public Profile" : "Hide from Public Profile",
                onClick: () => setPrivateMutation.mutate({ id: folder.id, isPrivate: !folder.isPrivate }),
              },
              { key: "delete", label: "Delete", destructive: true, onClick: () => setDeleting(folder) },
            ]
            return (
              <li
                className={dragFolderId === folder.id ? styles.dropActive : undefined}
                key={folder.id}
                onDragOver={(event) => {
                  event.preventDefault()
                  setDragFolderId(folder.id)
                }}
                onDragLeave={() => setDragFolderId(null)}
                onDrop={(event) => dropItem(event, folder.id)}
              >
                <Link
                  to="/library/folders/$folderId"
                  params={{ folderId: folder.id }}
                  className={styles.item}
                  activeProps={{ className: `${styles.item} ${styles.active}` }}
                >
                  <FolderIcon size={14} className={styles.icon} />
                  <span className={styles.name}>{folder.name}</span>
                  {isProfilePublic && folder.isPrivate ? (
                    <span
                      className={styles.privateMarker}
                      role="img"
                      aria-label={privateFolderLabel}
                      title={privateFolderLabel}
                    >
                      <EyeOff size={12} />
                    </span>
                  ) : null}
                  <span className={styles.count}>{counts.get(folder.id) ?? 0}</span>
                </Link>
                <div className={styles.menu}>
                  <ContextMenu items={menu} triggerClassName={styles.trigger} triggerLabel={<MoreVertical size={14} />} />
                </div>
              </li>
            )
          })}
        </ul>
      </div>

      {creating ? (
        <FolderNameDialog
          open
          title="New Folder"
          submitLabel="Create Folder"
          isPending={createMutation.isPending}
          error={createMutation.error ? errorMessage(createMutation.error) : null}
          onClose={() => {
            createMutation.reset()
            setCreating(false)
          }}
          onSubmit={(name) => createMutation.mutate(name, { onSuccess: () => setCreating(false) })}
        />
      ) : null}
      {renaming ? (
        <FolderNameDialog
          open
          title="Rename Folder"
          initialName={renaming.name}
          submitLabel="Save"
          isPending={renameMutation.isPending}
          error={renameMutation.error ? errorMessage(renameMutation.error) : null}
          onClose={() => {
            renameMutation.reset()
            setRenaming(null)
          }}
          onSubmit={(name) => renameMutation.mutate({ id: renaming.id, name }, { onSuccess: () => setRenaming(null) })}
        />
      ) : null}
      <FolderDeleteDialog
        folderName={deleting?.name ?? null}
        isPending={deleteMutation.isPending}
        error={deleteMutation.error ? errorMessage(deleteMutation.error) : null}
        onClose={() => {
          deleteMutation.reset()
          setDeleting(null)
        }}
        onDelete={() => {
          if (!deleting) return
          deleteMutation.mutate(deleting.id, {
            onSuccess: () => {
              if (location.pathname === `/library/folders/${deleting.id}`) {
                void navigate({ to: "/library" })
              }
              setDeleting(null)
            },
          })
        }}
      />
    </>
  )
}
