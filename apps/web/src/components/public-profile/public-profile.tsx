import { type FormEvent, useEffect, useState } from "react"

import {
  displayProfileUrl,
  errorMessageOf,
  handleProblem,
  normalizeHandle,
  publicProfileUrl,
  useClaimHandle,
  useHandleAvailability,
  useProfile,
  useRenameHandle,
  useSetProfileVisibility,
} from "../../sleevy/profile"
import { Button } from "../ui/button/button"
import { InputField } from "../ui/input-field/input-field"
import styles from "./public-profile.module.scss"

const HANDLE_RULE = "3 to 30 characters: letters a-z, digits, hyphen, and underscore."

type HandleFormProps = {
  readonly mode: "claim" | "rename"
  readonly currentHandle: string | null
  readonly isPending: boolean
  readonly onSubmit: (handle: string) => void
  readonly onCancel?: () => void
}

function HandleForm({ mode, currentHandle, isPending, onSubmit, onCancel }: HandleFormProps) {
  const [value, setValue] = useState(currentHandle ?? "")
  const [debounced, setDebounced] = useState("")

  const handle = normalizeHandle(value)
  const problem = handle === "" ? null : handleProblem(handle)
  const isOwnHandle = currentHandle !== null && handle === currentHandle

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(handle), 350)
    return () => clearTimeout(timer)
  }, [handle])

  const canCheck = handle !== "" && problem === null && !isOwnHandle && debounced === handle
  const availability = useHandleAvailability(debounced, canCheck)
  const isTaken = canCheck && availability.data?.available === false
  const isFree = canCheck && availability.data?.available === true

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (handle === "" || problem !== null || isTaken || isOwnHandle) return
    onSubmit(handle)
  }

  const status = problem
    ? problem
    : handle === ""
      ? HANDLE_RULE
      : isOwnHandle
        ? "This is your handle already."
        : isTaken
          ? "Someone already has this handle. Choose another one."
          : isFree
            ? "This handle is free."
            : availability.isError
              ? "Could not check this handle. You can still try to save it."
              : "Checking…"

  const hintTone = problem || isTaken ? styles["hint-problem"] : undefined

  return (
    <form className={styles["handle-form"]} onSubmit={submit}>
      <div className={styles["handle-row"]}>
        <InputField
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="your-handle"
          aria-label={mode === "claim" ? "Choose your handle" : "Change your handle"}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          maxLength={30}
        />
        <Button type="submit" disabled={isPending || handle === "" || problem !== null || isTaken || isOwnHandle}>
          {isPending ? "Saving…" : mode === "claim" ? "Claim handle" : "Save handle"}
        </Button>
        {onCancel ? (
          <Button variant="ghost" type="button" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
        ) : null}
      </div>
      <p className={hintTone ? `${styles.hint} ${hintTone}` : styles.hint}>
        {handle === "" ? null : <span className={styles.preview}>{displayProfileUrl(handle)}</span>}
        {status}
      </p>
      {mode === "rename" ? (
        <p className={styles.hint}>
          Your old handle is released immediately, and anyone can then claim it. Links to your old address stop
          working.
        </p>
      ) : null}
    </form>
  )
}

export function PublicProfilePanel() {
  const { profile, isLoading, isError } = useProfile()
  const claim = useClaimHandle()
  const rename = useRenameHandle()
  const setVisibility = useSetProfileVisibility()

  const [isRenaming, setIsRenaming] = useState(false)
  const [isConfirmingPublic, setIsConfirmingPublic] = useState(false)
  const [panelError, setPanelError] = useState<string | null>(null)
  const [isCopied, setIsCopied] = useState(false)

  const isPublic = profile?.visibility === "public"
  const profileUrl = profile ? publicProfileUrl(profile.handle) : ""

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(profileUrl)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
    } catch {
      setPanelError("Could not copy the link.")
    }
  }

  const claimHandle = (handle: string) => {
    setPanelError(null)
    claim.mutate(handle, {
      onError: (cause) => setPanelError(errorMessageOf(cause, "Could not claim this handle.")),
    })
  }

  const renameHandle = (handle: string) => {
    setPanelError(null)
    rename.mutate(handle, {
      onSuccess: () => setIsRenaming(false),
      onError: (cause) => setPanelError(errorMessageOf(cause, "Could not change this handle.")),
    })
  }

  const publish = () => {
    setPanelError(null)
    setVisibility.mutate("public", {
      onSuccess: () => setIsConfirmingPublic(false),
      onError: (cause) => setPanelError(errorMessageOf(cause, "Could not make your profile public.")),
    })
  }

  // Turning the page off is never gated. One click hides it.
  const unpublish = () => {
    setPanelError(null)
    setIsConfirmingPublic(false)
    setVisibility.mutate("private", {
      onError: (cause) => setPanelError(errorMessageOf(cause, "Could not make your profile private.")),
    })
  }

  return (
    <section className="settings-section">
      <div className="section-header">
        <div>
          <h2 className="section-title">Public Profile</h2>
          <p className="section-description">Show what you save on a page of your own</p>
        </div>
      </div>

      <div className="settings-stack">
        {isLoading ? <p className="settings-empty">Loading…</p> : null}
        {isError ? <p className="settings-empty">Could not load your public profile.</p> : null}

        {!isLoading && !isError && profile === null ? (
          <>
            <p className={styles.intro}>
              Choose a handle to hold your page address. Your handle is yours from that moment, and your profile
              stays private until you make it public yourself.
            </p>
            <HandleForm mode="claim" currentHandle={null} isPending={claim.isPending} onSubmit={claimHandle} />
          </>
        ) : null}

        {!isLoading && !isError && profile !== null ? (
          <>
            <div className={styles.summary}>
              <div className={styles["summary-body"]}>
                <span className={styles.url}>{displayProfileUrl(profile.handle)}</span>
                <span className={styles.state}>
                  {isPublic
                    ? "Public. Anyone with this link can read your page."
                    : "Private. Nobody can reach this address, and your handle stays reserved for you."}
                </span>
              </div>
              {isPublic ? (
                <div className={styles["summary-actions"]}>
                  <Button variant="ghost" type="button" onClick={() => void copyUrl()}>
                    {isCopied ? "Copied" : "Copy link"}
                  </Button>
                  <a className={styles.open} href={profileUrl} target="_blank" rel="noreferrer">
                    Open
                  </a>
                </div>
              ) : null}
            </div>

            {isRenaming ? (
              <HandleForm
                mode="rename"
                currentHandle={profile.handle}
                isPending={rename.isPending}
                onSubmit={renameHandle}
                onCancel={() => setIsRenaming(false)}
              />
            ) : null}

            {isConfirmingPublic ? (
              <div className={styles.confirm}>
                <h3 className={styles["confirm-title"]}>Before you make your profile public</h3>
                <ul className={styles["confirm-list"]}>
                  <li>
                    Everything you saved until now becomes public, not only what you save from today. Sleevy
                    publishes your whole library in one step, and there is no review screen.
                  </li>
                  <li>
                    Every new save then publishes automatically, including saves from the iPhone app, the Chrome
                    extension, and Raycast. Those apps do not ask you first.
                  </li>
                  <li>
                    A new save stays hidden for its first hour. If you save something you do not want to show, you
                    have that hour to delete it or to mark it private.
                  </li>
                  <li>
                    Anything you mark private stays hidden: an item you marked private, a folder you marked private,
                    and every item in that folder.
                  </li>
                  <li>
                    Your page becomes {displayProfileUrl(profile.handle)}. Anyone with the link can read it, and
                    search engines can show it in their results.
                  </li>
                </ul>
                <p className={styles["confirm-footnote"]}>
                  You can turn this off at any time. Your page disappears immediately, and your handle stays
                  reserved for you.
                </p>
                <div className={styles["confirm-actions"]}>
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => setIsConfirmingPublic(false)}
                    disabled={setVisibility.isPending}
                  >
                    Cancel
                  </Button>
                  <Button type="button" onClick={publish} disabled={setVisibility.isPending}>
                    {setVisibility.isPending ? "Publishing…" : "Yes, make my profile public"}
                  </Button>
                </div>
              </div>
            ) : null}

            <div className={styles.controls}>
              {isPublic ? (
                <Button variant="ghost" type="button" onClick={unpublish} disabled={setVisibility.isPending}>
                  {setVisibility.isPending ? "Turning off…" : "Turn off my public profile"}
                </Button>
              ) : isConfirmingPublic ? null : (
                <Button type="button" onClick={() => setIsConfirmingPublic(true)}>
                  Make my profile public
                </Button>
              )}
              {isRenaming ? null : (
                <Button variant="ghost" type="button" onClick={() => setIsRenaming(true)}>
                  Change handle
                </Button>
              )}
            </div>
          </>
        ) : null}

        {panelError ? <pre className="settings-error">{panelError}</pre> : null}
      </div>
    </section>
  )
}
