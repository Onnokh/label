import { useEffect, useState } from "react"

import { authClient } from "../auth"
import { SignIn } from "../components/sign-in/sign-in"
import styles from "./connect-page.module.scss"

export function OAuthLoginPage() {
  const { data: session, isPending } = authClient.useSession()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!session) return
    void authClient.oauth2.continue({}).then((result) => {
      if (result.error || !result.data?.url) {
        setError(result.error?.message ?? "Could not continue authorization.")
        return
      }
      window.location.replace(result.data.url)
    })
  }, [session])

  if (isPending) return null
  if (!session) return <SignIn />
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        {error ? (
          <pre className={styles.error}>{error}</pre>
        ) : (
          <p className={styles.subtitle}>Continuing authorization…</p>
        )}
      </div>
    </div>
  )
}
