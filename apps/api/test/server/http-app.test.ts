import { describe, expect } from "bun:test"
import { Effect, Layer, Option } from "effect"

import type {
  CaptureChannel,
  LinkId,
  SavedItemId,
  SavedItemWithLink,
  UserId,
} from "../../src/domain/SavedItem.js"
import { AuthHandler } from "../../src/modules/auth/AuthHandler.js"
import { BetterAuth } from "../../src/modules/auth/BetterAuth.js"
import { Analytics } from "../../src/modules/analytics/Analytics.js"
import { CaptureService } from "../../src/modules/capture/CaptureService.js"
import { EnrichmentWorkflow } from "../../src/modules/enrichment/EnrichmentWorkflow.js"
import { FolderRepository } from "../../src/modules/folders/FolderRepository.js"
import { ApiKeyRateLimiter } from "../../src/modules/rate-limit/ApiKeyRateLimiter.js"
import { SavedItemRepository } from "../../src/modules/saved-items/SavedItemRepository.js"
import { savedItemsTable } from "../../src/modules/persistence/schema.js"
import { AppConfig } from "../../src/runtime/Config.js"
import { makeApiWebHandler } from "../../src/runtime/HttpApp.js"
import { it } from "../lib/effect.js"

const userId = "route-user-1" as UserId
const linkId = "route-link-1" as LinkId
const savedItemId = "route-saved-item-1" as SavedItemId
const apiKey = "sly_" + "a".repeat(61)
const now = new Date("2026-05-19T12:00:00.000Z")

const configLayer = Layer.succeed(AppConfig, AppConfig.of({
  database: { url: "" },
  redis: { url: "" },
  http: { port: 0 },
  fetch: {
    timeoutMs: 5_000,
    userAgent: "test",
    browserFallbackEnabled: false,
    browserTimeoutMs: 5_000,
    cloudflareAccountId: "",
    cloudflareApiToken: "",
  },
  ai: {
    enabled: false,
    provider: undefined,
    model: undefined,
    apiKey: undefined,
  },
  auth: {
    googleClientId: "",
    googleClientSecret: "",
    appleClientId: "",
    appleTeamId: "",
    appleKeyId: "",
    applePrivateKey: "",
    appleAppBundleIdentifier: "",
    secret: "test",
    baseUrl: "http://localhost",
    webUrl: "https://web.sleevy.test",
    oauthProviderEnabled: false,
    trustedOrigins: ["https://web.sleevy.test"],
  },
  rybbit: {
    enabled: false,
    apiUrl: "",
    siteId: "",
    apiKey: "",
  },
}))

const routeLayer = (input: {
  readonly sessionUserId?: UserId | undefined
  readonly apiKeyValid?: boolean | undefined
  readonly apiKeyAllowed?: boolean | undefined
  readonly onCapture?: ((input: {
    readonly userId: UserId
    readonly url: string
    readonly captureChannel?: CaptureChannel | undefined
  }) => void) | undefined
} = {}) =>
  Layer.mergeAll(
    configLayer,
    Layer.succeed(Analytics, Analytics.of({ track: () => Effect.void })),
    Layer.succeed(AuthHandler, AuthHandler.of({
      handle: async () => new Response("auth route", { status: 200 }),
    })),
    Layer.succeed(BetterAuth, BetterAuth.of({
      auth: {
        api: {
          getSession: async () =>
            input.sessionUserId
              ? {
                  user: {
                    id: input.sessionUserId,
                    email: "route-user@example.com",
                  },
                }
              : null,
          verifyApiKey: async () => ({
            valid: input.apiKeyValid ?? true,
            error: input.apiKeyValid === false ? new Error("invalid") : null,
            key: {
              id: "api-key-1",
              referenceId: userId,
              permissions: { "saved-items": ["read"] },
            },
          }),
        },
      },
      handler: async () => new Response("auth route", { status: 200 }),
    } as never)),
    Layer.succeed(CaptureService, CaptureService.of({
      save: (captureInput) =>
        Effect.sync(() => {
          input.onCapture?.({
            userId: captureInput.userId,
            url: captureInput.url,
            captureChannel: captureInput.captureChannel,
          })

          return {
            savedItem: makeSavedItem(captureInput.userId, {
              captureChannel: captureInput.captureChannel,
            }),
            captureResult: "created" as const,
            enrichment: { _tag: "start" as const, linkId },
          }
        }),
    })),
    Layer.succeed(EnrichmentWorkflow, EnrichmentWorkflow.of({
      enrich: () => Effect.void as never,
    } as never)),
    Layer.succeed(FolderRepository, FolderRepository.of({} as never)),
    Layer.succeed(SavedItemRepository, SavedItemRepository.of({
      findByUserAndId: () => Effect.succeed(Option.none()),
      listByUser: (requestedUserId: UserId) =>
        Effect.succeed(
          requestedUserId === userId
            ? []
            : [],
        ),
      setReadState: () => Effect.succeed(Option.none()),
      deleteByUserAndId: () => ({
        execute: () => Promise.resolve({}),
        comment: () => undefined,
        _: {},
        getSQL: () => undefined,
        toSQL: () => ({ sql: "", params: [] }),
        prepare: () => undefined,
        catch: () => undefined,
        finally: () => undefined,
        then: () => undefined,
        [Symbol.toStringTag]: "PgEffectDeleteBase",
        table: savedItemsTable,
      } as never),
    } as never)),
    Layer.succeed(ApiKeyRateLimiter, ApiKeyRateLimiter.of({
      check: () =>
        Effect.succeed({
          allowed: input.apiKeyAllowed ?? true,
          limit: 20,
          remaining: input.apiKeyAllowed === false ? 0 : 19,
          resetSeconds: 42,
        }),
    })),
  )

const makeSavedItem = (
  savedByUserId: UserId,
  input: {
    readonly captureChannel?: CaptureChannel | undefined
  } = {},
): SavedItemWithLink => ({
  savedItem: {
    id: savedItemId,
    userId: savedByUserId,
    linkId,
    captureChannel: input.captureChannel,
    tags: ["backend"],
    isRead: false,
    lastSavedAt: now,
    createdAt: now,
    updatedAt: now,
  },
  link: {
    id: linkId,
    originalUrl: "https://example.com/articles/route-test",
    normalizedUrl: "https://example.com/articles/route-test",
    host: "example.com",
    createdAt: now,
    updatedAt: now,
  },
  metadata: {
    linkId,
    title: "Route Test",
    fetchedAt: now,
    updatedAt: now,
  },
  enrichment: {
    linkId,
    type: "article",
    tags: ["backend"],
    status: "pending",
    updatedAt: now,
  },
})

const request = (url: string, init?: RequestInit) =>
  Effect.gen(function* () {
    const handler = yield* makeApiWebHandler
    return yield* Effect.promise(() =>
      handler(new Request(new URL(url, "http://localhost"), init)),
    )
  })

const json = <T>(response: Response) =>
  Effect.promise(() => response.json() as Promise<T>)

const text = (response: Response) =>
  Effect.promise(() => response.text())

const mcpRequest = (
  message: unknown,
  options: {
    readonly credentials?: boolean | undefined
    readonly protocolVersion?: string | undefined
  } = {},
) =>
  request("/mcp", {
    method: "POST",
    headers: {
      ...(options.credentials ? { authorization: `Bearer ${apiKey}` } : {}),
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      host: "localhost",
      ...(options.protocolVersion ? { "mcp-protocol-version": options.protocolVersion } : {}),
    },
    body: JSON.stringify(message),
  })

describe("HttpApp", () => {
  it.effect("serves health through the in-memory web handler", () =>
    Effect.gen(function* () {
      const response = yield* request("/health").pipe(
        Effect.provide(routeLayer()),
      )

      expect(response.status).toBe(200)
      expect(yield* json(response)).toEqual({ ok: true })
    }),
  )

  it.effect("serves the generated OpenAPI document", () =>
    Effect.gen(function* () {
      const response = yield* request("/openapi.json").pipe(
        Effect.provide(routeLayer()),
      )

      expect(response.status).toBe(200)
      const body = yield* json<{
        readonly openapi?: string
        readonly paths?: Record<string, unknown>
      }>(response)

      expect(body.openapi).toBeTruthy()
      expect(body.paths?.["/v1/captures"]).toBeDefined()
      expect(body.paths?.["/v1/saved-items"]).toBeDefined()
      expect(body.paths?.["/v1/saved-items/{id}/read"]).toBeDefined()
      expect(body.paths?.["/v1/saved-items/{id}/unread"]).toBeDefined()
      expect(body.paths?.["/v1/saved-items/{id}/read-state"]).toBeDefined()
      expect(body.paths?.["/v1/saved-items/{id}/folder"]).toBeDefined()
      expect(body.paths?.["/v1/folders"]).toBeDefined()
      expect(body.paths?.["/v1/folders/{id}"]).toBeDefined()
      expect(body.paths?.["/connect/authorize"]).toBeDefined()
      expect(body.paths?.["/connect/exchange"]).toBeDefined()
    }),
  )

  it.effect("publishes OAuth protected-resource metadata for MCP", () =>
    Effect.gen(function* () {
      const response = yield* request("/.well-known/oauth-protected-resource/mcp").pipe(
        Effect.provide(routeLayer()),
      )

      expect(response.status).toBe(200)
      expect(JSON.parse(yield* text(response))).toEqual({
        resource: "http://localhost/mcp",
        authorization_servers: ["http://localhost/api/auth"],
        scopes_supported: ["saved-items:read"],
      })
    }),
  )

  it.effect("requires credentials before MCP initialization", () =>
    Effect.gen(function* () {
      const response = yield* mcpRequest({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "test", version: "1.0.0" },
          },
        }).pipe(Effect.provide(routeLayer()))

      expect(response.status).toBe(401)
      expect(response.headers.get("www-authenticate")).toBe(
        'Bearer resource_metadata="http://localhost/.well-known/oauth-protected-resource/mcp"',
      )
    }),
  )

  it.effect("initializes MCP with a scoped API key", () =>
    Effect.gen(function* () {
      const response = yield* mcpRequest(
        {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "test", version: "1.0.0" },
          },
        },
        { credentials: true },
      ).pipe(Effect.provide(routeLayer()))

      expect(response.status).toBe(200)
      expect(JSON.parse(yield* text(response))).toMatchObject({
        jsonrpc: "2.0",
        id: 1,
        result: { serverInfo: { name: "Sleevy", version: "1.0.0" } },
      })
    }),
  )

  it.effect("lists only the read-only saved-items MCP tool", () =>
    Effect.gen(function* () {
      const response = yield* mcpRequest(
        {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
          params: {},
        },
        { credentials: true, protocolVersion: "2025-06-18" },
      ).pipe(Effect.provide(routeLayer()))

      expect(response.status).toBe(200)
      expect(JSON.parse(yield* text(response))).toMatchObject({
        jsonrpc: "2.0",
        id: 2,
        result: {
          tools: [{ name: "list_saved_items", annotations: { readOnlyHint: true } }],
        },
      })
    }),
  )

  it.effect("returns the authenticated user's saved items through MCP", () =>
    Effect.gen(function* () {
      const response = yield* mcpRequest(
        {
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name: "list_saved_items", arguments: {} },
        },
        { credentials: true, protocolVersion: "2025-06-18" },
      ).pipe(Effect.provide(routeLayer()))

      expect(response.status).toBe(200)
      expect(JSON.parse(yield* text(response))).toMatchObject({
        jsonrpc: "2.0",
        id: 3,
        result: { content: [{ type: "text", text: "[]" }] },
      })
    }),
  )

  it.effect("applies CORS preflight headers without calling route handlers", () =>
    Effect.gen(function* () {
      const response = yield* request("/v1/saved-items", {
        method: "OPTIONS",
        headers: { origin: "https://web.sleevy.test" },
      }).pipe(Effect.provide(routeLayer()))

      expect(response.status).toBe(204)
      expect(response.headers.get("access-control-allow-origin")).toBe(
        "https://web.sleevy.test",
      )
      expect(response.headers.get("access-control-expose-headers")).toContain(
        "ratelimit-limit",
      )
    }),
  )

  it.effect("routes auth endpoints to the auth handler", () =>
    Effect.gen(function* () {
      const response = yield* request("/api/auth/session").pipe(
        Effect.provide(routeLayer()),
      )

      expect(response.status).toBe(200)
      expect(yield* text(response)).toBe("auth route")
    }),
  )

  it.effect("returns Unauthorized for protected API routes without a session", () =>
    Effect.gen(function* () {
      const response = yield* request("/v1/saved-items").pipe(
        Effect.provide(routeLayer()),
      )

      expect(response.status).toBe(401)
      expect(yield* json(response)).toEqual({
        _tag: "Unauthorized",
        message: "Missing or invalid credentials.",
      })
    }),
  )

  it.effect("serves protected API routes with a valid session", () =>
    Effect.gen(function* () {
      const response = yield* request("/v1/saved-items").pipe(
        Effect.provide(routeLayer({ sessionUserId: userId })),
      )

      expect(response.status).toBe(200)
      expect(yield* json(response)).toEqual({ savedItems: [] })
    }),
  )

  it.effect("posts captures through auth, routing, and response encoding", () => {
    let seenCapture:
      | {
        readonly userId: UserId
        readonly url: string
        readonly captureChannel?: CaptureChannel | undefined
      }
      | undefined

    return Effect.gen(function* () {
      const response = yield* request("/v1/captures", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: globalThis.JSON.stringify({
          url: "https://example.com/articles/route-test",
          captureChannel: "api",
          tags: ["backend"],
        }),
      }).pipe(
        Effect.provide(routeLayer({
          sessionUserId: userId,
          onCapture: (captureInput) => {
            seenCapture = captureInput
          },
        })),
      )

      expect(response.status).toBe(201)
      expect(seenCapture).toEqual({
        userId,
        url: "https://example.com/articles/route-test",
        captureChannel: "api",
      })

      const body = yield* json<{
        readonly captureResult: string
        readonly savedItem: {
          readonly id: string
          readonly title?: string
          readonly tags: readonly string[]
        }
      }>(response)

      expect(body.captureResult).toBe("created")
      expect(body.savedItem.id).toBe(savedItemId)
      expect(body.savedItem.title).toBe("Route Test")
      expect(body.savedItem.tags).toEqual(["backend"])
    })
  })

  it.effect("returns rate-limit responses before protected handlers run", () =>
    Effect.gen(function* () {
      const response = yield* request("/v1/saved-items", {
        headers: { authorization: `Bearer ${apiKey}` },
      }).pipe(
        Effect.provide(routeLayer({
          sessionUserId: userId,
          apiKeyAllowed: false,
        })),
      )

      expect(response.status).toBe(429)
      expect(response.headers.get("retry-after")).toBe("42")
      expect(yield* json(response)).toEqual({
        _tag: "RateLimitExceeded",
        message: "API key rate limit exceeded.",
      })
    }),
  )
})
