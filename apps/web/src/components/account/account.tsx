import { useState } from "react"

import { authClient } from "../../auth"
import styles from "./account.module.scss"

const providerLabels = {
  apple: "Apple",
  google: "Google",
} as const

export function AccountPanel() {
  const { data: session } = authClient.useSession()

  if (!session) return null

  const { user } = session
  const lastUsedProvider = authClient.getLastUsedLoginMethod() as keyof typeof providerLabels | null
  const providerLabel = lastUsedProvider ? providerLabels[lastUsedProvider] : null
  const name = user.name.trim()
  const displayName = name || (lastUsedProvider === "apple" ? "Apple account" : user.email)
  const initial = (displayName || user.email).charAt(0).toUpperCase()

  const identity = (
    <>
      {user.image ? (
        <img className={styles.avatar} src={user.image} alt="" referrerPolicy="no-referrer" />
      ) : (
        <span className={styles["avatar-fallback"]}>{initial}</span>
      )}
      <div className={styles.body}>
        <span className={styles.name}>{displayName}</span>
        <span className={styles.meta}>{user.email}</span>
      </div>
    </>
  )

  return (
    <div className={styles.stack}>
      <div className={styles.row}>{identity}</div>
      <div className={styles.footer}>
        <span className={styles.provider}>{providerLabel ? `Signed in with ${providerLabel}` : "Signed in"}</span>
        <button type="button" className={styles.logout} onClick={() => void authClient.signOut()}>Log out</button>
      </div>
    </div>
  )
}

export function DeleteAccountControl() {
  const { data: session } = authClient.useSession()
  const [isConfirming, setIsConfirming] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  if (!session) return null

  const handleDeleteAccount = async () => {
    setIsDeleting(true)
    setDeleteError(null)
    try {
      const result = await authClient.deleteUser()
      if (result.error) {
        setDeleteError(result.error.message || "Account deletion failed. Please try again.")
        return
      }
      setIsConfirming(false)
    } catch {
      setDeleteError("Account deletion failed. Check your connection and try again.")
    } finally {
      setIsDeleting(false)
    }
  }

  return isConfirming ? (
    <div className={styles["delete-confirm"]}>
      <p className={styles["delete-warning"]}>
        This will permanently delete your account and all saved data. This cannot be undone.
      </p>
      {deleteError ? <p className={styles["delete-error"]}>{deleteError}</p> : null}
      <div className={styles["delete-actions"]}>
        <button
          type="button"
          className={styles["delete-cancel"]}
          onClick={() => setIsConfirming(false)}
          disabled={isDeleting}
        >
          Cancel
        </button>
        <button
          type="button"
          className={styles["delete-confirm-btn"]}
          onClick={handleDeleteAccount}
          disabled={isDeleting}
        >
          {isDeleting ? "Deleting..." : "Yes, delete my account"}
        </button>
      </div>
    </div>
  ) : (
    <button type="button" className={styles["delete-link"]} onClick={() => setIsConfirming(true)}>
      Delete account
    </button>
  )
}
