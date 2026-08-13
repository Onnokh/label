import { useQueryClient } from "@tanstack/react-query"
import { BookmarkCheck, BookmarkPlus, LoaderCircle, RotateCcw } from "lucide-react"
import { useEffect, useState } from "react"

import { authClient } from "../../auth"
import { capturePublicProfileLink, savedItemsQueryKey } from "../../sleevy/saved-items"
import styles from "./save-to-library-button.module.scss"

type SaveState = "idle" | "saving" | "saved" | "failed"

// The button carries an icon only, so the state has to be readable without words:
// these labels are what a screen reader hears and what the tooltip says.
const labels: Record<SaveState, string> = {
  idle: "Save to your Library",
  saving: "Saving…",
  saved: "Saved to your Library",
  failed: "That save did not go through. Try again",
}

const icons: Record<SaveState, typeof BookmarkPlus> = {
  idle: BookmarkPlus,
  saving: LoaderCircle,
  saved: BookmarkCheck,
  failed: RotateCcw,
}

type Props = {
  readonly url: string
  /** The item name, so a screen reader hears which row the button belongs to. */
  readonly name: string
}

export function SaveToLibraryButton({ url, name }: Props) {
  const { data: session, isPending } = authClient.useSession()
  const queryClient = useQueryClient()
  const [isAttached, setIsAttached] = useState(false)
  const [state, setState] = useState<SaveState>("idle")

  // The API serves a Public Profile with `cache-control: public, max-age=300`,
  // so one visitor's markup is handed to the next visitor. This effect runs in
  // the browser only, which keeps the button out of the server-rendered HTML
  // and therefore out of that shared cache.
  useEffect(() => {
    setIsAttached(true)
  }, [])

  // A signed-out visitor gets no button and no invitation to sign in.
  if (!isAttached || isPending || !session) return null

  const save = async () => {
    setState("saving")
    try {
      await capturePublicProfileLink(url)
      // A repeat click is a Duplicate Save, which the API treats as an update,
      // so the row settles on the same state either way.
      setState("saved")
      // The visitor stays on the profile, but their own Library changed.
      void queryClient.invalidateQueries({ queryKey: savedItemsQueryKey })
    } catch {
      // A failed save leaves the rest of the page untouched; the row offers
      // another try.
      setState("failed")
    }
  }

  const stateClass = state === "saved"
    ? styles.saved
    : state === "failed"
      ? styles.failed
      : state === "saving"
        ? styles.saving
        : undefined

  const Icon = icons[state]

  return (
    <button
      type="button"
      className={[styles.save, stateClass].filter(Boolean).join(" ")}
      onClick={() => void save()}
      disabled={state === "saving"}
      aria-label={`${labels[state]}: ${name}`}
      aria-live="polite"
      title={labels[state]}
    >
      <Icon strokeWidth={2} aria-hidden="true" />
    </button>
  )
}
