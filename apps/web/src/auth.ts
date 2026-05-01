export type AuthUser = {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly image?: string | null
}

export type AuthSession = {
  readonly user: AuthUser
  readonly session: {
    readonly id: string
    readonly expiresAt: string | Date
  }
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4001"
const webBaseUrl = import.meta.env.VITE_WEB_BASE_URL ?? "http://localhost:4000"

export const getSession = async (): Promise<AuthSession | null> => {
  try {
    const response = await fetch(`${apiBaseUrl}/api/auth/get-session`, {
      credentials: "include",
    })

    if (!response.ok) {
      return null
    }

    return response.json() as Promise<AuthSession | null>
  } catch {
    return null
  }
}

export const signInWithGoogle = async () => {
  const response = await fetch(`${apiBaseUrl}/api/auth/sign-in/social`, {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      provider: "google",
      callbackURL: `${webBaseUrl}/`,
    }),
  })

  if (!response.ok) {
    throw new Error(await response.text())
  }

  const payload = (await response.json()) as { readonly url?: string }
  if (payload.url) {
    window.location.assign(payload.url)
  }
}

export const signOut = async () => {
  await fetch(`${apiBaseUrl}/api/auth/sign-out`, {
    method: "POST",
    credentials: "include",
  })
  window.location.assign("/")
}
