import { SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/sdk/types.js"
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
import { ProfileRepository } from "../modules/profiles/ProfileRepository.js"
import { PublicProfileRepository } from "../modules/profiles/PublicProfileRepository.js"
import { ApiKeyRateLimiter } from "../modules/rate-limit/ApiKeyRateLimiter.js"
import { BearerRateLimiter } from "../modules/rate-limit/BearerRateLimiter.js"
import { ConnectAuthorizeRateLimiter } from "../modules/rate-limit/ConnectAuthorizeRateLimiter.js"
import { ConnectExchangeRateLimiter } from "../modules/rate-limit/ConnectExchangeRateLimiter.js"
import { PublicProfileRateLimiter } from "../modules/rate-limit/PublicProfileRateLimiter.js"
import { SavedItemRepository } from "../modules/saved-items/SavedItemRepository.js"
import {
  exposedApiResponseHeaders,
  PUBLIC_API_PREFIX,
  withApiKeyRateLimit,
  withPublicRateLimit,
} from "./ApiRequestMiddleware.js"
import { OAUTH_PROTOCOL_SCOPES, V1_SCOPES } from "../modules/auth/Scopes.js"
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

const errorDetailsByStatus: Record<number, {
  readonly tag: string
  readonly code: string
  readonly message: string
}> = {
  400: { tag: "BadRequest", code: "bad_request", message: "The request is invalid." },
  401: { tag: "Unauthorized", code: "unauthorized", message: "Authentication is required." },
  403: { tag: "Forbidden", code: "forbidden", message: "The credential cannot perform this action." },
  404: { tag: "RouteNotFound", code: "route_not_found", message: "No API route matches this request." },
  405: { tag: "MethodNotAllowed", code: "method_not_allowed", message: "This API route does not support the request method." },
  406: { tag: "NotAcceptable", code: "not_acceptable", message: "The requested response representation is unavailable." },
  415: { tag: "UnsupportedMediaType", code: "unsupported_media_type", message: "The request content type is unsupported." },
  429: { tag: "RateLimitExceeded", code: "rate_limit_exceeded", message: "The request rate limit was exceeded." },
  500: { tag: "InternalServerError", code: "internal_error", message: "The API could not complete the request." },
}

export const withJsonErrorFallback = (
  request: Request,
  response: Response,
): Response => {
  if (response.status < 400) return response
  if ((response.headers.get("content-type") ?? "").toLowerCase().includes("json")) {
    return response
  }

  const details = errorDetailsByStatus[response.status] ?? {
    tag: "HttpError",
    code: "http_error",
    message: `The API returned HTTP ${response.status}.`,
  }
  const url = new URL(request.url)
  const headers = new Headers(response.headers)
  headers.set("content-type", "application/json; charset=utf-8")
  headers.set("cache-control", "no-store")

  return new Response(JSON.stringify({
    _tag: details.tag,
    code: details.code,
    message: details.message,
    resolution: "Check https://sleevy.app/openapi.json for supported paths, methods, request fields, and authentication requirements.",
    method: request.method,
    path: url.pathname,
  }), {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export const makeApiWebHandler = Effect.gen(function* () {
  const config = yield* AppConfig
  const context = yield* Effect.context<
    Analytics | AuthHandler | BetterAuth | CaptureService | EnrichmentWorkflow | SavedItemRepository | FolderRepository | ProfileRepository | PublicProfileRepository | ApiKeyRateLimiter | BearerRateLimiter | ConnectCodeRepository | ConnectAuthorizeRateLimiter | ConnectExchangeRateLimiter | PublicProfileRateLimiter
  >()
  const authHandler = yield* AuthHandler
  const { auth } = yield* BetterAuth
  const rateLimiter = yield* ApiKeyRateLimiter
  const publicRateLimiter = yield* PublicProfileRateLimiter
  const bearerRateLimiter = yield* BearerRateLimiter
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

    if (pathname === "/.well-known/oauth-authorization-server") {
      return new Response(null, {
        status: 308,
        headers: {
          "access-control-allow-origin": "*",
          "cache-control": "public, max-age=300",
          location: `${config.auth.baseUrl}/.well-known/oauth-authorization-server${AUTH_BASE_PATH}`,
        },
      })
    }

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
        scopes_supported: pathname.endsWith("/mcp")
          ? [...MCP_SCOPES, ...OAUTH_PROTOCOL_SCOPES]
          : V1_SCOPES,
      }), {
        headers: { "content-type": "application/json", "cache-control": "public, max-age=300" },
      })
    }

    // MCP Server Card (SEP-2127). The ratified discovery path is
    // /.well-known/mcp-server-card; the /mcp/server-card.json path is kept as a
    // legacy alias. OAuth is intentionally not described here — it is discovered
    // through the /.well-known/oauth-protected-resource flow above.
    if (
      pathname === "/.well-known/mcp-server-card" ||
      pathname === "/.well-known/mcp/server-card.json"
    ) {
      return new Response(JSON.stringify({
        $schema: "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json",
        name: "app.sleevy/mcp",
        version: "1.0.0",
        title: "Sleevy",
        description:
          "Save links to your Sleevy library and manage your saved items and folders.",
        websiteUrl: config.auth.webUrl,
        remotes: [
          {
            type: "streamable-http",
            url: `${config.auth.baseUrl}/mcp`,
            supportedProtocolVersions: SUPPORTED_PROTOCOL_VERSIONS,
          },
        ],
      }), {
        headers: {
          "content-type": "application/json",
          "cache-control": "public, max-age=3600",
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET",
          "access-control-allow-headers": "Content-Type",
        },
      })
    }

    if (pathname === "/mcp") {
      return withApiKeyRateLimit(request, auth, rateLimiter, bearerRateLimiter, mcpFetch)
    }

    // The public group carries no API Key, so it takes the per-IP budget
    // instead of the API Key Rate Limit.
    if (pathname.startsWith(PUBLIC_API_PREFIX)) {
      const response = await withCors(request, config.auth.trustedOrigins, (request) =>
        withPublicRateLimit(request, publicRateLimiter, config.render.token, apiFetch),
      )
      return withJsonErrorFallback(request, response)
    }

    const response = await withCors(
      request,
      config.auth.trustedOrigins,
      isAuthRequest
        ? authHandler.handle
        : (request) =>
            withApiKeyRateLimit(request, auth, rateLimiter, bearerRateLimiter, apiFetch),
    )
    return isAuthRequest ? response : withJsonErrorFallback(request, response)
  }) satisfies ApiWebHandler
})
