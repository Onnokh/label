import {
  Link,
  Outlet,
  RouterProvider,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router"
import { StrictMode, useState } from "react"
import { createRoot } from "react-dom/client"

import { getSession, signInWithGoogle, signOut, type AuthSession } from "./auth"
import "./styles.css"

type RouterContext = {
  readonly session: AuthSession | null
}

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
    <section className="panel">
      <p className="eyebrow">Auth smoke test</p>
      <h1>Sign in to Label</h1>
      {session ? (
        <>
          <p className="lede">Signed in as {session.user.email}.</p>
          <Link to="/dashboard" className="primaryLink">
            Open dashboard
          </Link>
        </>
      ) : (
        <>
          <p className="lede">Use Google OAuth through the Better Auth API.</p>
          <button type="button" className="primaryButton" disabled={isSigningIn} onClick={() => void startSignIn()}>
            {isSigningIn ? "Opening Google..." : "Sign in with Google"}
          </button>
        </>
      )}
      {error ? <pre className="error">{error}</pre> : null}
    </section>
  )
}

function DashboardPage() {
  const session = dashboardRoute.useRouteContext().session

  return (
    <section className="panel">
      <p className="eyebrow">Protected route</p>
      <h1>Dashboard</h1>
      <dl className="sessionList">
        <div>
          <dt>User ID</dt>
          <dd>{session?.user.id}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>{session?.user.email}</dd>
        </div>
        <div>
          <dt>Session expires</dt>
          <dd>{session ? new Date(session.session.expiresAt).toLocaleString() : ""}</dd>
        </div>
      </dl>
    </section>
  )
}

const session = await getSession()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} context={{ session }} />
  </StrictMode>,
)
