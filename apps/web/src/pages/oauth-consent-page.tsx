import { useEffect, useMemo, useState } from "react"
import { useSearch } from "@tanstack/react-router"

import { authClient } from "../auth"
import { Button } from "../components/ui/button/button"
import { SignIn } from "../components/sign-in/sign-in"
import {
  SCOPE_GROUP_ORDER,
  SCOPE_GROUPS,
  SCOPE_VERBS,
} from "./scope-meta"
import styles from "./connect-page.module.scss"

type VerbView = { verb: string; destructive: boolean }

type GroupView = {
  id: string
  title: string
  icon: string
  verbs: VerbView[]
  mono: boolean
}

function buildGroups(scopes: readonly string[]): GroupView[] {
  const byGroup = new Map<string, VerbView[]>()
  const unknown: string[] = []

  for (const scope of scopes) {
    const meta = SCOPE_VERBS[scope]
    if (!meta) {
      unknown.push(scope)
      continue
    }
    const verbs = byGroup.get(meta.group) ?? []
    verbs.push({ verb: meta.verb, destructive: meta.destructive ?? false })
    byGroup.set(meta.group, verbs)
  }

  const groups: GroupView[] = []
  for (const id of SCOPE_GROUP_ORDER) {
    const verbs = byGroup.get(id)
    if (!verbs) continue
    groups.push({ id, title: SCOPE_GROUPS[id].title, icon: SCOPE_GROUPS[id].icon, verbs, mono: false })
  }

  if (unknown.length > 0) {
    groups.push({
      id: "other",
      title: "Other permissions",
      icon: "",
      verbs: unknown.map((scope) => ({ verb: scope, destructive: false })),
      mono: true,
    })
  }

  return groups
}

function permissionSummary(group: GroupView) {
  const verbs = group.verbs.map((entry) => entry.verb.toLowerCase())
  const last = verbs.pop()
  const actions = last ? [...verbs, last].join(verbs.length > 1 ? ", " : " and ") : "access"
  return `Can ${actions} your ${group.title.toLowerCase()}.`
}

export function OAuthConsentPage() {
  const search = useSearch({ strict: false }) as Record<string, unknown>
  const get = (key: string) => (typeof search[key] === "string" ? (search[key] as string) : "")
  const scope = get("scope")
  const clientId = get("client_id")
  const redirectUri = get("redirect_uri")

  const { data: session, isPending } = authClient.useSession()
  const [clientName, setClientName] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const scopes = useMemo(() => scope.split(/[\s,]+/).filter(Boolean), [scope])
  const groups = useMemo(() => buildGroups(scopes), [scopes])
  const redirectHost = useMemo(() => {
    try {
      return redirectUri ? new URL(redirectUri).host : null
    } catch {
      return null
    }
  }, [redirectUri])

  useEffect(() => {
    if (!clientId || !session) return
    void authClient
      .$fetch("/oauth2/public-client", { query: { client_id: clientId } })
      .then((result) => {
        const data = (result as { data?: { client_name?: string } | null }).data
        if (data?.client_name) setClientName(data.client_name)
      })
      .catch(() => {})
  }, [clientId, session])

  if (isPending) return null
  if (!session) return <SignIn />

  const displayName = clientName ?? redirectHost ?? "this app"
  const avatarUrl = session.user.image ?? null

  const decide = async (accept: boolean) => {
    setSubmitting(true)
    setError(null)
    const result = await authClient.oauth2.consent({ accept, scope })
    if (result.error || !result.data?.url) {
      setError(result.error?.message ?? "Could not complete authorization.")
      setSubmitting(false)
      return
    }
    window.location.replace(result.data.url)
  }

  return (
    <div className={styles.page}>
      <div className={styles.consentFrame}>
        <div className={`${styles.card} ${styles.cardWide}`} aria-busy={submitting}>
          <header className={styles.header}>
            <img src="/logo-mark.svg" alt="" className={`logoIcon ${styles.headerMark}`} height={28} />
            <h1 className={styles.title}>Review the access request</h1>
            <p className={styles.request}>
              <strong>{displayName}</strong> is requesting access to your Sleevy account.
            </p>
          </header>

          <section className={styles.grants} aria-label="Requested permissions">
            <h2 className={styles.grantsLabel}>Permissions</h2>
            <ul className={styles.permissionList}>
              {groups.map((group) => (
                <li key={group.id} className={styles.permissionRow}>
                  {group.icon ? (
                    <span className={styles.permissionIcon} aria-hidden="true">
                      <svg viewBox="0 0 24 24" width={15} height={15} fill="none">
                        <path d={group.icon} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  ) : null}
                  <span className={styles.permissionContent}>
                    <span className={styles.permissionTitle}>{group.title}</span>
                    <span className={`${styles.permissionSummary} ${group.mono ? styles.permissionSummaryMono : ""}`}>
                      {permissionSummary(group)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {redirectHost ? (
            <p className={styles.redirectNote}>
              <svg viewBox="0 0 24 24" width={14} height={14} fill="none" aria-hidden="true">
                <path
                  d="M7 17L17 7 M8 7h9v9"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>
                After you authorize, you’ll be sent to <strong>{redirectHost}</strong>
              </span>
            </p>
          ) : null}

          {error ? (
            <div className={styles.error} role="alert">
              {error}
            </div>
          ) : null}

          <div className={styles.actions}>
            <Button variant="ghost" onClick={() => void decide(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={() => void decide(true)} disabled={submitting}>
              {submitting ? "Authorizing…" : "Authorize"}
            </Button>
          </div>

          <footer className={styles.identity}>
            {avatarUrl ? <img src={avatarUrl} alt="" className={styles.identityAvatar} /> : null}
            <span>
              Signed in as <strong className={styles.identityEmail}>{session.user.email}</strong>
            </span>
          </footer>
        </div>
        <p className={styles.externalAppNote}>Third-party app</p>
      </div>
    </div>
  )
}
