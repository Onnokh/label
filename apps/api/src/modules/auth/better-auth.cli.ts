import { apiKey } from "@better-auth/api-key"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { bearer } from "better-auth/plugins"

export const auth = betterAuth({
  database: drizzleAdapter({} as never, {
    provider: "pg",
  }),
  secret: "development-only-better-auth-cli-secret",
  baseURL: "http://localhost:3002",
  socialProviders: {
    google: {
      clientId: "GOOGLE_CLIENT_ID",
      clientSecret: "GOOGLE_CLIENT_SECRET",
    },
  },
  plugins: [
    bearer(),
    apiKey({
      apiKeyHeaders: ["authorization"],
    }),
  ],
})
