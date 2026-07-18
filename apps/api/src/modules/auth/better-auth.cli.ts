// CLI-only Better Auth config used to regenerate the Drizzle auth schema.
// Keep plugins/providers in sync with BetterAuth.ts; this file is not used at runtime.
import { apiKey } from "@better-auth/api-key";
import { oauthProvider } from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, jwt, lastLoginMethod } from "better-auth/plugins";

const sleevyScopes = [
  "saved-items:capture",
  "saved-items:read",
  "saved-items:write",
  "saved-items:delete",
  "folders:read",
  "folders:write",
  "folders:delete",
  "account:read",
] as const;

export const auth = betterAuth({
  database: drizzleAdapter({} as never, {
    provider: "pg",
  }),
  secret: "development-only-better-auth-cli-secret",
  baseURL: "http://localhost:4001",
  socialProviders: {
    google: {
      clientId: "GOOGLE_CLIENT_ID",
      clientSecret: "GOOGLE_CLIENT_SECRET",
    },
    apple: {
      clientId: "APPLE_CLIENT_ID",
      clientSecret: "APPLE_CLIENT_SECRET",
      appBundleIdentifier: "APPLE_APP_BUNDLE_IDENTIFIER",
    },
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["google", "apple"],
      allowDifferentEmails: false,
    },
  },
  plugins: [
    bearer(),
    lastLoginMethod(),
    jwt(),
    oauthProvider({
      loginPage: "http://localhost:4000/oauth/login",
      consentPage: "http://localhost:4000/oauth/consent",
      scopes: [...sleevyScopes],
      validAudiences: ["http://localhost:4001", "http://localhost:4001/mcp"],
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
    }),
    apiKey({
      apiKeyHeaders: ["authorization"],
    }),
  ],
});
