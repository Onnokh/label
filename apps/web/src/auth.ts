import { apiKeyClient } from "@better-auth/api-key/client"
import { oauthProviderClient } from "@better-auth/oauth-provider/client"
import { createAuthClient } from "better-auth/react"
import { lastLoginMethodClient } from "better-auth/client/plugins"

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4001"

export const authClient = createAuthClient({
  baseURL: apiBaseUrl,
  plugins: [apiKeyClient(), lastLoginMethodClient(), oauthProviderClient()],
})
