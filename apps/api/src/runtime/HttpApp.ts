import { Effect, Layer } from "effect"
import { HttpEffect, HttpMiddleware, HttpRouter, HttpServer } from "effect/unstable/http"

import { sleevyApiLive } from "../api/ApiHandlers.js"
import { Analytics } from "../modules/analytics/Analytics.js"
import { AuthHandler } from "../modules/auth/AuthHandler.js"
import { AUTH_BASE_PATH, authServerUrl, BetterAuth } from "../modules/auth/BetterAuth.js"
import { authServerMetadataPaths, withAgentAuthMetadata } from "../modules/auth/AgentAuthMetadata.js"
import { CaptureService } from "../modules/capture/CaptureService.js"
import { ConnectCodeRepository } from "../modules/connect/ConnectCodeRepository.js"
import { EnrichmentWorkflow } from "../modules/enrichment/EnrichmentWorkflow.js"
import { FolderRepository } from "../modules/folders/FolderRepository.js"
import { IdempotencyStore } from "../modules/idempotency/IdempotencyStore.js"
import { withIdempotency } from "../modules/idempotency/IdempotentWrites.js"
import { ProfileRepository } from "../modules/profiles/ProfileRepository.js"
import { PublicProfileCachePurger } from "../modules/profiles/PublicProfileCachePurger.js"
import { PublicProfileRepository } from "../modules/profiles/PublicProfileRepository.js"
import { AnonymousRateLimiter } from "../modules/rate-limit/AnonymousRateLimiter.js"
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
import { mcpServerCard, MCP_SERVER_CARD_CONTENT_TYPE } from "../modules/mcp/ServerCard.js"
import { withVersionHeaders } from "./ApiVersioning.js"
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
    "access-control-allow-headers": "authorization, content-type, idempotency-key",
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

const mcpServerCardPaths = new Set([
  "/mcp/server-card",
  "/.well-known/mcp-server-card",
  "/.well-known/mcp/server-card.json",
])

const entityTagFor = (value: string) => {
  let hash = 2_166_136_261
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16_777_619)
  }
  return `W/\"${(hash >>> 0).toString(16)}\"`
}

const mcpServerCardResponse = (request: Request, input: {
  readonly apiBaseUrl: string
  readonly webUrl: string
}) => {
  const body = JSON.stringify(mcpServerCard(input))
  const etag = entityTagFor(body)
  const headers = new Headers({
    "content-type": MCP_SERVER_CARD_CONTENT_TYPE,
    "cache-control": "public, max-age=3600",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET",
    "access-control-allow-headers": "Content-Type, If-None-Match",
    "access-control-expose-headers": "ETag",
    etag,
  })

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers })
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    headers.set("allow", "GET, HEAD, OPTIONS")
    headers.set("content-type", "application/json; charset=utf-8")
    return new Response(JSON.stringify({
      _tag: "MethodNotAllowed",
      code: "method_not_allowed",
      message: "The MCP Server Card only supports GET and HEAD requests.",
      resolution: "Request the card with GET or connect to the MCP endpoint at /mcp.",
    }), { status: 405, headers })
  }

  const validators = (request.headers.get("if-none-match") ?? "")
    .split(",")
    .map((value) => value.trim())

  return validators.includes(etag) || validators.includes("*")
    ? new Response(null, { status: 304, headers })
    : new Response(request.method === "HEAD" ? null : body, { headers })
}

export const makeApiWebHandler = Effect.gen(function* () {
  const config = yield* AppConfig
  const context = yield* Effect.context<
    Analytics | AuthHandler | BetterAuth | CaptureService | EnrichmentWorkflow | IdempotencyStore | SavedItemRepository | FolderRepository | ProfileRepository | PublicProfileCachePurger | PublicProfileRepository | AnonymousRateLimiter | ApiKeyRateLimiter | BearerRateLimiter | ConnectCodeRepository | ConnectAuthorizeRateLimiter | ConnectExchangeRateLimiter | PublicProfileRateLimiter
  >()
  const authHandler = yield* AuthHandler
  const { auth } = yield* BetterAuth
  const rateLimiter = yield* ApiKeyRateLimiter
  const publicRateLimiter = yield* PublicProfileRateLimiter
  const bearerRateLimiter = yield* BearerRateLimiter
  const idempotencyStore = yield* IdempotencyStore
  const anonymousRateLimiter = yield* AnonymousRateLimiter
  const mcpFetch = yield* makeMcpWebHandler
  const httpEffect = yield* HttpRouter.toHttpEffect(httpAppLayer)
  const apiFetch = HttpEffect.toWebHandler(
    Effect.provideContext(HttpMiddleware.tracer(httpEffect), context),
  )

  const metadataPaths = authServerMetadataPaths()

  const handle = async (request: Request): Promise<Response> => {
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

    // Server Card discovery is defined by the MCP Extensions Track. The card
    // lives next to the Streamable HTTP endpoint; older well-known paths remain
    // aliases for clients and scanners that implemented an earlier draft.
    if (mcpServerCardPaths.has(pathname)) {
      return mcpServerCardResponse(request, {
        apiBaseUrl: config.auth.baseUrl,
        webUrl: config.auth.webUrl,
      })
    }

    if (pathname === "/mcp") {
      return withApiKeyRateLimit(request, auth, rateLimiter, bearerRateLimiter, anonymousRateLimiter, mcpFetch)
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
            // Idempotency sits inside the rate limit on purpose: a replayed
            // response is still a request the caller made, so it costs budget,
            // and the 429 for an over-budget caller must not be recorded as
            // the answer to their key.
            withApiKeyRateLimit(request, auth, rateLimiter, bearerRateLimiter, anonymousRateLimiter, (request) =>
              withIdempotency(request, idempotencyStore, apiFetch)),
    )
    if (!isAuthRequest) return withJsonErrorFallback(request, response)

    // The authorization-server metadata is where an agent looks for the
    // auth.md `agent_auth` block, so it is added on the way out rather than
    // published as a separate document that could drift from the real one.
    return metadataPaths.has(pathname)
      ? withAgentAuthMetadata(response, {
          apiBaseUrl: config.auth.baseUrl,
          webUrl: config.auth.webUrl,
        })
      : response
  }

  // Every response says which version of the API answered it, and any operation
  // on its way out announces its own retirement, so a client learns about a
  // change from the responses it is already reading.
  return (async (request) =>
    withVersionHeaders(request, await handle(request))) satisfies ApiWebHandler
})
