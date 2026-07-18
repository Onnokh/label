import { useMemo, useState } from "react"
import { useSearch } from "@tanstack/react-router"

import { authClient } from "../auth"
import { apiFetch } from "../sleevy/api"
import { ICON_BOOKMARK, SCOPE_META } from "./scope-meta"
import styles from "./connect-page.module.scss"

type ClientId = "chrome-extension" | "raycast"

const CLIENT_DISPLAY: Record<ClientId, string> = {
  "chrome-extension": "Google Chrome",
  raycast: "Raycast",
}

const CLIENT_LOGO: Record<ClientId, string> = {
  "chrome-extension": "/chrome-76.webp",
  raycast: "/raycast-82.webp",
}

type ParsedRequest =
  | { ok: true; client: ClientId; redirectUri: string; codeChallenge: string; scopes: string[]; label: string; deviceHint: string | undefined; state: string }
  | { ok: false; error: string }

function parseRequest(search: Record<string, unknown>): ParsedRequest {
  const get = (key: string) => {
    const value = search[key]
    return typeof value === "string" ? value : undefined
  }

  const client = get("client")
  const redirectUri = get("redirect_uri")
  const codeChallenge = get("code_challenge")
  const codeChallengeMethod = get("code_challenge_method")
  const scopesRaw = get("scopes") ?? get("scope") ?? ""
  const state = get("state") ?? ""
  const deviceHint = get("device_hint")

  if (client !== "chrome-extension" && client !== "raycast") {
    return { ok: false, error: "Unknown client." }
  }
  if (!redirectUri) return { ok: false, error: "Missing redirect_uri." }
  if (!codeChallenge) return { ok: false, error: "Missing code_challenge." }
  if (codeChallengeMethod !== "S256") return { ok: false, error: "Only PKCE S256 is supported." }

  const scopes = scopesRaw.split(/[\s,]+/).filter(Boolean)
  if (scopes.length === 0) return { ok: false, error: "No scopes requested." }

  return {
    ok: true,
    client,
    redirectUri,
    codeChallenge,
    scopes,
    label: deviceHint ?? `${CLIENT_DISPLAY[client]}`,
    deviceHint,
    state,
  }
}

function buildRedirect(base: string, params: Record<string, string>): string {
  const url = new URL(base)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return url.toString()
}

export function ConnectPage() {
  const search = useSearch({ strict: false }) as Record<string, unknown>
  const { data: session } = authClient.useSession()

  const parsed = useMemo(() => parseRequest(search), [search])

  const [label, setLabel] = useState(parsed.ok ? parsed.label : "")
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  if (!parsed.ok) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.header}>
            <h1 className={styles.title}>Connection request invalid</h1>
            <p className={styles.subtitle}>{parsed.error}</p>
          </div>
        </div>
      </div>
    )
  }

  const clientName = CLIENT_DISPLAY[parsed.client]

  const approve = async () => {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const { code } = await apiFetch<{ code: string }>("/connect/authorize", {
        method: "POST",
        body: JSON.stringify({
          client: parsed.client,
          redirectUri: parsed.redirectUri,
          codeChallenge: parsed.codeChallenge,
          codeChallengeMethod: "S256",
          scopes: parsed.scopes,
          label: label.trim() || clientName,
          ...(parsed.deviceHint ? { deviceHint: parsed.deviceHint } : {}),
        }),
      })
      window.location.replace(buildRedirect(parsed.redirectUri, { code, state: parsed.state }))
    } catch (cause) {
      setSubmitError(cause instanceof Error ? cause.message : "Could not complete the request.")
      setSubmitting(false)
    }
  }

  const cancel = () => {
    window.location.replace(
      buildRedirect(parsed.redirectUri, { error: "access_denied", state: parsed.state }),
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.icons} aria-hidden="true">
          <div className={`${styles.iconBubble} ${styles.iconBubbleSecondary}`}>
            <img src={CLIENT_LOGO[parsed.client]} alt="" />
          </div>
          <div className={`${styles.iconBubble} ${styles.iconBubblePrimary}`}>
            <img src="/app-icon-160.webp" alt="" className={styles.sleevyMark} />
          </div>
        </div>

        <div className={styles.header}>
          <h1 className={styles.title}>Connect {clientName} to Sleevy</h1>
          {session?.user ? (
            <p className={styles.subtitle}>Signed in as {session.user.email}</p>
          ) : null}
        </div>

        <ul className={styles.scopes}>
            {parsed.scopes.map((scope) => {
              const meta = SCOPE_META[scope] ?? { title: scope, description: "", icon: ICON_BOOKMARK }
              return (
                <li key={scope} className={styles.scopeItem}>
                  <span className={styles.scopeIcon} aria-hidden="true">
                    <svg viewBox="0 0 24 24" width={16} height={16} fill="none">
                      <path
                        d={meta.icon}
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <span className={styles.scopeBody}>
                    <span className={styles.scopeTitle}>{meta.title}</span>
                    {meta.description ? (
                      <span className={styles.scopeDescription}>{meta.description}</span>
                    ) : null}
                  </span>
                  <span className={styles.scopeCheck} aria-hidden="true">
                    <svg viewBox="0 0 16 16" width={12} height={12} fill="none">
                      <path
                        d="M3 8.5l3 3 7-7"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </li>
              )
            })}
          </ul>

        <div className={styles.labelInputWrap}>
          <input
            type="text"
            className={styles.labelInput}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Name this device"
            aria-label="Name this device"
          />
          <svg
            className={styles.labelInputIcon}
            viewBox="0 0 24 24"
            width={14}
            height={14}
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M14.06 3.94a2 2 0 0 1 2.83 0l3.17 3.17a2 2 0 0 1 0 2.83L7.5 22.5 2 22.5l0-5.5z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {submitError ? <pre className={styles.error}>{submitError}</pre> : null}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.pill}
            onClick={cancel}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`${styles.pill} ${styles.pillPrimary}`}
            onClick={() => void approve()}
            disabled={submitting}
          >
            {submitting ? "Authorizing…" : "Authorize"}
          </button>
        </div>
      </div>
    </div>
  )
}
