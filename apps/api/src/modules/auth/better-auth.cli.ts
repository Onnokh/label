// CLI-only Better Auth config used to regenerate the Drizzle auth schema.
// Keep plugins/providers in sync with BetterAuth.ts; this file is not used at runtime.
import { apiKey } from "@better-auth/api-key";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins";

export const auth = betterAuth({
  database: drizzleAdapter({} as never, {
    provider: "pg",
  }),
  secret: "development-only-better-auth-cli-secret",
  baseURL: "https://api.label.localhost",
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
});
