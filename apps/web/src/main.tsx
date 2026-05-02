import {
  Outlet,
  RouterProvider,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from "@tanstack/react-router"
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { StrictMode, type FormEvent, useState } from "react"
import { createRoot } from "react-dom/client"

import { createApiKey, deleteApiKey, listApiKeys, type ApiKeyRecord } from "./apiKeys"
import { getSession, signInWithGoogle, signOut, type AuthSession } from "./auth"
import { SavedCard } from "./SavedCard"
import "./styles.css"

type RouterContext = {
  readonly session: AuthSession | null
}

type SavedItem = {
  readonly id: string
  readonly originalUrl: string
  readonly host: string
  readonly title?: string
  readonly description?: string
  readonly siteName?: string
  readonly imageUrl?: string
  readonly previewSummary?: string
  readonly enrichmentStatus: "pending" | "enriched" | "failed"
  readonly isRead: boolean
  readonly lastSavedAt: string
}

type SavedItemsResponse = {
  readonly savedItems: SavedItem[]
}

type CaptureResponse = {
  readonly savedItem: SavedItem
  readonly captureResult: "created" | "updated"
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4001"

const queryClient = new QueryClient()

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomePage,
})

const routeTree = rootRoute.addChildren([indexRoute])

const router = createRouter({
  routeTree,
  context: {
    session: null,
  },
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    throw new Error(await response.text())
  }

  return response.json() as Promise<T>
}

function RootLayout() {
  const session = rootRoute.useRouteContext().session

  return (
    <main className="page">
      <div className="container">
        {session ? (
          <nav className="nav">
            <span className="brand">Label</span>
            <div className="navLinks">
              <span className="meta">{session.user.email}</span>
              <button type="button" className="ghostButton" onClick={() => void signOut()}>
                Sign out
              </button>
            </div>
          </nav>
        ) : null}
        <Outlet />
      </div>
    </main>
  )
}

function HomePage() {
  const session = indexRoute.useRouteContext().session
  return session ? <ReadingList /> : <SignedOutHero />
}

function SignedOutHero() {
  const [error, setError] = useState<string | null>(null)
  const [isSigningIn, setIsSigningIn] = useState(false)

  const startSignIn = async () => {
    setError(null)
    setIsSigningIn(true)
    try {
      await signInWithGoogle()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Google sign-in failed.")
      setIsSigningIn(false)
    }
  }

  return (
    <section className="signInCard">
      <div className="signInCardSide signInCardBrand">
        <p className="eyebrow">Label</p>
      </div>
      <div className="signInCardSide signInCardAction">
        <h1 className="title">Sign in</h1>
        <p className="subtitle">Continue with your Google account.</p>
        <button type="button" className="primaryButton" disabled={isSigningIn} onClick={() => void startSignIn()}>
          {isSigningIn ? "Opening Google..." : "Continue with Google"}
        </button>
        {error ? <pre className="error">{error}</pre> : null}
      </div>
    </section>
  )
}

function ReadingList() {
  const queryClient = useQueryClient()
  const [url, setUrl] = useState("")
  const [formError, setFormError] = useState<string | null>(null)

  const savedItemsQuery = useQuery({
    queryKey: ["saved-items"],
    queryFn: () => apiFetch<SavedItemsResponse>("/v1/saved-items"),
    staleTime: 30_000,
  })

  const captureMutation = useMutation({
    mutationFn: (inputUrl: string) =>
      apiFetch<CaptureResponse>("/v1/captures", {
        method: "POST",
        body: JSON.stringify({ url: inputUrl }),
      }),
    onSuccess: async () => {
      setUrl("")
      setFormError(null)
      await queryClient.invalidateQueries({ queryKey: ["saved-items"] })
    },
    onError: (cause) => {
      setFormError(cause instanceof Error ? cause.message : "Capture failed.")
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`${apiBaseUrl}/v1/saved-items/${id}`, {
        method: "DELETE",
        credentials: "include",
      }).then((response) => {
        if (!response.ok) throw new Error("Delete failed")
      }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["saved-items"] })
      const previous = queryClient.getQueryData<SavedItemsResponse>(["saved-items"])
      if (previous) {
        queryClient.setQueryData<SavedItemsResponse>(["saved-items"], {
          savedItems: previous.savedItems.filter((item) => item.id !== id),
        })
      }
      return { previous }
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["saved-items"], context.previous)
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["saved-items"] }),
  })

  const submitCapture = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = url.trim()

    if (!trimmed) {
      setFormError("Paste a URL first.")
      return
    }

    setFormError(null)
    captureMutation.mutate(trimmed)
  }

  const items = savedItemsQuery.data?.savedItems ?? []

  return (
    <section>
      <div className="header">
        <h1 className="title">Saved</h1>
        <div className="stats">
          <div className="stat">
            <span className="statValue">{items.length}</span>
            <div className="statLabel">SAVED</div>
          </div>
        </div>
      </div>

      <form className="form" onSubmit={submitCapture}>
        <input
          id="capture-url"
          className="input"
          type="url"
          inputMode="url"
          placeholder="https://example.com/article"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
        <button type="submit" className="primaryButton" disabled={captureMutation.isPending || !url.trim()}>
          {captureMutation.isPending ? "Saving..." : "Save"}
        </button>
      </form>
      {formError ? <pre className="error">{formError}</pre> : null}

      <ApiKeysPanel />

      {savedItemsQuery.isLoading ? <div className="message">Loading...</div> : null}
      {savedItemsQuery.isError ? (
        <div className="message errorMessage">Could not load saved items.</div>
      ) : null}

      {!savedItemsQuery.isLoading && !savedItemsQuery.isError ? (
        items.length === 0 ? (
          <div className="message">No saved items yet. Save one above.</div>
        ) : (
          <ul className="grid">
            {items.map((item) => (
              <li key={item.id}>
                <SavedCard item={item} onDelete={(id) => deleteMutation.mutate(id)} />
              </li>
            ))}
          </ul>
        )
      ) : null}
    </section>
  )
}

function ApiKeysPanel() {
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  const [revealedKey, setRevealedKey] = useState<string | null>(null)
  const [panelError, setPanelError] = useState<string | null>(null)
  const [copiedState, setCopiedState] = useState<"idle" | "done">("idle")

  const apiKeysQuery = useQuery({
    queryKey: ["api-keys"],
    queryFn: listApiKeys,
    staleTime: 30_000,
  })

  const createMutation = useMutation({
    mutationFn: (nextName: string) => createApiKey(nextName),
    onSuccess: async ({ key }) => {
      setRevealedKey(key)
      setName("")
      setPanelError(null)
      setCopiedState("idle")
      await queryClient.invalidateQueries({ queryKey: ["api-keys"] })
    },
    onError: (cause) => {
      setPanelError(cause instanceof Error ? cause.message : "Could not create API key.")
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (keyId: string) => deleteApiKey(keyId),
    onSuccess: async () => {
      setPanelError(null)
      await queryClient.invalidateQueries({ queryKey: ["api-keys"] })
    },
    onError: (cause) => {
      setPanelError(cause instanceof Error ? cause.message : "Could not revoke API key.")
    },
  })

  const apiKeys = apiKeysQuery.data ?? []

  const submitCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPanelError(null)
    createMutation.mutate(name)
  }

  const copyKey = async () => {
    if (!revealedKey) {
      return
    }

    try {
      await navigator.clipboard.writeText(revealedKey)
      setCopiedState("done")
    } catch {
      setPanelError("Could not copy the API key.")
    }
  }

  return (
    <section className="settingsCard">
      <div className="settingsHeader">
        <div>
          <p className="eyebrow">API keys</p>
          <h2 className="settingsTitle">External access</h2>
        </div>
        <span className="meta">{apiKeys.length} keys</span>
      </div>
      <p className="subtitle settingsSubtitle">
        Create API keys for external systems that need to capture URLs, view saved items, and update read state.
      </p>

      <form className="form" onSubmit={submitCreate}>
        <input
          className="input"
          type="text"
          placeholder="Personal automation"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <button type="submit" className="primaryButton" disabled={createMutation.isPending}>
          {createMutation.isPending ? "Creating..." : "Create API key"}
        </button>
      </form>

      {revealedKey ? (
        <div className="secretCard">
          <div className="secretHeader">
            <strong>New API key</strong>
            <button type="button" className="ghostButton" onClick={() => void copyKey()}>
              {copiedState === "done" ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="meta">This key is only shown once.</p>
          <pre className="secretValue">{revealedKey}</pre>
        </div>
      ) : null}

      {apiKeysQuery.isLoading ? <div className="message">Loading API keys...</div> : null}
      {apiKeysQuery.isError ? <div className="message errorMessage">Could not load API keys.</div> : null}

      {!apiKeysQuery.isLoading && !apiKeysQuery.isError ? (
        apiKeys.length === 0 ? (
          <div className="message settingsEmpty">No API keys yet.</div>
        ) : (
          <ul className="settingsList">
            {apiKeys.map((apiKey) => (
              <li key={apiKey.id} className="settingsListItem">
                <ApiKeyRow
                  apiKey={apiKey}
                  isDeleting={deleteMutation.isPending && deleteMutation.variables === apiKey.id}
                  onDelete={() => deleteMutation.mutate(apiKey.id)}
                />
              </li>
            ))}
          </ul>
        )
      ) : null}

      {panelError ? <pre className="error">{panelError}</pre> : null}
    </section>
  )
}

function ApiKeyRow({
  apiKey,
  isDeleting,
  onDelete,
}: {
  readonly apiKey: ApiKeyRecord
  readonly isDeleting: boolean
  readonly onDelete: () => void
}) {
  const label = apiKey.name?.trim() || apiKey.start || apiKey.prefix || "Unnamed key"
  const createdAt = formatTimestamp(apiKey.createdAt)
  const lastUsedAt = formatTimestamp(apiKey.lastRequest)

  return (
    <div className="settingsRow">
      <div className="settingsRowBody">
        <div className="settingsRowTitle">{label}</div>
        <div className="settingsRowMeta">
          {createdAt ? `Created ${createdAt}` : "Created recently"}
          {lastUsedAt ? ` · Last used ${lastUsedAt}` : ""}
        </div>
      </div>
      <button type="button" className="ghostButton" disabled={isDeleting} onClick={onDelete}>
        {isDeleting ? "Revoking..." : "Revoke"}
      </button>
    </div>
  )
}

function formatTimestamp(value: string | Date | null | undefined) {
  if (!value) {
    return null
  }

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

const session = await getSession()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} context={{ session }} />
    </QueryClientProvider>
  </StrictMode>,
)
