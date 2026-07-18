import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client"
import { createAuthClient } from "better-auth/client"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { Effect } from "effect"

import type { UserId } from "../domain/SavedItem.js"
import { savedItemToDto } from "../api/ApiContract.js"
import { BetterAuth } from "../modules/auth/BetterAuth.js"
import { type Scope, V1_SCOPES, permissionsToScopes } from "../modules/auth/Scopes.js"
import { SavedItemRepository } from "../modules/saved-items/SavedItemRepository.js"
import { AppConfig } from "./Config.js"

const bearerCredential = (authorization: string | null) =>
  authorization?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null

const oauthScopes = (scope: unknown): ReadonlySet<Scope> =>
  typeof scope === "string"
    ? new Set(scope.split(" ").filter((value): value is Scope => V1_SCOPES.includes(value as Scope)))
    : new Set()

const asText = (value: unknown) => JSON.stringify(value, null, 2)

const runPromise = Effect.runPromise

const unauthorized = (baseUrl: string) =>
  new Response("Missing valid credentials or saved-items:read scope.", {
    status: 401,
    headers: {
      "www-authenticate": `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource/mcp"`,
    },
  })

export const makeMcpWebHandler = Effect.gen(function* () {
  const config = yield* AppConfig
  const { auth } = yield* BetterAuth
  const savedItems = yield* SavedItemRepository
  const oauthClient = config.auth.oauthProviderEnabled
    ? createAuthClient({ plugins: [oauthProviderResourceClient(auth)] })
    : undefined

  return async (request: Request): Promise<Response> => {
    const credential = bearerCredential(request.headers.get("authorization"))
    if (!credential) return unauthorized(config.auth.baseUrl)

    let userId: UserId | undefined
    let scopes: ReadonlySet<Scope> | undefined
    const apiKey = await auth.api.verifyApiKey({ body: { key: credential } })
    if (apiKey.valid && apiKey.key) {
      userId = apiKey.key.referenceId as UserId
      scopes = permissionsToScopes(apiKey.key.permissions ?? null)
    } else if (oauthClient) {
      try {
        const token = await oauthClient.verifyAccessToken(credential, {
          verifyOptions: { audience: `${config.auth.baseUrl}/mcp` },
        })
        if (typeof token.sub === "string") {
          userId = token.sub as UserId
          scopes = oauthScopes(token.scope)
        }
      } catch {
        // Return the same neutral 401 response for invalid API keys and tokens.
      }
    }

    if (!userId || !scopes?.has("saved-items:read")) {
      return unauthorized(config.auth.baseUrl)
    }

    const server = new McpServer({ name: "Sleevy", version: "1.0.0" })
    server.registerTool("list_saved_items", {
      title: "List saved items",
      description: "List the authenticated user's saved items, newest first.",
      annotations: { readOnlyHint: true },
    }, async () => {
      const items = await runPromise(savedItems.listByUser(userId!, "newest"))
      return { content: [{ type: "text", text: asText(items.map(savedItemToDto)) }] }
    })

    const transport = new WebStandardStreamableHTTPServerTransport({
      enableJsonResponse: true,
      allowedOrigins: [...config.auth.trustedOrigins],
      allowedHosts: [new URL(config.auth.baseUrl).host],
      enableDnsRebindingProtection: true,
    })
    await server.connect(transport)
    return transport.handleRequest(request)
  }
})
