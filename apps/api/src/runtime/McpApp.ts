import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client"
import { createAuthClient } from "better-auth/client"
import { Effect } from "effect"

import type { UserId } from "../domain/SavedItem.js"
import { authServerUrl, BetterAuth } from "../modules/auth/BetterAuth.js"
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

export const mcpOAuthVerificationOptions = (apiBaseUrl: string) => ({
  audience: `${apiBaseUrl}/mcp`,
  issuer: authServerUrl(apiBaseUrl),
})

const unauthorized = (baseUrl: string) =>
  new Response("Missing valid credentials or an MCP scope.", {
    status: 401,
    headers: {
      "www-authenticate": `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource/mcp"`,
    },
  })

/**
 * The JSON-RPC methods an unauthenticated caller may use.
 *
 * These describe the server; none of them touch an account. Letting a client
 * complete `initialize` and read `tools/list` without a credential is how it
 * decides whether connecting is worth sending a person to a consent screen at
 * all — and it is what MCP clients and directory scanners expect. Everything
 * that reads or changes a person's data, `tools/call` above all, still needs a
 * credential.
 */
const UNAUTHENTICATED_METHODS = new Set([
  "initialize",
  "notifications/initialized",
  "notifications/cancelled",
  "ping",
  "tools/list",
  "resources/list",
  "resources/templates/list",
  "prompts/list",
])

/**
 * Whether every message in this body is one an unauthenticated caller may send.
 *
 * A batch is allowed only if all of its messages are, so a `tools/call` cannot
 * ride along beside an `initialize`. A body that cannot be parsed is not
 * allowed: an unreadable request gets the 401, not the benefit of the doubt.
 */
const isUnauthenticatedRequest = (body: string): boolean => {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return false
  }

  const messages = Array.isArray(parsed) ? parsed : [parsed]
  if (messages.length === 0) return false

  return messages.every((message) =>
    typeof message === "object" &&
    message !== null &&
    typeof (message as { readonly method?: unknown }).method === "string" &&
    UNAUTHENTICATED_METHODS.has((message as { readonly method: string }).method),
  )
}

export const makeMcpWebHandler = Effect.gen(function* () {
  const config = yield* AppConfig
  const { auth } = yield* BetterAuth
  const mcpTools = yield* McpTools
  const oauthClient = createAuthClient({ plugins: [oauthProviderResourceClient(auth)] })

  return async (request: Request): Promise<Response> => {
    const credential = bearerCredential(request.headers.get("authorization"))

    if (!credential) {
      // The body has to be read to know which method was asked for, and it can
      // only be read once, so the request is rebuilt around the text for
      // whichever handler ends up serving it.
      const body = request.method === "POST" ? await request.text() : ""
      if (request.method !== "POST" || !isUnauthenticatedRequest(body)) {
        return unauthorized(config.auth.baseUrl)
      }

      return mcpTools.catalogHandler(new Request(request.url, {
        method: "POST",
        headers: request.headers,
        body,
      }))
    }

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
          verifyOptions: mcpOAuthVerificationOptions(config.auth.baseUrl),
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
