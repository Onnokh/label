import { useMemo, useState } from "react"
import { useSearch } from "@tanstack/react-router"

import { authClient } from "../auth"

export function OAuthConsentPage() {
  const search = useSearch({ strict: false }) as Record<string, unknown>
  const scope = useMemo(() => typeof search.scope === "string" ? search.scope : "", [search.scope])
  const clientId = typeof search.client_id === "string" ? search.client_id : "this application"
  const [error, setError] = useState<string | null>(null)

  const decide = async (accept: boolean) => {
    const result = await authClient.oauth2.consent({ accept, scope })
    if (result.error || !result.data?.url) {
      setError(result.error?.message ?? "Could not complete authorization.")
      return
    }
    window.location.replace(result.data.url)
  }

  return (
    <main style={{ maxWidth: 520, margin: "8rem auto", padding: "0 1.5rem" }}>
      <h1>Authorize {clientId}</h1>
      <p>This application is requesting access to your Sleevy account.</p>
      {scope ? <p><strong>Requested scopes:</strong> {scope}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      <button type="button" onClick={() => void decide(true)}>Allow</button>
      <button type="button" onClick={() => void decide(false)}>Deny</button>
    </main>
  )
}
