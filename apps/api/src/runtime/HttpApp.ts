import { Effect, Layer } from "effect"
import { HttpEffect, HttpMiddleware, HttpRouter, HttpServer } from "effect/unstable/http"

import { sleevyApiLive } from "../api/ApiHandlers.js"
import { Analytics } from "../modules/analytics/Analytics.js"
import { AuthHandler } from "../modules/auth/AuthHandler.js"
import { AUTH_BASE_PATH, authServerUrl, BetterAuth } from "../modules/auth/BetterAuth.js"
import { CaptureService } from "../modules/capture/CaptureService.js"
import { ConnectCodeRepository } from "../modules/connect/ConnectCodeRepository.js"
import { EnrichmentWorkflow } from "../modules/enrichment/EnrichmentWorkflow.js"
import { FolderRepository } from "../modules/folders/FolderRepository.js"
import { ApiKeyRateLimiter } from "../modules/rate-limit/ApiKeyRateLimiter.js"
import { ConnectAuthorizeRateLimiter } from "../modules/rate-limit/ConnectAuthorizeRateLimiter.js"
import { ConnectExchangeRateLimiter } from "../modules/rate-limit/ConnectExchangeRateLimiter.js"
import { SavedItemRepository } from "../modules/saved-items/SavedItemRepository.js"
import {
  exposedApiResponseHeaders,
  withApiKeyRateLimit,
} from "./ApiRequestMiddleware.js"
import { V1_SCOPES } from "../modules/auth/Scopes.js"
import { MCP_SCOPES } from "../modules/mcp/McpTools.js"
import { AppConfig } from "./Config.js"
import { makeMcpWebHandler } from "./McpApp.js"

export type ApiWebHandler = (request: Request) => Promise<Response>

export const httpAppLayer = sleevyApiLive.pipe(
  Layer.provide(HttpServer.layerServices),
)

export const corsHeaders = (
  request: Request,
  trustedOrigins: readonly string[],
) => {
  const origin = request.headers.get("origin")
  const headers = new Headers({
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "access-control-expose-headers": exposedApiResponseHeaders.join(", "),
    vary: "Origin",
  })

  if (origin && trustedOrigins.includes(origin)) {
    headers.set("access-control-allow-origin", origin)
  }

  return headers
}

const setCookieHeaders = (headers: Headers) =>
  typeof headers.getSetCookie === "function"
    ? headers.getSetCookie()
    : []

export const withCors = async (
  request: Request,
  trustedOrigins: readonly string[],
  handle: ApiWebHandler,
) => {
  const headersToAdd = corsHeaders(request, trustedOrigins)

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: headersToAdd })
  }

  const response = await handle(request)
  const cookies = setCookieHeaders(response.headers)
  const headers = new Headers(response.headers)
  headers.delete("set-cookie")
  headersToAdd.forEach((value, key) => headers.set(key, value))
  cookies.forEach((cookie) => headers.append("set-cookie", cookie))

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export const makeApiWebHandler = Effect.gen(function* () {
  const config = yield* AppConfig
  const context = yield* Effect.context<
    Analytics | AuthHandler | BetterAuth | CaptureService | EnrichmentWorkflow | SavedItemRepository | FolderRepository | ApiKeyRateLimiter | ConnectCodeRepository | ConnectAuthorizeRateLimiter | ConnectExchangeRateLimiter
  >()
  const authHandler = yield* AuthHandler
  const { auth } = yield* BetterAuth
  const rateLimiter = yield* ApiKeyRateLimiter
  const mcpFetch = yield* makeMcpWebHandler
  const httpEffect = yield* HttpRouter.toHttpEffect(httpAppLayer)
  const apiFetch = HttpEffect.toWebHandler(
    Effect.provideContext(HttpMiddleware.tracer(httpEffect), context),
  )

  return (async (request) => {
    const pathname = new URL(request.url).pathname
    const isAuthRequest =
      pathname.startsWith(`${AUTH_BASE_PATH}/`) ||
      pathname === "/.well-known/oauth-authorization-server/api/auth" ||
      pathname === "/api/auth/.well-known/oauth-authorization-server"

    if (
      pathname === "/.well-known/oauth-protected-resource" ||
      pathname === "/.well-known/oauth-protected-resource/mcp"
    ) {
      const resource = pathname.endsWith("/mcp")
        ? `${config.auth.baseUrl}/mcp`
        : config.auth.baseUrl

      return new Response(JSON.stringify({
        resource,
        authorization_servers: [authServerUrl(config.auth.baseUrl)],
        scopes_supported: pathname.endsWith("/mcp") ? MCP_SCOPES : V1_SCOPES,
      }), {
        headers: { "content-type": "application/json", "cache-control": "public, max-age=300" },
      })
    }

    if (pathname === "/.well-known/mcp/server-card.json") {
      return new Response(JSON.stringify({
        url: `${config.auth.baseUrl}/mcp`,
        authentication: {
          type: "oauth2",
          authorization_server: authServerUrl(config.auth.baseUrl),
        },
      }), {
        headers: { "content-type": "application/json", "cache-control": "public, max-age=300" },
      })
    }

    if (pathname === "/mcp") {
      return withApiKeyRateLimit(request, auth, rateLimiter, mcpFetch)
    }

    return withCors(
      request,
      config.auth.trustedOrigins,
      isAuthRequest
        ? authHandler.handle
        : (request) =>
            withApiKeyRateLimit(request, auth, rateLimiter, apiFetch),
    )
  }) satisfies ApiWebHandler
})
