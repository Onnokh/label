import {
  Link,
  Outlet,
  RouterProvider,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router"
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { StrictMode, type FormEvent, useState } from "react"
import { createRoot } from "react-dom/client"

import { getSession, signInWithGoogle, signOut, type AuthSession } from "./auth"
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

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard",
  beforeLoad: ({ context }) => {
    if (!context.session) {
      throw redirect({ to: "/" })
    }
  },
  component: DashboardPage,
})

const routeTree = rootRoute.addChildren([indexRoute, dashboardRoute])

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
    <main className="shell">
      <nav className="nav">
        <Link to="/" className="brand">
          Label
        </Link>
        <div className="navLinks">
          <Link to="/dashboard" disabled={!session}>
            Dashboard
          </Link>
          {session ? (
            <button type="button" onClick={() => void signOut()}>
              Sign out
            </button>
          ) : null}
        </div>
      </nav>
      <Outlet />
    </main>
  )
}

function HomePage() {
  const session = indexRoute.useRouteContext().session
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
    <section className="panel heroPanel">
      <p className="eyebrow">Web companion</p>
      <h1>Sign in and save a URL fast</h1>
      <p className="lede">
        A tiny capture surface for pasting a link, saving it, and seeing the newest items right away.
      </p>
      {session ? (
        <div className="heroActions">
          <Link to="/dashboard" className="primaryLink">
            Open ingest
          </Link>
          <p className="meta">Signed in as {session.user.email}</p>
        </div>
      ) : (
        <button type="button" className="primaryButton" disabled={isSigningIn} onClick={() => void startSignIn()}>
          {isSigningIn ? "Opening Google..." : "Sign in with Google"}
        </button>
      )}
      {error ? <pre className="error">{error}</pre> : null}
    </section>
  )
}

function DashboardPage() {
  const session = dashboardRoute.useRouteContext().session
  const queryClient = useQueryClient()
  const [url, setUrl] = useState("")
  const [formError, setFormError] = useState<string | null>(null)

  const savedItemsQuery = useQuery({
    queryKey: ["saved-items"],
    queryFn: () => apiFetch<SavedItemsResponse>("/v1/saved-items"),
    enabled: Boolean(session),
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

  return (
    <section className="dashboardGrid">
      <article className="panel ingestPanel">
        <p className="eyebrow">Manual ingest</p>
        <h1>Save a URL</h1>
        <form className="ingestForm" onSubmit={submitCapture}>
          <label className="fieldLabel" htmlFor="capture-url">
            URL
          </label>
          <div className="formRow">
            <input
              id="capture-url"
              className="textInput"
              type="url"
              inputMode="url"
              placeholder="https://example.com/story"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
            <button type="submit" className="primaryButton" disabled={captureMutation.isPending}>
              {captureMutation.isPending ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
        <p className="lede subtle">
          Drop in any link, hit save, and the newest saved items list refreshes immediately.
        </p>
        {formError ? <pre className="error">{formError}</pre> : null}
      </article>

      <article className="panel listPanel">
        <div className="listHeader">
          <div>
            <p className="eyebrow">Saved items</p>
            <h2>Newest first</h2>
          </div>
          <span className="countBadge">
            {savedItemsQuery.data?.savedItems.length ?? 0} items
          </span>
        </div>

        {savedItemsQuery.isLoading ? <p className="lede">Loading saved items...</p> : null}
        {savedItemsQuery.isError ? <p className="lede">Could not load saved items.</p> : null}

        <ul className="savedList">
          {savedItemsQuery.data?.savedItems.map((item) => (
            <li key={item.id} className="savedItem">
              <div className="savedItemTop">
                <div>
                  <h3>{item.title ?? item.host}</h3>
                  <p className="itemUrl">{item.originalUrl}</p>
                </div>
                <span className={`status ${item.enrichmentStatus}`}>{item.enrichmentStatus}</span>
              </div>
              {item.description ? <p className="itemDescription">{item.description}</p> : null}
              <div className="itemMeta">
                <span>{item.host}</span>
                <span>{item.isRead ? "Read" : "Unread"}</span>
                <span>{new Date(item.lastSavedAt).toLocaleString()}</span>
              </div>
            </li>
          ))}
          {!savedItemsQuery.isLoading && !savedItemsQuery.data?.savedItems.length ? (
            <li className="emptyState">No saved items yet. Try the form above.</li>
          ) : null}
        </ul>
      </article>
    </section>
  )
}

const session = await getSession()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} context={{ session }} />
    </QueryClientProvider>
  </StrictMode>,
)
