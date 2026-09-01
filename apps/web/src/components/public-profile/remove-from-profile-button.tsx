import { BookmarkMinus, LoaderCircle, RotateCcw } from "lucide-react"
import { useSyncExternalStore } from "react"

import { authClient } from "../../auth"
import { useMoveSavedItemToFolder } from "../../sleevy/folders"
import { useProfile } from "../../sleevy/profile"
import { useSavedItems } from "../../sleevy/saved-items"
import styles from "./save-to-library-button.module.scss"

type RemoveState = "idle" | "removing" | "failed"

const labels: Record<RemoveState, string> = {
  idle: "Remove from your Public Profile",
  removing: "Removing from your Public Profile…",
  failed: "That removal did not go through. Try again",
}

const icons: Record<RemoveState, typeof BookmarkMinus> = {
  idle: BookmarkMinus,
  removing: LoaderCircle,
  failed: RotateCcw,
}

type Props = {
  readonly handle: string
  readonly url: string
  readonly name: string
  readonly onRemoved: () => void
}

const subscribe = () => () => {}
const getClientSnapshot = () => true
const getServerSnapshot = () => false

/**
 * This is deliberately a client-only owner shortcut. Public Saved Item DTOs do
 * not expose IDs, so the signed-in Library supplies the matching Saved Item and
 * the existing folder mutation moves it to No Folder.
 */
export function RemoveFromProfileButton({ handle, url, name, onRemoved }: Props) {
  const { data: session, isPending: isSessionPending } = authClient.useSession()
  const isAttached = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot)
  const { profile, isLoading: isProfileLoading } = useProfile(isAttached && !!session)
  const { data: savedItems, isLoading: areSavedItemsLoading } = useSavedItems(
    "newest",
    undefined,
    isAttached && !!session,
  )
  const moveMutation = useMoveSavedItemToFolder()

  if (
    !isAttached ||
    isSessionPending ||
    !session ||
    isProfileLoading ||
    areSavedItemsLoading ||
    profile?.handle !== handle
  ) {
    return null
  }

  const item = savedItems?.savedItems.find((savedItem) => savedItem.originalUrl === url)
  if (!item) return null

  const state: RemoveState = moveMutation.isPending
    ? "removing"
    : moveMutation.isError
      ? "failed"
      : "idle"
  const Icon = icons[state]

  const remove = () => {
    moveMutation.mutate(
      { itemId: item.id, folderId: null },
      { onSuccess: onRemoved },
    )
  }

  return (
    <button
      type="button"
      className={[styles.save, styles.remove, state === "removing" ? styles.saving : undefined, state === "failed" ? styles.failed : undefined]
        .filter(Boolean)
        .join(" ")}
      onClick={remove}
      disabled={state === "removing"}
      aria-label={`${labels[state]}: ${name}`}
      aria-live="polite"
      title={labels[state]}
    >
      <Icon strokeWidth={2} aria-hidden="true" />
    </button>
  )
}
