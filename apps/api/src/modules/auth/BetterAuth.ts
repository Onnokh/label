import { apiKey } from "@better-auth/api-key"
import { oauthProvider } from "@better-auth/oauth-provider"
import { eq } from "drizzle-orm"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { betterAuth } from "better-auth"
import { bearer, jwt, lastLoginMethod } from "better-auth/plugins"
import { Context, Effect, Layer } from "effect"
import { importPKCS8, SignJWT } from "jose"

import { AppConfig } from "../../runtime/Config.js"
import { trackEvent } from "../analytics/RybbitClient.js"
import { PostgresClient } from "../persistence/PostgresClient.js"
import { schema, user as userTable, account as accountTable } from "../persistence/schema.js"
import { scopesToPermissions, V1_SCOPES } from "./Scopes.js"

export const AUTH_BASE_PATH = "/api/auth"

export const authServerUrl = (apiBaseUrl: string) =>
  `${apiBaseUrl}${AUTH_BASE_PATH}`

const bearerCredential = (authorization: string | null | undefined) =>
  authorization?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null

const isSignedSessionToken = (credential: string) => credential.includes(".")

const crossSubDomainCookieDomain = (baseUrl: string) => {
  const hostname = URL.canParse(baseUrl) ? new URL(baseUrl).hostname : ""
  return hostname === "sleevy.app" || hostname.endsWith(".sleevy.app")
    ? ".sleevy.app"
    : undefined
}

type AppleAuthConfig = {
  readonly appleClientId: string
  readonly appleTeamId: string
  readonly appleKeyId: string
  readonly applePrivateKey: string
  readonly appleAppBundleIdentifier: string
}

const hasAppleCredentials = (auth: AppleAuthConfig) =>
  auth.appleClientId.length > 0 &&
  auth.appleTeamId.length > 0 &&
  auth.appleKeyId.length > 0 &&
  auth.applePrivateKey.length > 0 &&
  auth.appleAppBundleIdentifier.length > 0

const normalizedPrivateKey = (privateKey: string) => {
  const trimmed = privateKey.trim().replace(/^['"]|['"]$/g, "").replace(/\\n/g, "\n")
  const match = trimmed.match(/-----BEGIN PRIVATE KEY-----\s*([A-Za-z0-9+/=\s]+)\s*-----END PRIVATE KEY-----/)

  if (!match) {
    throw new Error("APPLE_PRIVATE_KEY must include the full .p8 PEM, including BEGIN/END PRIVATE KEY lines.")
  }

  const base64 = match[1].replace(/\s/g, "")
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length % 4 !== 0) {
    throw new Error("APPLE_PRIVATE_KEY contains invalid PEM base64. Paste the .p8 contents or replace real newlines with \\n.")
  }

  return `-----BEGIN PRIVATE KEY-----\n${base64.match(/.{1,64}/g)?.join("\n") ?? base64}\n-----END PRIVATE KEY-----`
}

const generateAppleClientSecret = async (auth: AppleAuthConfig) => {
  const key = await importPKCS8(normalizedPrivateKey(auth.applePrivateKey), "ES256")
  const now = Math.floor(Date.now() / 1000)

  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: auth.appleKeyId })
    .setIssuer(auth.appleTeamId)
    .setSubject(auth.appleClientId)
    .setAudience("https://appleid.apple.com")
    .setIssuedAt(now)
    .setExpirationTime(now + 180 * 24 * 60 * 60)
    .sign(key)
}

export class BetterAuth extends Context.Service<BetterAuth>()(
  "@app/modules/auth/BetterAuth",
  {
    make: Effect.gen(function* () {
      const config = yield* AppConfig
      const { authDb } = yield* PostgresClient
      const appleClientSecret = hasAppleCredentials(config.auth)
        ? yield* Effect.promise(() => generateAppleClientSecret(config.auth))
        : undefined

      const cookieDomain = crossSubDomainCookieDomain(config.auth.baseUrl)
      const oauthProviderPlugins = [
        jwt(),
        oauthProvider({
          loginPage: `${config.auth.webUrl}/oauth/login`,
          consentPage: `${config.auth.webUrl}/oauth/consent`,
          scopes: [...V1_SCOPES],
          validAudiences: [config.auth.baseUrl, `${config.auth.baseUrl}/mcp`],
          allowDynamicClientRegistration: true,
          // MCP clients register anonymously; the plugin then forces them to be
          // public clients (auth method "none", no client_credentials grant).
          allowUnauthenticatedClientRegistration: true,
        }),
      ]

      const loginMethod = async (userId: string): Promise<string | undefined> => {
        const [a] = await authDb
          .select({ providerId: accountTable.providerId })
          .from(accountTable)
          .where(eq(accountTable.userId, userId))
          .limit(1)
        return a?.providerId
      }

      const auth = betterAuth({
        database: drizzleAdapter(authDb, {
          provider: "pg",
          schema,
        }),
        secret: config.auth.secret,
        baseURL: config.auth.baseUrl,
        basePath: AUTH_BASE_PATH,
        trustedOrigins: [...config.auth.trustedOrigins],
        ...(cookieDomain
          ? {
              advanced: {
                crossSubDomainCookies: {
                  enabled: true,
                  domain: cookieDomain,
                },
              },
            }
          : {}),
        socialProviders: {
          google: {
            clientId: config.auth.googleClientId,
            clientSecret: config.auth.googleClientSecret,
          },
          ...(appleClientSecret
            ? {
                apple: {
                  clientId: config.auth.appleClientId,
                  clientSecret: appleClientSecret,
                  appBundleIdentifier: config.auth.appleAppBundleIdentifier,
                },
              }
            : {}),
        },
        account: {
          accountLinking: {
            enabled: true,
            trustedProviders: ["google", "apple"],
            allowDifferentEmails: false,
          },
        },
        user: {
          deleteUser: {
            enabled: true,
          },
        },
        databaseHooks: {
          session: {
            create: {
              after: async (session) => {
                const [u] = await authDb
                  .select({ email: userTable.email })
                  .from(userTable)
                  .where(eq(userTable.id, session.userId))
                  .limit(1)
                if (u) {
                  console.log(`[auth] Logged in: ${u.email}`)
                }
                if (config.rybbit.enabled) {
                  const method = await loginMethod(session.userId)
                  void trackEvent(config.rybbit, {
                    name: "login",
                    userId: session.userId,
                    properties: method ? { method } : {},
                  })
                }
              },
            },
            delete: {
              after: async (session) => {
                const [u] = await authDb
                  .select({ email: userTable.email })
                  .from(userTable)
                  .where(eq(userTable.id, session.userId))
                  .limit(1)
                if (u) {
                  console.log(`[auth] Logged out: ${u.email}`)
                }
                if (config.rybbit.enabled) {
                  void trackEvent(config.rybbit, {
                    name: "logout",
                    userId: session.userId,
                  })
                }
              },
            },
          },
          user: {
            create: {
              after: async (createdUser) => {
                if (config.rybbit.enabled) {
                  void trackEvent(config.rybbit, {
                    name: "account_created",
                    userId: createdUser.id,
                  })
                }
              },
            },
          },
        },
        plugins: [
          bearer(),
          lastLoginMethod(),
          ...oauthProviderPlugins,
          apiKey({
            customAPIKeyGetter: (ctx) => {
              const credential = bearerCredential(ctx.headers?.get("authorization"))
              if (!credential || isSignedSessionToken(credential)) {
                return null
              }

              return credential
            },
            enableSessionForAPIKeys: true,
            enableMetadata: true,
            maximumNameLength: 80,
            // Keys created without explicit permissions (e.g. from the web
            // settings page) get every v1 scope; the connect flow still
            // narrows per client.
            permissions: {
              defaultPermissions: scopesToPermissions(V1_SCOPES),
            },
            // Plugin-level rate limiting off; revisit when we have real traffic data.
            rateLimit: { enabled: false },
          }),
        ],
      })

      return {
        auth,
        handler: auth.handler,
      } as const
    }),
  },
) {
  static readonly layer = Layer.effect(BetterAuth, BetterAuth.make)

  static readonly defaultLayer = BetterAuth.layer.pipe(
    Layer.provide(AppConfig.layer),
    Layer.provide(PostgresClient.defaultLayer),
  )
}
