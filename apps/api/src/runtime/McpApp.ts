import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client"
import { createAuthClient } from "better-auth/client"
import { Effect } from "effect"

import type { UserId } from "../domain/SavedItem.js"
import { BetterAuth } from "../modules/auth/BetterAuth.js"
import { type Scope, V1_SCOPES, permissionsToScopes } from "../modules/auth/Scopes.js"
import { MCP_SCOPES, McpTools } from "../modules/mcp/McpTools.js"
import { AppConfig } from "./Config.js"

const bearerCredential = (authorization: string | null) =>
  authorization?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null

const isSignedSessionToken = (credential: string) => credential.includes(".")

const oauthScopes = (scope: unknown): ReadonlySet<Scope> =>
  typeof scope === "string"
    ? new Set(scope.split(" ").filter((value): value is Scope => V1_SCOPES.includes(value as Scope)))
    : new Set()

const unauthorized = (baseUrl: string) =>
  new Response("Missing valid credentials or an MCP scope.", {
    status: 401,
    headers: {
      "www-authenticate": `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource/mcp"`,
    },
  })

export const makeMcpWebHandler = Effect.gen(function* () {
  const config = yield* AppConfig
  const { auth } = yield* BetterAuth
  const mcpTools = yield* McpTools
  const oauthClient = createAuthClient({ plugins: [oauthProviderResourceClient(auth)] })

  return async (request: Request): Promise<Response> => {
    const credential = bearerCredential(request.headers.get("authorization"))
    if (!credential) return unauthorized(config.auth.baseUrl)

    let userId: UserId | undefined
    let scopes: ReadonlySet<Scope> | undefined
    try {
      if (!isSignedSessionToken(credential)) {
        const apiKey = await auth.api.verifyApiKey({ body: { key: credential } })
        if (apiKey.valid && apiKey.key) {
          userId = apiKey.key.referenceId as UserId
          scopes = permissionsToScopes(apiKey.key.permissions ?? null)
        }
      }
      if (userId === undefined) {
        const token = await oauthClient.verifyAccessToken(credential, {
          verifyOptions: { audience: `${config.auth.baseUrl}/mcp` },
        })
        if (typeof token.sub === "string") {
          userId = token.sub as UserId
          scopes = oauthScopes(token.scope)
        }
      }
    } catch {
      // Return the same neutral 401 response for invalid API keys and tokens.
    }

    if (!userId || !scopes || !MCP_SCOPES.some((scope) => scopes.has(scope))) {
      return unauthorized(config.auth.baseUrl)
    }

    return mcpTools.handlerFor(userId, scopes)(request)
  }
})
