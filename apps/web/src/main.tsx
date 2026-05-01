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

const session = await getSession()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} context={{ session }} />
    </QueryClientProvider>
  </StrictMode>,
)
