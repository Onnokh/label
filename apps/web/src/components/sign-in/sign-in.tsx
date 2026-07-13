import { useState } from "react"
import { authClient } from "../../auth"
import { BlueMeshGradient } from "../marketing/hero/blue-mesh-gradient"
import styles from "./sign-in.module.scss"

export function SignIn() {
  const [error, setError] = useState<string | null>(null)
  const [signingInProvider, setSigningInProvider] = useState<"google" | "apple" | null>(null)

  const lastUsed = authClient.getLastUsedLoginMethod()

  const startSignIn = async (provider: "google" | "apple") => {
    setError(null)
    setSigningInProvider(provider)
    const current = window.location.pathname + window.location.search
    const callbackPath = current && current !== "/" ? current : "/inbox"
    const result = await authClient.signIn.social({
      provider,
      callbackURL: `${window.location.origin}${callbackPath}`,
    })
    if (result.error) {
      setError(result.error.message ?? `${provider === "apple" ? "Apple" : "Google"} sign-in failed.`)
      setSigningInProvider(null)
    }
  }

  const isSigningIn = signingInProvider !== null

  return (
    <div className={styles.page}>
      <div className={styles.brandPanel}>
        <BlueMeshGradient variant="login" />
        <div className={styles.grain} aria-hidden="true" />
        <a href="/" className={styles.brand}>
          <img src="/logo-mark.svg" alt="" height={28} />
          <span>Sleevy</span>
        </a>
        <p className={styles.tagline}>
          Save it now.
          <span>Read it when you&rsquo;re ready.</span>
        </p>
      </div>
      <div className={styles.formCol}>
        <div className={styles.form}>
          <h1 className={styles.title}>Sign in</h1>
          <p className={styles.sub}>Your saved links, everywhere you work.</p>
          <div className={styles.buttons}>
            <button
              type="button"
              className={styles.lightButton}
              disabled={isSigningIn}
              onClick={() => void startSignIn("apple")}
            >
              <AppleIcon />
              {signingInProvider === "apple" ? "Opening Apple..." : "Sign in with Apple"}
              {lastUsed === "apple" && <span className={styles.lastUsed}>Last used</span>}
            </button>
            <button
              type="button"
              className={styles.darkButton}
              disabled={isSigningIn}
              onClick={() => void startSignIn("google")}
            >
              <GoogleIcon />
              {signingInProvider === "google" ? "Opening Google..." : "Sign in with Google"}
              {lastUsed === "google" && <span className={styles.lastUsed}>Last used</span>}
            </button>
          </div>
          {error ? <pre className={styles.error}>{error}</pre> : null}
          <p className={styles.footnote}>No account yet? Signing in creates one automatically.</p>
        </div>
      </div>
    </div>
  )
}

function AppleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M12.152 8.374c-.02-1.89 1.54-2.8 1.61-2.842-.877-1.284-2.243-1.46-2.729-1.48-1.16-.118-2.27.685-2.86.685-.59 0-1.502-.668-2.47-.65-1.27.019-2.444.74-3.1 1.88-1.32 2.293-.338 5.69.95 7.55.63.912 1.382 1.936 2.37 1.9.95-.039 1.31-.616 2.46-.616 1.148 0 1.473.616 2.472.596.024-.003 1.716-.997 2.34-1.9-1.465-.889-1.743-2.653-1.743-3.123z" />
      <path d="M10.498 2.704A2.71 2.71 0 0 0 11.12.75a2.76 2.76 0 0 0-1.786.924 2.58 2.58 0 0 0-.64 1.872 2.28 2.28 0 0 0 1.804-.842z" />
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.33-1.58-5.04-3.71H.94v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.96 10.71A5.41 5.41 0 0 1 3.68 9c0-.59.1-1.16.28-1.71V4.96H.94A9 9 0 0 0 0 9c0 1.45.34 2.82.94 4.04l3.02-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.42 0 9 0A9 9 0 0 0 .94 4.96l3.02 2.33C4.67 5.16 6.66 3.58 9 3.58z" />
    </svg>
  )
}
