import { SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/sdk/types.js"
import { captureChannels, type PublicSavedItemsResponse } from "@sleevy/contract"
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
import { McpTools } from "../../src/modules/mcp/McpTools.js"
import { RESERVED_HANDLES } from "../../src/modules/profiles/Handle.js"
import { ProfileRepository } from "../../src/modules/profiles/ProfileRepository.js"
import {
  type PublicSavedItem,
  PublicProfileRepository,
} from "../../src/modules/profiles/PublicProfileRepository.js"
import { PUBLIC_SAVED_ITEMS_PAGE_SIZE } from "../../src/modules/profiles/PublicSavedItems.js"
import {
  INDEXABLE_PROFILES_PAGE_SIZE,
  isIndexable,
} from "../../src/modules/profiles/SearchIndexing.js"
import { ApiKeyRateLimiter } from "../../src/modules/rate-limit/ApiKeyRateLimiter.js"
import { BearerRateLimiter } from "../../src/modules/rate-limit/BearerRateLimiter.js"
import { ConnectAuthorizeRateLimiter } from "../../src/modules/rate-limit/ConnectAuthorizeRateLimiter.js"
import { ConnectExchangeRateLimiter } from "../../src/modules/rate-limit/ConnectExchangeRateLimiter.js"
import {
  PUBLIC_PROFILE_REQUEST_LIMIT,
  PublicProfileRateLimiter,
} from "../../src/modules/rate-limit/PublicProfileRateLimiter.js"
import { SavedItemRepository } from "../../src/modules/saved-items/SavedItemRepository.js"
import { savedItemsTable } from "../../src/modules/persistence/schema.js"
import { AppConfig } from "../../src/runtime/Config.js"
import { makeApiWebHandler } from "../../src/runtime/HttpApp.js"
import { it } from "../lib/effect.js"

const userId = "route-user-1" as UserId
const otherUserId = "route-user-2" as UserId
const linkId = "route-link-1" as LinkId
const savedItemId = "route-saved-item-1" as SavedItemId
const apiKey = "sly_" + "a".repeat(61)
const now = new Date("2026-05-19T12:00:00.000Z")
// The rolling window the stub reports. Which days the window really spans is a
// Postgres question, proven in test/integration.
const activityWindow = { from: "2025-05-20", to: "2026-05-19" } as const

// The Render Token every test but the render ones runs with. A test that states
// no token is therefore a public API client, and takes the budget.
const RENDER_TOKEN = "test-render-token"

const configLayer = Layer.succeed(AppConfig, AppConfig.of({
  database: { url: "" },
  redis: { url: "" },
  render: { token: RENDER_TOKEN },
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
  readonly bearerAllowed?: boolean | undefined
  readonly apiKeyPermissions?: Record<string, string[]> | undefined
  readonly savedItemsPage?: boolean | undefined
  readonly claimedHandle?: {
    readonly userId: UserId
    readonly handle: string
  } | undefined
  readonly onCapture?: ((input: {
    readonly userId: UserId
    readonly url: string
    readonly captureChannel?: CaptureChannel | undefined
  }) => void) | undefined
  readonly onConnectRateLimit?: ((input: {
    readonly limiter: "authorize" | "exchange"
    readonly key: string
  }) => void) | undefined
  // Public Profiles the stub repository knows about, private ones included, so
  // the unknown-Handle case and the private-Handle case can be compared.
  readonly publicProfiles?: ReadonlyArray<{
    readonly handle: string
    readonly visibility: "private" | "public"
    readonly joinedAt: Date
    readonly publicSavedItemCount: number
    // The days the stub reports as Reading Activity. Which days a real Account
    // has is a Postgres question, proven in test/integration.
    readonly readingActivity?: ReadonlyArray<{
      readonly date: string
      readonly count: number
    }> | undefined
    // The Saved Items this Public Profile publishes, newest first. Which items
    // a Public Profile shows is a database rule proven in the integration seam,
    // so the fixture here is already the published set.
    readonly savedItems?: ReadonlyArray<PublicSavedItem> | undefined
    // When the published page last changed. Which Saved Item's creation time
    // that is comes from Postgres and is proven in the integration seam.
    readonly lastModifiedAt?: Date | undefined
  }> | undefined
  readonly publicRateLimitAllowed?: boolean | undefined
  readonly onPublicRateLimit?: ((key: string) => void) | undefined
} = {}) => {
  // The connect limiters deny every request, so a connect request stops at the
  // limiter and reports the key it was bucketed on.
  const connectLimiterResult = {
    allowed: false,
    limit: 10,
    remaining: 0,
    resetSeconds: 42,
  } as const

  // One in-memory Folder, fresh for every layer build, so the widened Folder
  // update can be read back field by field.
  const folder = {
    id: "route-folder-1",
    userId,
    name: "Research",
    emoji: null as string | null,
    color: null as string | null,
    isPublished: false,
    createdAt: now,
    updatedAt: now,
  }

  // One in-memory profile record per Account, fresh for every layer build. It
  // stands in for Postgres, so it also refuses two Handles that differ only by
  // case; the database index itself is proven in the integration seam.
  const profiles = new Map<UserId, {
    readonly id: string
    readonly userId: UserId
    handle: string
    visibility: "private" | "public"
    readonly createdAt: Date
    updatedAt: Date
  }>()
  const profileByHandle = (handle: string) =>
    [...profiles.values()].find(
      (profile) => profile.handle.toLowerCase() === handle.toLowerCase(),
    )

  // Stands in for the SQL lookup of the public group, which filters on Profile
  // Visibility in its WHERE clause: a private Public Profile leaves every public
  // route without a row, exactly like a Handle no Account holds. All three public
  // reads go through this one function, so none can drift from the others.
  const findPublicProfile = (handle: string) =>
    (input.publicProfiles ?? []).find(
      (profile) =>
        profile.handle.toLowerCase() === handle.toLowerCase() &&
        profile.visibility === "public",
    )

  if (input.claimedHandle) {
    profiles.set(input.claimedHandle.userId, {
      id: "route-profile-seeded",
      userId: input.claimedHandle.userId,
      handle: input.claimedHandle.handle,
      visibility: "private",
      createdAt: now,
      updatedAt: now,
    })
  }

  const baseLayer = Layer.mergeAll(
    configLayer,
    Layer.succeed(Analytics, Analytics.of({ track: () => Effect.void })),
    Layer.succeed(AuthHandler, AuthHandler.of({
      handle: async () => new Response("auth route", { status: 200 }),
    })),
    Layer.succeed(BetterAuth, BetterAuth.of({
      auth: {
        options: { baseURL: "http://localhost", basePath: "/api/auth" },
        $context: Promise.resolve({}),
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
              permissions: input.apiKeyPermissions ?? { "saved-items": ["read"] },
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
    Layer.succeed(FolderRepository, FolderRepository.of({
      listByUser: () => Effect.succeed([]),
      findByUserAndId: (_userId: UserId, id: string) =>
        Effect.sync(() => (id === folder.id ? Option.some(folder) : Option.none())),
      findByNormalizedName: () => Effect.succeed(Option.none()),
      create: (_userId: UserId, name: string, emoji: string | null, color: string | null) =>
        Effect.succeed(Option.some({
          id: "route-folder-1",
          userId,
          name,
          emoji,
          color,
          isPublished: false,
          createdAt: now,
          updatedAt: now,
        })),
      // Applies only the fields the request carried, the way the repository
      // does, so a name-only caller cannot unpublish a Published Folder.
      update: (_userId: UserId, id: string, changes: {
        readonly name?: string
        readonly emoji?: string | null
        readonly color?: string | null
        readonly isPublished?: boolean
      }) =>
        Effect.sync(() => {
          if (id !== folder.id) return Option.none()
          if (changes.name !== undefined) folder.name = changes.name
          if (changes.emoji !== undefined) folder.emoji = changes.emoji
          if (changes.color !== undefined) folder.color = changes.color
          if (changes.isPublished !== undefined) folder.isPublished = changes.isPublished
          return Option.some(folder)
        }),
      deleteByUserAndId: () => Effect.succeed(true),
    } as never)),
    Layer.succeed(ProfileRepository, ProfileRepository.of({
      findByUser: (profileUserId: UserId) =>
        Effect.sync(() => Option.fromUndefinedOr(profiles.get(profileUserId))),
      findByHandle: (handle: string) =>
        Effect.sync(() => Option.fromUndefinedOr(profileByHandle(handle))),
      claim: (profileUserId: UserId, handle: string) =>
        Effect.sync(() => {
          if (profiles.has(profileUserId) || profileByHandle(handle)) {
            return Option.none()
          }
          const profile = {
            id: "route-profile-1",
            userId: profileUserId,
            handle,
            visibility: "private" as const,
            createdAt: now,
            updatedAt: now,
          }
          profiles.set(profileUserId, profile)
          return Option.some(profile)
        }),
      // Stands in for the unique index as well as the update: another Account
      // holding the Handle reports "taken", the way a lost race does against
      // Postgres, so the route's 409 is exercised without racing.
      renameHandle: (profileUserId: UserId, handle: string) =>
        Effect.sync(() => {
          const profile = profiles.get(profileUserId)
          if (!profile) return { _tag: "no-profile" as const }
          const holder = profileByHandle(handle)
          if (holder && holder.userId !== profileUserId) return { _tag: "taken" as const }
          profile.handle = handle
          return { _tag: "renamed" as const, profile }
        }),
      setVisibility: (profileUserId: UserId, visibility: "private" | "public") =>
        Effect.sync(() => {
          const profile = profiles.get(profileUserId)
          if (!profile) return Option.none()
          profile.visibility = visibility
          return Option.some(profile)
        }),
    } as never)),
    Layer.succeed(PublicProfileRepository, PublicProfileRepository.of({
      findPublicByHandle: (handle: string) =>
        Effect.sync(() => {
          const found = findPublicProfile(handle)
          return found
            ? Option.some({
                handle: found.handle,
                joinedAt: found.joinedAt,
                publicSavedItemCount: found.publicSavedItemCount,
              })
            : Option.none()
        }),
      // The same lookup as above, so a private Handle leaves this without a page
      // too and the route answers both Handles alike.
      listPublicSavedItems: (
        handle: string,
        page: { readonly page: number; readonly pageSize: number },
      ) =>
        Effect.sync(() => {
          const found = findPublicProfile(handle)
          if (!found) return Option.none()
          const savedItems = found.savedItems ?? []
          const start = (page.page - 1) * page.pageSize
          return Option.some({
            savedItems: savedItems.slice(start, start + page.pageSize),
            totalCount: savedItems.length,
          })
        }),
      // Mirrors the repository: the query hands back every public Handle and
      // `isIndexable` decides which of them a search engine may be offered.
      // Which Handles Postgres hands back, and which Saved Item dates each one,
      // is proven in the integration seam.
      listIndexableProfiles: (
        page: { readonly page: number; readonly pageSize: number },
      ) =>
        Effect.sync(() => {
          const indexable = (input.publicProfiles ?? [])
            .filter((profile) => profile.visibility === "public" && isIndexable(profile))
            .map((profile) => ({
              handle: profile.handle,
              lastModifiedAt: profile.lastModifiedAt ?? now,
            }))
          const start = (page.page - 1) * page.pageSize
          return {
            profiles: indexable.slice(start, start + page.pageSize),
            totalCount: indexable.length,
          }
        }),

      // The same lookup again, so Reading Activity cannot disagree with the other
      // two about which Handles exist.
      findReadingActivity: (handle: string) =>
        Effect.sync(() => {
          const found = findPublicProfile(handle)
          return found
            ? Option.some({
                handle: found.handle,
                from: activityWindow.from,
                to: activityWindow.to,
                days: found.readingActivity ?? [],
              })
            : Option.none()
        }),
    } as never)),
    Layer.succeed(PublicProfileRateLimiter, PublicProfileRateLimiter.of({
      check: (key: string) =>
        Effect.sync(() => {
          input.onPublicRateLimit?.(key)
          const allowed = input.publicRateLimitAllowed ?? true
          return {
            allowed,
            limit: PUBLIC_PROFILE_REQUEST_LIMIT,
            remaining: allowed ? PUBLIC_PROFILE_REQUEST_LIMIT - 1 : 0,
            resetSeconds: 42,
          }
        }),
    })),
    Layer.succeed(SavedItemRepository, SavedItemRepository.of({
      findByUserAndId: () => Effect.succeed(Option.none()),
      listByUser: (requestedUserId: UserId) =>
        Effect.succeed(
          requestedUserId === userId
            ? []
            : [],
        ),
      listPageByUser: (_userId: UserId, _limit: number, cursor?: { readonly id: string }) =>
        Effect.succeed(
          input.savedItemsPage && !cursor
            ? {
                items: [makeSavedItem(userId)],
                nextCursor: { lastSavedAt: now, id: savedItemId },
              }
            : { items: [], nextCursor: null },
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
    Layer.succeed(ConnectAuthorizeRateLimiter, ConnectAuthorizeRateLimiter.of({
      check: (key: string) =>
        Effect.sync(() => {
          input.onConnectRateLimit?.({ limiter: "authorize", key })
          return connectLimiterResult
        }),
    })),
    Layer.succeed(ConnectExchangeRateLimiter, ConnectExchangeRateLimiter.of({
      check: (key: string) =>
        Effect.sync(() => {
          input.onConnectRateLimit?.({ limiter: "exchange", key })
          return connectLimiterResult
        }),
    })),
    Layer.succeed(BearerRateLimiter, BearerRateLimiter.of({
      check: () =>
        Effect.succeed({
          allowed: input.bearerAllowed ?? true,
          limit: 120,
          remaining: input.bearerAllowed === false ? 0 : 119,
          resetSeconds: 42,
        }),
    })),
  )
  return Layer.mergeAll(baseLayer, McpTools.layer.pipe(Layer.provide(baseLayer)))
}

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

// A published Saved Item with every allow-listed property filled, so the served
// body can be compared property by property.
const publicSavedItem: PublicSavedItem = {
  originalUrl: "https://example.com/articles/published",
  host: "example.com",
  title: "Published Article",
  faviconUrl: "https://example.com/favicon.ico",
  faviconLightUrl: "https://example.com/favicon-light.png",
  faviconDarkUrl: "https://example.com/favicon-dark.png",
  imageUrl: "https://example.com/cover.png",
  type: "article",
  tags: ["backend"],
  previewSummary: "One sentence a visitor reads before opening the Link.",
  savedAt: now,
}

// The same item without any enrichment, which is what a Basic Link publishes.
const basicPublicSavedItem: PublicSavedItem = {
  originalUrl: "https://example.com/basic",
  host: "example.com",
  type: "website",
  tags: [],
  savedAt: now,
}

// One published Saved Item per index, newest first, so a page can be recognized
// by which items it carries.
const publicSavedItemsPage = (count: number): ReadonlyArray<PublicSavedItem> =>
  Array.from({ length: count }, (_unused, index) => ({
    ...basicPublicSavedItem,
    originalUrl: `https://example.com/published/${index}`,
    savedAt: new Date(now.getTime() - index * 60_000),
  }))

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

const daysInMs = (days: number) => days * 24 * 60 * 60 * 1000

// Everything a client can see of a response, so two answers can be compared for
// being the same bytes rather than merely both being 404.
const snapshot = (response: Response) =>
  Effect.gen(function* () {
    return {
      status: response.status,
      statusText: response.statusText,
      headers: [...response.headers.entries()].sort(),
      body: yield* text(response),
    }
  })

const jsonRequest = (method: string, path: string, body: unknown) =>
  request(path, {
    method,
    headers: { "content-type": "application/json" },
    body: globalThis.JSON.stringify(body),
  })

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

const connectExchangeRequest = (headers: Record<string, string>) =>
  request("/connect/exchange", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({
      client: "raycast",
      code: "connect-code-1",
      codeVerifier: "connect-verifier-1",
    }),
  })

const connectAuthorizeRequest = (headers: Record<string, string>) =>
  request("/connect/authorize", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({
      client: "raycast",
      redirectUri: "https://raycast.com/redirect/extension",
      codeChallenge: "connect-challenge-1",
      codeChallengeMethod: "S256",
      scopes: ["saved-items:capture"],
      label: "Raycast",
    }),
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
      // Publishing is a Folder decision, so no Saved Item route offers an
      // audience flag. The removed per-item route must stay removed.
      expect(body.paths?.["/v1/saved-items/{id}/private"]).toBeUndefined()
      expect(body.paths?.["/v1/folders"]).toBeDefined()
      expect(body.paths?.["/v1/folders/{id}"]).toBeDefined()
      expect(body.paths?.["/v1/profile"]).toBeDefined()
      expect(body.paths?.["/v1/profile/handle"]).toBeDefined()
      expect(body.paths?.["/v1/profile/handle-availability"]).toBeDefined()
      expect(body.paths?.["/v1/profile/visibility"]).toBeDefined()
      expect(body.paths?.["/v1/public/profiles/{handle}"]).toBeDefined()
      expect(body.paths?.["/v1/public/profiles/{handle}/saved-items"]).toBeDefined()
      expect(body.paths?.["/v1/public/profiles/{handle}/activity"]).toBeDefined()
      expect(body.paths?.["/v1/public/indexable-profiles"]).toBeDefined()
      expect(body.paths?.["/connect/authorize"]).toBeDefined()
      expect(body.paths?.["/connect/exchange"]).toBeDefined()
    }),
  )

  it.effect("declares OAuth scopes and least-privilege operation grants in OpenAPI", () =>
    Effect.gen(function* () {
      const response = yield* request("/openapi.json").pipe(
        Effect.provide(routeLayer()),
      )

      const body = yield* json<{
        readonly components: {
          readonly securitySchemes: Record<string, {
            readonly type: string
            readonly flows?: {
              readonly authorizationCode?: {
                readonly authorizationUrl: string
                readonly tokenUrl: string
                readonly scopes: Record<string, string>
              }
            }
          }>
        }
        readonly paths: Record<
          string,
          Record<string, { readonly security?: ReadonlyArray<Record<string, string[]>> }>
        >
      }>(response)

      const oauth = body.components.securitySchemes.oauth2
      expect(oauth?.type).toBe("oauth2")
      expect(oauth?.flows?.authorizationCode?.authorizationUrl).toBe(
        "https://api.sleevy.app/api/auth/oauth2/authorize",
      )
      expect(oauth?.flows?.authorizationCode?.tokenUrl).toBe(
        "https://api.sleevy.app/api/auth/oauth2/token",
      )
      expect(Object.keys(oauth?.flows?.authorizationCode?.scopes ?? {})).toEqual([
        "saved-items:capture",
        "saved-items:read",
        "saved-items:write",
        "saved-items:delete",
        "folders:read",
        "folders:write",
        "folders:delete",
        "account:read",
      ])
      expect(body.paths["/v1/captures"]?.post?.security).toContainEqual({
        oauth2: ["saved-items:capture"],
      })
      expect(body.paths["/v1/saved-items"]?.get?.security).toContainEqual({
        oauth2: ["saved-items:read"],
      })
      expect(body.paths["/v1/saved-items/{id}"]?.delete?.security).toEqual(
        expect.arrayContaining([
          { oauth2: ["saved-items:write"] },
          { oauth2: ["saved-items:delete"] },
        ]),
      )
      expect(body.paths["/v1/folders/{id}"]?.delete?.security).toContainEqual({
        oauth2: ["folders:delete"],
      })
      expect(body.paths["/v1/profile"]?.get?.security).not.toContainEqual({
        oauth2: expect.anything(),
      })
    }),
  )

  it.effect("describes the public profile routes without a security requirement", () =>
    Effect.gen(function* () {
      const response = yield* request("/openapi.json").pipe(
        Effect.provide(routeLayer()),
      )

      const body = yield* json<{
        readonly paths: Record<
          string,
          Record<string, { readonly security?: ReadonlyArray<unknown> }>
        >
      }>(response)

      const publicRoute = body.paths["/v1/public/profiles/{handle}"]?.get
      const publicItemsRoute = body.paths["/v1/public/profiles/{handle}/saved-items"]?.get
      const activityRoute = body.paths["/v1/public/profiles/{handle}/activity"]?.get
      const indexableRoute = body.paths["/v1/public/indexable-profiles"]?.get
      expect(publicRoute).toBeDefined()
      expect(publicItemsRoute).toBeDefined()
      expect(activityRoute).toBeDefined()
      expect(indexableRoute).toBeDefined()
      // No API Key and no App Session: the routes carry no security scheme,
      // unlike every other v1 group.
      // An empty security list is OpenAPI for "no credentials required".
      expect(publicRoute?.security).toEqual([])
      expect(publicItemsRoute?.security).toEqual([])
      expect(activityRoute?.security).toEqual([])
      expect(indexableRoute?.security).toEqual([])
      expect(
        body.paths["/v1/saved-items"]?.get?.security,
      ).toBeDefined()
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
        scopes_supported: [
          "saved-items:capture",
          "saved-items:read",
          "saved-items:write",
          "saved-items:delete",
          "folders:read",
          "folders:write",
          "folders:delete",
          "offline_access",
        ],
      })
    }),
  )

  it.effect("publishes OAuth protected-resource metadata for the API", () =>
    Effect.gen(function* () {
      const response = yield* request("/.well-known/oauth-protected-resource").pipe(
        Effect.provide(routeLayer()),
      )

      expect(response.status).toBe(200)
      expect(response.headers.get("content-type")).toContain("application/json")
      expect(JSON.parse(yield* text(response))).toMatchObject({
        resource: "http://localhost",
        authorization_servers: ["http://localhost/api/auth"],
        scopes_supported: [
          "saved-items:capture",
          "saved-items:read",
          "saved-items:write",
          "saved-items:delete",
          "folders:read",
          "folders:write",
          "folders:delete",
          "account:read",
        ],
      })
    }),
  )

  it.effect("redirects root OAuth discovery to the canonical path-based issuer metadata", () =>
    Effect.gen(function* () {
      const response = yield* request("/.well-known/oauth-authorization-server").pipe(
        Effect.provide(routeLayer()),
      )

      expect(response.status).toBe(308)
      expect(response.headers.get("location")).toBe(
        "http://localhost/.well-known/oauth-authorization-server/api/auth",
      )
      expect(response.headers.get("access-control-allow-origin")).toBe("*")
    }),
  )

  it.effect("returns a structured JSON recovery error for unknown API routes", () =>
    Effect.gen(function* () {
      const response = yield* request("/v1/does-not-exist").pipe(
        Effect.provide(routeLayer()),
      )

      expect(response.status).toBe(404)
      expect(response.headers.get("content-type")).toContain("application/json")
      expect(response.headers.get("cache-control")).toBe("no-store")
      expect(yield* json(response)).toEqual({
        _tag: "RouteNotFound",
        code: "route_not_found",
        message: "No API route matches this request.",
        resolution: "Check https://sleevy.app/openapi.json for supported paths, methods, request fields, and authentication requirements.",
        method: "GET",
        path: "/v1/does-not-exist",
      })
    }),
  )

  it.effect("publishes a cacheable MCP Server Card at the canonical and compatibility paths", () =>
    Effect.gen(function* () {
      for (const path of [
        "/mcp/server-card",
        "/.well-known/mcp-server-card",
        "/.well-known/mcp/server-card.json",
      ]) {
        const response = yield* request(path).pipe(Effect.provide(routeLayer()))

        expect(response.status).toBe(200)
        expect(response.headers.get("content-type")).toBe(
          "application/mcp-server-card+json; charset=utf-8",
        )
        expect(response.headers.get("access-control-allow-origin")).toBe("*")
        expect(response.headers.get("access-control-allow-headers")).toBe(
          "Content-Type, If-None-Match",
        )
        expect(response.headers.get("access-control-expose-headers")).toBe("ETag")
        expect(response.headers.get("cache-control")).toBe("public, max-age=3600")
        expect(response.headers.get("etag")).toMatch(/^W\/\"[a-f0-9]+\"$/)

        const card = JSON.parse(yield* text(response))
        expect(card.$schema).toBe(
          "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json",
        )
        expect(card.name).toBe("app.sleevy/mcp")
        expect(card.version).toBe("1.0.0")
        expect(typeof card.description).toBe("string")
        expect(card.remotes).toEqual([
          {
            type: "streamable-http",
            url: "http://localhost/mcp",
            supportedProtocolVersions: SUPPORTED_PROTOCOL_VERSIONS,
          },
        ])
        // Auth is discovered via oauth-protected-resource, not the card.
        expect(card.authentication).toBeUndefined()
      }

      const initial = yield* request("/mcp/server-card").pipe(Effect.provide(routeLayer()))
      const cached = yield* request("/mcp/server-card", {
        headers: { "If-None-Match": initial.headers.get("etag") ?? "" },
      }).pipe(Effect.provide(routeLayer()))

      expect(cached.status).toBe(304)
      expect(yield* text(cached)).toBe("")
      expect(cached.headers.get("etag")).toBe(initial.headers.get("etag"))

      const head = yield* request("/mcp/server-card", { method: "HEAD" }).pipe(
        Effect.provide(routeLayer()),
      )
      const preflight = yield* request("/mcp/server-card", { method: "OPTIONS" }).pipe(
        Effect.provide(routeLayer()),
      )
      const unsupported = yield* request("/mcp/server-card", { method: "POST" }).pipe(
        Effect.provide(routeLayer()),
      )

      expect(head.status).toBe(200)
      expect(yield* text(head)).toBe("")
      expect(preflight.status).toBe(204)
      expect(unsupported.status).toBe(405)
      expect(unsupported.headers.get("allow")).toBe("GET, HEAD, OPTIONS")
      expect(yield* json(unsupported)).toMatchObject({
        code: "method_not_allowed",
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
        result: { serverInfo: { name: "app.sleevy/mcp", version: "1.0.0" } },
      })
    }),
  )

  it.effect("rate limits MCP requests authenticated with an API key", () =>
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
      ).pipe(Effect.provide(routeLayer({ apiKeyAllowed: false })))

      expect(response.status).toBe(429)
      expect(response.headers.get("retry-after")).toBe("42")
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
      const body = JSON.parse(yield* text(response)) as {
        readonly result: {
          readonly content: ReadonlyArray<{ readonly text: string }>
          readonly structuredContent: unknown
        }
      }
      expect(body).toMatchObject({
        jsonrpc: "2.0",
        id: 3,
        result: {
          structuredContent: { items: [], nextCursor: null },
        },
      })
      expect(JSON.parse(body.result.content[0]!.text)).toEqual(body.result.structuredContent)
    }),
  )

  it.effect("pages saved items through MCP with an opaque cursor", () =>
    Effect.gen(function* () {
      const layer = routeLayer({ savedItemsPage: true })
      const first = yield* mcpRequest(
        {
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name: "list_saved_items", arguments: { limit: 1 } },
        },
        { credentials: true, protocolVersion: "2025-06-18" },
      ).pipe(Effect.provide(layer))

      const firstBody = JSON.parse(yield* text(first)) as {
        readonly result: {
          readonly content: ReadonlyArray<{ readonly text: string }>
          readonly structuredContent: {
            readonly items: ReadonlyArray<unknown>
            readonly nextCursor: string | null
          }
        }
      }
      const page = firstBody.result.structuredContent
      expect(page.items).toEqual([
        {
          id: savedItemId,
          title: "Route Test",
          url: "https://example.com/articles/route-test",
          folder: null,
          isRead: false,
          tags: ["backend"],
          savedAt: now.toISOString(),
        },
      ])
      expect(typeof page.nextCursor).toBe("string")
      expect(JSON.parse(firstBody.result.content[0]!.text)).toEqual(page)

      const second = yield* mcpRequest(
        {
          jsonrpc: "2.0",
          id: 4,
          method: "tools/call",
          params: { name: "list_saved_items", arguments: { cursor: page.nextCursor } },
        },
        { credentials: true, protocolVersion: "2025-06-18" },
      ).pipe(Effect.provide(layer))

      expect(JSON.parse(yield* text(second))).toMatchObject({
        result: { structuredContent: { items: [], nextCursor: null } },
      })
    }),
  )

  it.effect("rejects an invalid saved items pagination cursor", () =>
    Effect.gen(function* () {
      const response = yield* mcpRequest(
        {
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name: "list_saved_items", arguments: { cursor: "not-a-cursor" } },
        },
        { credentials: true, protocolVersion: "2025-06-18" },
      ).pipe(Effect.provide(routeLayer()))

      expect(JSON.parse(yield* text(response))).toMatchObject({
        result: {
          content: [{ type: "text", text: "Invalid pagination cursor." }],
          isError: true,
        },
      })
    }),
  )

  it.effect("offers and runs save_link with only the capture scope", () => {
    let capturedUrl: string | undefined
    let capturedChannel: CaptureChannel | undefined

    return Effect.gen(function* () {
      const layer = routeLayer({
        apiKeyPermissions: { "saved-items": ["capture"] },
        onCapture: ({ url, captureChannel }) => {
          capturedUrl = url
          capturedChannel = captureChannel
        },
      })
      const tools = yield* mcpRequest(
        { jsonrpc: "2.0", id: 4, method: "tools/list", params: {} },
        { credentials: true, protocolVersion: "2025-06-18" },
      ).pipe(Effect.provide(layer))

      expect(JSON.parse(yield* text(tools))).toMatchObject({
        result: { tools: [{ name: "save_link" }] },
      })

      const saved = yield* mcpRequest(
        {
          jsonrpc: "2.0",
          id: 5,
          method: "tools/call",
          params: { name: "save_link", arguments: { url: "https://example.com/mcp" } },
        },
        { credentials: true, protocolVersion: "2025-06-18" },
      ).pipe(Effect.provide(layer))

      expect(saved.status).toBe(200)
      expect(capturedUrl).toBe("https://example.com/mcp")
      expect(capturedChannel).toBe("api")
    })
  })

  it.effect("advertises only tools allowed by the granted scopes", () =>
    Effect.gen(function* () {
      const response = yield* mcpRequest(
        { jsonrpc: "2.0", id: 6, method: "tools/list", params: {} },
        { credentials: true, protocolVersion: "2025-06-18" },
      ).pipe(Effect.provide(routeLayer({
        apiKeyPermissions: {
          "saved-items": ["capture", "read", "write", "delete"],
          folders: ["read", "write", "delete"],
        },
      })))

      const body = JSON.parse(yield* text(response)) as {
        readonly result: { readonly tools: ReadonlyArray<{ readonly name: string }> }
      }
      expect(body.result.tools.map((tool) => tool.name)).toEqual([
        "list_saved_items",
        "save_link",
        "set_saved_item_read_state",
        "set_saved_item_folder",
        "delete_saved_item",
        "list_folders",
        "add_folder",
        "remove_folder",
      ])
    }),
  )

  it.effect("adds and removes folders with their respective scopes", () =>
    Effect.gen(function* () {
      const layer = routeLayer({ apiKeyPermissions: { folders: ["write", "delete"] } })
      const added = yield* mcpRequest(
        {
          jsonrpc: "2.0",
          id: 7,
          method: "tools/call",
          params: { name: "add_folder", arguments: { name: "Research", emoji: "🔬" } },
        },
        { credentials: true, protocolVersion: "2025-06-18" },
      ).pipe(Effect.provide(layer))

      expect(JSON.parse(yield* text(added))).toMatchObject({
        result: { content: [{ text: expect.stringContaining('"name": "Research"') }] },
      })

      const removed = yield* mcpRequest(
        {
          jsonrpc: "2.0",
          id: 8,
          method: "tools/call",
          params: { name: "remove_folder", arguments: { folderId: "route-folder-1" } },
        },
        { credentials: true, protocolVersion: "2025-06-18" },
      ).pipe(Effect.provide(layer))

      expect(JSON.parse(yield* text(removed))).toMatchObject({
        result: { content: [{ text: expect.stringContaining('"deleted": true') }] },
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

  // A capture cannot publish or withhold anything, because publishing is a
  // Folder decision. Neither the request nor the response carries an audience
  // flag, and this test fails if one comes back.
  it.effect("captures a Saved Item without any audience flag", () =>
    Effect.gen(function* () {
      const response = yield* jsonRequest("POST", "/v1/captures", {
        url: "https://example.com/articles/route-test",
      }).pipe(Effect.provide(routeLayer({ sessionUserId: userId })))

      expect(response.status).toBe(201)
      const body = yield* json<{ readonly savedItem: Record<string, unknown> }>(response)
      const audienceKeys = Object.keys(body.savedItem).filter((key) =>
        /private|public|publish|visib/i.test(key),
      )
      expect(audienceKeys).toEqual([])
    }),
  )

  // The per-item route is gone, so the path is no longer routed at all.
  it.effect("no longer answers the removed per-item privacy route", () =>
    Effect.gen(function* () {
      const response = yield* jsonRequest(
        "PUT",
        `/v1/saved-items/${savedItemId}/private`,
        { isPrivate: true },
      ).pipe(Effect.provide(routeLayer({ sessionUserId: userId })))

      expect(response.status).toBe(404)
    }),
  )

  it.effect("refuses the folder action without the saved-items write scope", () =>
    Effect.gen(function* () {
      const response = yield* request(`/v1/saved-items/${savedItemId}/folder`, {
        method: "PUT",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: globalThis.JSON.stringify({ folderId: null }),
      }).pipe(
        Effect.provide(routeLayer({ apiKeyPermissions: { "saved-items": ["read"] } })),
      )

      expect(response.status).toBe(401)
      expect(yield* json<{ readonly message: string }>(response)).toMatchObject({
        message: "Missing required scope: saved-items:write.",
      })
    }),
  )

  it.effect("publishes a Folder through the widened update", () =>
    Effect.gen(function* () {
      const layer = routeLayer({ sessionUserId: userId })

      const published = yield* jsonRequest("PATCH", "/v1/folders/route-folder-1", {
        isPublished: true,
      }).pipe(Effect.provide(layer))

      expect(published.status).toBe(200)
      expect(yield* json<{ readonly name: string; readonly isPublished: boolean }>(published))
        .toMatchObject({ name: "Research", isPublished: true })

      // A name-only caller keeps working and leaves the Folder published, so a
      // rename cannot silently withdraw a page.
      const renamed = yield* jsonRequest("PATCH", "/v1/folders/route-folder-1", {
        name: "Reading",
      }).pipe(Effect.provide(layer))

      expect(renamed.status).toBe(200)
      expect(yield* json<{ readonly name: string; readonly isPublished: boolean }>(renamed))
        .toMatchObject({ name: "Reading", isPublished: true })

      // And unpublishing takes effect at once, with no delay in between.
      const withdrawn = yield* jsonRequest("PATCH", "/v1/folders/route-folder-1", {
        isPublished: false,
      }).pipe(Effect.provide(layer))

      expect(withdrawn.status).toBe(200)
      expect(yield* json<{ readonly isPublished: boolean }>(withdrawn))
        .toMatchObject({ isPublished: false })
    }),
  )

  it.effect("rejects an empty Folder name on the widened update", () =>
    Effect.gen(function* () {
      const response = yield* jsonRequest("PATCH", "/v1/folders/route-folder-1", {
        name: "   ",
      }).pipe(Effect.provide(routeLayer({ sessionUserId: userId })))

      expect(response.status).toBe(400)
      expect(yield* json<{ readonly _tag: string }>(response)).toMatchObject({
        _tag: "InvalidFolderNameError",
      })
    }),
  )

  it.effect("posts a capture through the public-profile Capture Channel", () => {
    let seenChannel: CaptureChannel | undefined

    return Effect.gen(function* () {
      const response = yield* jsonRequest("POST", "/v1/captures", {
        url: "https://example.com/articles/route-test",
        captureChannel: "public-profile",
      }).pipe(
        Effect.provide(routeLayer({
          sessionUserId: userId,
          onCapture: (captureInput) => {
            seenChannel = captureInput.captureChannel
          },
        })),
      )

      expect(response.status).toBe(201)
      expect(seenChannel).toBe("public-profile")

      const body = yield* json<{
        readonly savedItem: { readonly captureChannel?: string }
      }>(response)

      expect(body.savedItem.captureChannel).toBe("public-profile")
    })
  })

  it.effect("posts captures from every Capture Channel", () => {
    const seenChannels: Array<CaptureChannel | undefined> = []

    return Effect.gen(function* () {
      const layer = routeLayer({
        sessionUserId: userId,
        onCapture: (captureInput) => {
          seenChannels.push(captureInput.captureChannel)
        },
      })

      for (const captureChannel of captureChannels) {
        const response = yield* request("/v1/captures", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: globalThis.JSON.stringify({
            url: "https://example.com/articles/route-test",
            captureChannel,
          }),
        }).pipe(Effect.provide(layer))

        expect(response.status).toBe(201)

        const body = yield* json<{
          readonly savedItem: { readonly captureChannel?: string }
        }>(response)

        expect(body.savedItem.captureChannel).toBe(captureChannel)
      }

      expect(seenChannels).toEqual([...captureChannels])
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

  it.effect("limits connect exchange on the Cloudflare connecting IP", () => {
    let seen: { readonly limiter: string; readonly key: string } | undefined

    return Effect.gen(function* () {
      const response = yield* connectExchangeRequest({
        "CF-Connecting-IP": "198.51.100.9",
        "X-Forwarded-For": "203.0.113.7, 70.41.3.18",
      }).pipe(
        Effect.provide(routeLayer({
          onConnectRateLimit: (limit) => {
            seen = limit
          },
        })),
      )

      expect(response.status).toBe(429)
      expect(seen).toEqual({ limiter: "exchange", key: "198.51.100.9" })
    })
  })

  it.effect("limits connect exchange on the first forwarded-for entry", () => {
    let seen: { readonly limiter: string; readonly key: string } | undefined

    return Effect.gen(function* () {
      yield* connectExchangeRequest({
        "x-forwarded-for": "203.0.113.7, 70.41.3.18",
      }).pipe(
        Effect.provide(routeLayer({
          onConnectRateLimit: (limit) => {
            seen = limit
          },
        })),
      )

      expect(seen).toEqual({ limiter: "exchange", key: "203.0.113.7" })
    })
  })

  it.effect("limits connect exchange on a stable key without address headers", () => {
    let seen: { readonly limiter: string; readonly key: string } | undefined

    return Effect.gen(function* () {
      const response = yield* connectExchangeRequest({}).pipe(
        Effect.provide(routeLayer({
          onConnectRateLimit: (limit) => {
            seen = limit
          },
        })),
      )

      expect(response.status).toBe(429)
      expect(seen).toEqual({ limiter: "exchange", key: "unknown" })
    })
  })

  it.effect("limits connect authorize on the Account, not on the address", () => {
    let seen: { readonly limiter: string; readonly key: string } | undefined

    return Effect.gen(function* () {
      const response = yield* connectAuthorizeRequest({
        "cf-connecting-ip": "198.51.100.9",
        "x-forwarded-for": "203.0.113.7",
      }).pipe(
        Effect.provide(routeLayer({
          sessionUserId: userId,
          onConnectRateLimit: (limit) => {
            seen = limit
          },
        })),
      )

      expect(response.status).toBe(429)
      expect(seen).toEqual({ limiter: "authorize", key: userId })
    })
  })

  it.effect("claims a Handle and reads it back with Profile Visibility private", () =>
    Effect.gen(function* () {
      const layer = routeLayer({ sessionUserId: userId })

      const claimed = yield* jsonRequest("POST", "/v1/profile/handle", {
        handle: "Reader_One",
      }).pipe(Effect.provide(layer))

      expect(claimed.status).toBe(200)
      expect(yield* json<{ handle: string; visibility: string }>(claimed)).toMatchObject({
        handle: "reader_one",
        visibility: "private",
      })

      const read = yield* request("/v1/profile").pipe(Effect.provide(layer))

      expect(read.status).toBe(200)
      expect(yield* json<{ handle: string; visibility: string }>(read)).toMatchObject({
        handle: "reader_one",
        visibility: "private",
      })
    }),
  )

  it.effect("returns not found before an Account claims a Handle", () =>
    Effect.gen(function* () {
      const response = yield* request("/v1/profile").pipe(
        Effect.provide(routeLayer({ sessionUserId: userId })),
      )

      expect(response.status).toBe(404)
      expect(yield* json<{ _tag: string }>(response)).toMatchObject({
        _tag: "ProfileNotFoundError",
      })
    }),
  )

  it.effect("rejects Handles outside the allowed length and character set", () =>
    Effect.gen(function* () {
      for (const handle of ["ab", "a".repeat(31), "reader one", "reader.one", "réader"]) {
        const response = yield* jsonRequest("POST", "/v1/profile/handle", {
          handle,
        }).pipe(Effect.provide(routeLayer({ sessionUserId: userId })))

        expect(response.status).toBe(400)
        expect(yield* json<{ _tag: string }>(response)).toMatchObject({
          _tag: "InvalidHandleError",
        })
      }
    }),
  )

  it.effect("rejects reserved Handles", () =>
    Effect.gen(function* () {
      for (const handle of RESERVED_HANDLES) {
        const response = yield* jsonRequest("POST", "/v1/profile/handle", {
          handle,
        }).pipe(Effect.provide(routeLayer({ sessionUserId: userId })))

        expect(response.status).toBe(400)
      }
    }),
  )

  it.effect("refuses a Handle another Account holds in a different case", () =>
    Effect.gen(function* () {
      const response = yield* jsonRequest("POST", "/v1/profile/handle", {
        handle: "ReaderOne",
      }).pipe(Effect.provide(routeLayer({
        sessionUserId: userId,
        claimedHandle: { userId: otherUserId, handle: "readerone" },
      })))

      expect(response.status).toBe(409)
      expect(yield* json<{ _tag: string }>(response)).toMatchObject({
        _tag: "HandleConflictError",
      })
    }),
  )

  it.effect("reports whether a Handle is available before it is claimed", () =>
    Effect.gen(function* () {
      const layer = routeLayer({
        sessionUserId: userId,
        claimedHandle: { userId: otherUserId, handle: "readerone" },
      })

      const taken = yield* request(
        "/v1/profile/handle-availability?handle=ReaderOne",
      ).pipe(Effect.provide(layer))

      expect(taken.status).toBe(200)
      expect(yield* json(taken)).toEqual({ handle: "readerone", available: false })

      const free = yield* request(
        "/v1/profile/handle-availability?handle=reader-two",
      ).pipe(Effect.provide(layer))

      expect(yield* json(free)).toEqual({ handle: "reader-two", available: true })
    }),
  )

  it.effect("renames a claimed Handle", () =>
    Effect.gen(function* () {
      const layer = routeLayer({
        sessionUserId: userId,
        claimedHandle: { userId, handle: "readerone" },
      })

      const renamed = yield* jsonRequest("PATCH", "/v1/profile/handle", {
        handle: "Reader-Two",
      }).pipe(Effect.provide(layer))

      expect(renamed.status).toBe(200)
      expect(yield* json<{ handle: string }>(renamed)).toMatchObject({
        handle: "reader-two",
      })
    }),
  )

  it.effect("keeps the Handle claimed when Profile Visibility goes off again", () =>
    Effect.gen(function* () {
      const layer = routeLayer({
        sessionUserId: userId,
        claimedHandle: { userId, handle: "readerone" },
      })

      const published = yield* jsonRequest("PUT", "/v1/profile/visibility", {
        visibility: "public",
      }).pipe(Effect.provide(layer))

      expect(published.status).toBe(200)
      expect(yield* json<{ visibility: string }>(published)).toMatchObject({
        visibility: "public",
      })

      const hidden = yield* jsonRequest("PUT", "/v1/profile/visibility", {
        visibility: "private",
      }).pipe(Effect.provide(layer))

      expect(yield* json<{ handle: string; visibility: string }>(hidden)).toMatchObject({
        handle: "readerone",
        visibility: "private",
      })

      const read = yield* request("/v1/profile").pipe(Effect.provide(layer))

      expect(yield* json<{ handle: string; visibility: string }>(read)).toMatchObject({
        handle: "readerone",
        visibility: "private",
      })
    }),
  )

  it.effect("requires a session for profile routes", () =>
    Effect.gen(function* () {
      const response = yield* request("/v1/profile").pipe(
        Effect.provide(routeLayer()),
      )

      expect(response.status).toBe(401)
      expect(yield* json(response)).toEqual({
        _tag: "Unauthorized",
        message: "Sign in required.",
      })
    }),
  )

  it.effect("serves a Public Profile to an anonymous visitor", () =>
    Effect.gen(function* () {
      const joinedAt = new Date(Date.now() - daysInMs(30))
      const response = yield* request("/v1/public/profiles/ReaderOne").pipe(
        Effect.provide(routeLayer({
          publicProfiles: [{
            handle: "readerone",
            visibility: "public",
            joinedAt,
            publicSavedItemCount: 12,
          }],
        })),
      )

      // No credentials were sent and none were needed.
      expect(response.status).toBe(200)
      expect(yield* json(response)).toEqual({
        handle: "readerone",
        joinedAt: joinedAt.toISOString(),
        publicSavedItemCount: 12,
        isIndexable: true,
      })
      expect(response.headers.get("cache-control")).toBe("public, max-age=300")
      expect(response.headers.get("ratelimit-limit")).toBe(
        String(PUBLIC_PROFILE_REQUEST_LIMIT),
      )
    }),
  )

  it.effect("answers an unknown Handle and a private one with the same response", () =>
    Effect.gen(function* () {
      const layer = routeLayer({
        publicProfiles: [{
          handle: "hidden",
          visibility: "private",
          joinedAt: new Date(Date.now() - daysInMs(400)),
          publicSavedItemCount: 99,
        }],
      })

      const privateHandle = yield* snapshot(
        yield* request("/v1/public/profiles/hidden").pipe(Effect.provide(layer)),
      )
      const unknownHandle = yield* snapshot(
        yield* request("/v1/public/profiles/nobody-holds-this").pipe(
          Effect.provide(layer),
        ),
      )

      expect(privateHandle.status).toBe(404)
      // Status line, headers, and body are the same bytes, so the response
      // never discloses that the Handle "hidden" is claimed.
      expect(unknownHandle).toEqual(privateHandle)
      expect(privateHandle.body).toBe(
        '{"_tag":"PublicProfileNotFoundError","message":"No Public Profile exists for this Handle."}',
      )
    }),
  )

  it.effect("gives a Handle no Account may ever hold the same not-found response", () =>
    Effect.gen(function* () {
      const layer = routeLayer()

      const unusable = yield* snapshot(
        // Too short for a Handle, so no Account can ever hold it.
        yield* request("/v1/public/profiles/ab").pipe(Effect.provide(layer)),
      )
      const unknown = yield* snapshot(
        yield* request("/v1/public/profiles/nobody-holds-this").pipe(
          Effect.provide(layer),
        ),
      )

      expect(unusable.status).toBe(404)
      expect(unusable).toEqual(unknown)
    }),
  )

  it.effect("serves Reading Activity to an anonymous visitor", () =>
    Effect.gen(function* () {
      const response = yield* request("/v1/public/profiles/ReaderOne/activity").pipe(
        Effect.provide(routeLayer({
          publicProfiles: [{
            handle: "readerone",
            visibility: "public",
            joinedAt: new Date(Date.now() - daysInMs(30)),
            publicSavedItemCount: 12,
            readingActivity: [
              { date: "2026-05-17", count: 3 },
              { date: "2026-05-19", count: 1 },
            ],
          }],
        })),
      )

      // No credentials were sent and none were needed.
      expect(response.status).toBe(200)
      expect(yield* json(response)).toEqual({
        handle: "readerone",
        from: activityWindow.from,
        to: activityWindow.to,
        days: [
          { date: "2026-05-17", count: 3 },
          { date: "2026-05-19", count: 1 },
        ],
      })
      expect(response.headers.get("cache-control")).toBe("public, max-age=300")
      expect(response.headers.get("ratelimit-limit")).toBe(
        String(PUBLIC_PROFILE_REQUEST_LIMIT),
      )
    }),
  )

  it.effect("serves the window with no days for an Account that saved nothing", () =>
    Effect.gen(function* () {
      const response = yield* request("/v1/public/profiles/readerone/activity").pipe(
        Effect.provide(routeLayer({
          publicProfiles: [{
            handle: "readerone",
            visibility: "public",
            joinedAt: new Date(Date.now() - daysInMs(2)),
            publicSavedItemCount: 0,
          }],
        })),
      )

      // An empty grid, not a not-found: the Handle resolves and the window is
      // still what the page draws.
      expect(response.status).toBe(200)
      expect(yield* json(response)).toEqual({
        handle: "readerone",
        from: activityWindow.from,
        to: activityWindow.to,
        days: [],
      })
    }),
  )

  it.effect("answers an unknown Handle and a private one alike for Reading Activity", () =>
    Effect.gen(function* () {
      const layer = routeLayer({
        publicProfiles: [{
          handle: "hidden",
          visibility: "private",
          joinedAt: new Date(Date.now() - daysInMs(400)),
          publicSavedItemCount: 99,
          readingActivity: [{ date: "2026-05-19", count: 7 }],
        }],
      })

      const privateHandle = yield* snapshot(
        yield* request("/v1/public/profiles/hidden/activity").pipe(Effect.provide(layer)),
      )
      const unknownHandle = yield* snapshot(
        yield* request("/v1/public/profiles/nobody-holds-this/activity").pipe(
          Effect.provide(layer),
        ),
      )
      const profileRoute = yield* snapshot(
        yield* request("/v1/public/profiles/hidden").pipe(Effect.provide(layer)),
      )

      expect(privateHandle.status).toBe(404)
      expect(unknownHandle).toEqual(privateHandle)
      // The same error as the profile route, down to the bytes: the group has one
      // not-found answer, not one per endpoint.
      expect(privateHandle).toEqual(profileRoute)
      expect(privateHandle.body).toBe(
        '{"_tag":"PublicProfileNotFoundError","message":"No Public Profile exists for this Handle."}',
      )
    }),
  )

  it.effect("marks a Public Profile indexable only at 7 days and 5 public Saved Items", () =>
    Effect.gen(function* () {
      const cases = [
        { handle: "old-and-full", days: 30, count: 12, isIndexable: true },
        { handle: "just-past-both", days: 7, count: 5, isIndexable: true },
        { handle: "too-few-items", days: 30, count: 4, isIndexable: false },
        { handle: "too-young", days: 6, count: 12, isIndexable: false },
        { handle: "young-and-empty", days: 6, count: 4, isIndexable: false },
      ] as const

      const layer = routeLayer({
        publicProfiles: cases.map((profile) => ({
          handle: profile.handle,
          visibility: "public" as const,
          // A second past the boundary, so the comparison itself is tested
          // rather than the clock ticking during the request.
          joinedAt: new Date(Date.now() - daysInMs(profile.days) - 1_000),
          publicSavedItemCount: profile.count,
        })),
      })

      for (const { handle, isIndexable } of cases) {
        const response = yield* request(`/v1/public/profiles/${handle}`).pipe(
          Effect.provide(layer),
        )

        expect(response.status).toBe(200)
        expect(yield* json<{ readonly isIndexable: boolean }>(response))
          .toMatchObject({ handle, isIndexable })
      }
    }),
  )

  it.effect("limits the public group on the Cloudflare connecting IP", () => {
    let seen: string | undefined

    return Effect.gen(function* () {
      const response = yield* request("/v1/public/profiles/readerone", {
        headers: {
          "CF-Connecting-IP": "198.51.100.9",
          "X-Forwarded-For": "203.0.113.7, 70.41.3.18",
        },
      }).pipe(
        Effect.provide(routeLayer({
          publicRateLimitAllowed: false,
          onPublicRateLimit: (key) => {
            seen = key
          },
        })),
      )

      expect(seen).toBe("198.51.100.9")
      expect(response.status).toBe(429)
      expect(response.headers.get("retry-after")).toBe("42")
      expect(response.headers.get("ratelimit-limit")).toBe(
        String(PUBLIC_PROFILE_REQUEST_LIMIT),
      )
      expect(yield* json(response)).toEqual({
        _tag: "RateLimitExceeded",
        message: "Public profile rate limit exceeded.",
      })
    })
  })

  // The web app renders a Public Profile page on its server, so the request the
  // API sees comes from the web container rather than from the visitor. It
  // passes the visitor address on as CF-Connecting-IP, which the resolver
  // already reads, and that is what keeps one bucket per visitor. A caller that
  // names no address is the case that used to describe every rendered page.
  it.effect("gives a forwarded visitor address its own budget, and only an unnamed caller the shared one", () => {
    const seen: string[] = []

    return Effect.gen(function* () {
      const layer = routeLayer({
        onPublicRateLimit: (key) => {
          seen.push(key)
        },
      })

      yield* request("/v1/public/profiles/readerone", {
        headers: { "CF-Connecting-IP": "198.51.100.9" },
      }).pipe(Effect.provide(layer))
      yield* request("/v1/public/profiles/readerone", {
        headers: { "CF-Connecting-IP": "203.0.113.7" },
      }).pipe(Effect.provide(layer))
      yield* request("/v1/public/profiles/readerone").pipe(Effect.provide(layer))

      expect(seen).toEqual(["198.51.100.9", "203.0.113.7", "unknown"])
    })
  })

  // A visitor who opens a page must get the page. The render that serves it is
  // the web server, not a third party, so it takes no budget at all — and one
  // page view costs three reads of this group, so a counted render would refuse
  // pages to readers who did nothing wrong.
  it.effect("leaves a Server-Side Render out of the Public Profile Rate Limit", () => {
    const seen: string[] = []

    return Effect.gen(function* () {
      const layer = routeLayer({
        onPublicRateLimit: (key) => {
          seen.push(key)
        },
        publicProfiles: [{
          handle: "readerone",
          visibility: "public",
          joinedAt: new Date(Date.now() - daysInMs(30)),
          publicSavedItemCount: 0,
          savedItems: [],
        }],
      })

      const response = yield* request("/v1/public/profiles/readerone", {
        headers: {
          "X-Sleevy-Render": RENDER_TOKEN,
          "CF-Connecting-IP": "198.51.100.9",
        },
      }).pipe(Effect.provide(layer))

      expect(response.status).toBe(200)

      // Nothing was counted, and there is no budget to report on.
      expect(seen).toEqual([])
      expect(response.headers.get("ratelimit-limit")).toBeNull()
      // The response is still cacheable: the edge cache on the page is what
      // bounds the render path.
      expect(response.headers.get("cache-control")).toBe("public, max-age=300")
    })
  })

  // The exemption is a shared secret, so stating the header is not enough.
  it.effect("treats a wrong Render Token as a public API client", () => {
    const seen: string[] = []

    return Effect.gen(function* () {
      const layer = routeLayer({
        onPublicRateLimit: (key) => {
          seen.push(key)
        },
      })

      yield* request("/v1/public/profiles/readerone", {
        headers: {
          "X-Sleevy-Render": "guessed",
          "CF-Connecting-IP": "198.51.100.9",
        },
      }).pipe(Effect.provide(layer))

      expect(seen).toEqual(["198.51.100.9"])
    })
  })

  it.effect("serves one page of public Saved Items to an anonymous visitor", () =>
    Effect.gen(function* () {
      const response = yield* request("/v1/public/profiles/ReaderOne/saved-items").pipe(
        Effect.provide(routeLayer({
          publicProfiles: [{
            handle: "readerone",
            visibility: "public",
            joinedAt: new Date(Date.now() - daysInMs(30)),
            publicSavedItemCount: 2,
            savedItems: [publicSavedItem, basicPublicSavedItem],
          }],
        })),
      )

      // No credentials were sent and none were needed.
      expect(response.status).toBe(200)
      // Read loosely on purpose: a Link without that piece of Saved Metadata
      // publishes the property as null, the way the private Saved Item
      // representation already serves one.
      const body = yield* json<{
        readonly savedItems: ReadonlyArray<Record<string, unknown>>
        readonly page: number
        readonly pageSize: number
        readonly totalPages: number
      }>(response)
      expect(body).toEqual({
        savedItems: [
          {
            originalUrl: "https://example.com/articles/published",
            host: "example.com",
            title: "Published Article",
            faviconUrl: "https://example.com/favicon.ico",
            faviconLightUrl: "https://example.com/favicon-light.png",
            faviconDarkUrl: "https://example.com/favicon-dark.png",
            imageUrl: "https://example.com/cover.png",
            authorName: null,
            authorHandle: null,
            authorAvatarUrl: null,
            type: "article",
            tags: ["backend"],
            previewSummary: "One sentence a visitor reads before opening the Link.",
            savedAt: now.toISOString(),
          },
          {
            originalUrl: "https://example.com/basic",
            host: "example.com",
            title: null,
            faviconUrl: null,
            faviconLightUrl: null,
            faviconDarkUrl: null,
            imageUrl: null,
            authorName: null,
            authorHandle: null,
            authorAvatarUrl: null,
            type: "website",
            tags: [],
            previewSummary: null,
            savedAt: now.toISOString(),
          },
        ],
        page: 1,
        pageSize: PUBLIC_SAVED_ITEMS_PAGE_SIZE,
        totalPages: 1,
      })
      // What a visitor receives carries the allow-list and nothing beside it.
      // A Basic Link, which has no enrichment yet, carries the same properties
      // with an empty value rather than a different shape.
      const publishedProperties = [
        "authorAvatarUrl",
        "authorHandle",
        "authorName",
        "faviconDarkUrl",
        "faviconLightUrl",
        "faviconUrl",
        "host",
        "imageUrl",
        "originalUrl",
        "previewSummary",
        "savedAt",
        "tags",
        "title",
        "type",
      ]
      expect(Object.keys(body.savedItems[0] ?? {}).sort()).toEqual(publishedProperties)
      expect(Object.keys(body.savedItems[1] ?? {}).sort()).toEqual(publishedProperties)
      expect(response.headers.get("cache-control")).toBe("public, max-age=300")
      expect(response.headers.get("ratelimit-limit")).toBe(
        String(PUBLIC_PROFILE_REQUEST_LIMIT),
      )
    }),
  )

  it.effect("addresses public Saved Items by page number, 50 to a page", () =>
    Effect.gen(function* () {
      // One layer for the whole test: inside a single test the first layer built
      // wins for every later provide, so the cases share it and differ by the
      // page they ask for.
      const layer = routeLayer({
        publicProfiles: [{
          handle: "readerone",
          visibility: "public",
          joinedAt: new Date(Date.now() - daysInMs(30)),
          publicSavedItemCount: 120,
          savedItems: publicSavedItemsPage(120),
        }],
      })

      const pageAt = (query: string) =>
        Effect.gen(function* () {
          const response = yield* request(
            `/v1/public/profiles/readerone/saved-items${query}`,
          ).pipe(Effect.provide(layer))
          expect(response.status).toBe(200)
          return yield* json<PublicSavedItemsResponse.Encoded>(response)
        })

      const first = yield* pageAt("")
      const second = yield* pageAt("?page=2")
      const third = yield* pageAt("?page=3")
      const past = yield* pageAt("?page=4")

      // 120 published items fill two whole pages and a third that is short.
      expect([
        first.savedItems.length,
        second.savedItems.length,
        third.savedItems.length,
        past.savedItems.length,
      ]).toEqual([50, 50, 20, 0])
      expect([first.page, second.page, third.page, past.page]).toEqual([1, 2, 3, 4])
      expect([first.totalPages, second.totalPages, past.totalPages]).toEqual([3, 3, 3])

      // Each numbered page is a different window over the same order, so no
      // item appears twice and none is skipped between pages.
      expect(first.savedItems[0]?.originalUrl).toBe("https://example.com/published/0")
      expect(first.savedItems.at(-1)?.originalUrl).toBe("https://example.com/published/49")
      expect(second.savedItems[0]?.originalUrl).toBe("https://example.com/published/50")
      expect(third.savedItems.at(-1)?.originalUrl).toBe("https://example.com/published/119")

      // Page numbers a visitor typed by hand still answer with a page: anything
      // below the first page reads as the first, and a fraction reads as the
      // page it falls inside.
      const beforeFirst = yield* pageAt("?page=0")
      const negative = yield* pageAt("?page=-7")
      const fractional = yield* pageAt("?page=2.7")
      expect(beforeFirst).toEqual(first)
      expect(negative).toEqual(first)
      expect(fractional).toEqual(second)

      // A number past the cap answers with an empty page too. These routes need
      // no credentials, so an absurd page number must not reach Postgres as an
      // offset outside the range of a bigint, which would fail the query and
      // answer a request anybody can make with a server error.
      const absurd = yield* pageAt("?page=1e20")
      expect(absurd.savedItems).toEqual([])
      expect(absurd.page).toBe(1_000_000)
      expect(absurd.totalPages).toBe(3)
    }),
  )

  it.effect("gives an empty page rather than a placeholder when nothing is published", () =>
    Effect.gen(function* () {
      const response = yield* request("/v1/public/profiles/readerone/saved-items").pipe(
        Effect.provide(routeLayer({
          publicProfiles: [{
            handle: "readerone",
            visibility: "public",
            joinedAt: new Date(Date.now() - daysInMs(30)),
            publicSavedItemCount: 0,
            savedItems: [],
          }],
        })),
      )

      expect(response.status).toBe(200)
      // No placeholder row and no count of what is withheld: the page is empty
      // and page 1 still answers.
      expect(yield* json(response)).toEqual({
        savedItems: [],
        page: 1,
        pageSize: PUBLIC_SAVED_ITEMS_PAGE_SIZE,
        totalPages: 1,
      })
    }),
  )

  it.effect("answers an unknown Handle and a private one with the same item-list response", () =>
    Effect.gen(function* () {
      const layer = routeLayer({
        publicProfiles: [{
          handle: "hidden",
          visibility: "private",
          joinedAt: new Date(Date.now() - daysInMs(400)),
          publicSavedItemCount: 99,
          savedItems: [publicSavedItem],
        }],
      })

      const privateHandle = yield* snapshot(
        yield* request("/v1/public/profiles/hidden/saved-items").pipe(
          Effect.provide(layer),
        ),
      )
      const unknownHandle = yield* snapshot(
        yield* request("/v1/public/profiles/nobody-holds-this/saved-items").pipe(
          Effect.provide(layer),
        ),
      )

      expect(privateHandle.status).toBe(404)
      expect(unknownHandle).toEqual(privateHandle)
      // The same error the profile route answers with, not a second one.
      expect(privateHandle.body).toBe(
        '{"_tag":"PublicProfileNotFoundError","message":"No Public Profile exists for this Handle."}',
      )
    }),
  )

  it.effect("lists only the Handles a search engine may be offered", () =>
    Effect.gen(function* () {
      const lastModifiedAt = new Date("2026-05-18T09:30:00.000Z")
      const response = yield* request("/v1/public/indexable-profiles").pipe(
        Effect.provide(routeLayer({
          publicProfiles: [
            // A second past both boundaries, so the comparison is tested rather
            // than the clock ticking during the request.
            {
              handle: "old-and-full",
              visibility: "public",
              joinedAt: new Date(Date.now() - daysInMs(7) - 1_000),
              publicSavedItemCount: 5,
              lastModifiedAt,
            },
            {
              handle: "too-few-items",
              visibility: "public",
              joinedAt: new Date(Date.now() - daysInMs(30)),
              publicSavedItemCount: 4,
            },
            {
              handle: "too-young",
              visibility: "public",
              joinedAt: new Date(Date.now() - daysInMs(6)),
              publicSavedItemCount: 12,
            },
            // Public Profile turned off: never a candidate, however old and
            // however full.
            {
              handle: "hidden",
              visibility: "private",
              joinedAt: new Date(Date.now() - daysInMs(400)),
              publicSavedItemCount: 99,
            },
          ],
        })),
      )

      // No credentials were sent and none were needed.
      expect(response.status).toBe(200)
      // A profile that is public but not yet indexable is absent, with no
      // placeholder and no count standing in for it.
      expect(yield* json(response)).toEqual({
        profiles: [{
          handle: "old-and-full",
          lastModifiedAt: lastModifiedAt.toISOString(),
        }],
        page: 1,
        pageSize: INDEXABLE_PROFILES_PAGE_SIZE,
        totalPages: 1,
      })
      expect(response.headers.get("cache-control")).toBe("public, max-age=300")
      expect(response.headers.get("ratelimit-limit")).toBe(
        String(PUBLIC_PROFILE_REQUEST_LIMIT),
      )
    }),
  )

  it.effect("addresses indexable Handles by page number", () =>
    Effect.gen(function* () {
      // One layer for the whole test: inside a single test the first layer built
      // wins for every later provide, so the cases share it.
      const layer = routeLayer({
        publicProfiles: Array.from(
          { length: INDEXABLE_PROFILES_PAGE_SIZE + 3 },
          (_unused, index) => ({
            // Padded, so the fixture order is the order a Handle sort gives.
            handle: `reader-${String(index).padStart(5, "0")}`,
            visibility: "public" as const,
            joinedAt: new Date(Date.now() - daysInMs(30)),
            publicSavedItemCount: 12,
          }),
        ),
      })

      const pageAt = (query: string) =>
        Effect.gen(function* () {
          const response = yield* request(
            `/v1/public/indexable-profiles${query}`,
          ).pipe(Effect.provide(layer))
          expect(response.status).toBe(200)
          return yield* json<{
            readonly profiles: ReadonlyArray<{ readonly handle: string }>
            readonly page: number
            readonly totalPages: number
          }>(response)
        })

      const first = yield* pageAt("")
      const second = yield* pageAt("?page=2")
      const past = yield* pageAt("?page=3")

      expect([first.profiles.length, second.profiles.length, past.profiles.length])
        .toEqual([INDEXABLE_PROFILES_PAGE_SIZE, 3, 0])
      expect([first.totalPages, second.totalPages, past.totalPages]).toEqual([2, 2, 2])
      // Consecutive windows over one order: no Handle appears twice and none is
      // skipped between the pages a crawler walks.
      expect(first.profiles[0]?.handle).toBe("reader-00000")
      expect(second.profiles[0]?.handle).toBe(
        `reader-${String(INDEXABLE_PROFILES_PAGE_SIZE).padStart(5, "0")}`,
      )

      // A page number typed by hand still answers with a page, the way the
      // published Saved Item pages do.
      expect(yield* pageAt("?page=0")).toEqual(first)
      expect(yield* pageAt("?page=2.7")).toEqual(second)
      expect((yield* pageAt("?page=1e20")).profiles).toEqual([])
    }),
  )

  it.effect("gives an empty page when no Public Profile is worth indexing yet", () =>
    Effect.gen(function* () {
      const response = yield* request("/v1/public/indexable-profiles").pipe(
        Effect.provide(routeLayer()),
      )

      // An empty list, not a not-found: this route is asked about the whole
      // deployment rather than about one Handle.
      expect(response.status).toBe(200)
      expect(yield* json(response)).toEqual({
        profiles: [],
        page: 1,
        pageSize: INDEXABLE_PROFILES_PAGE_SIZE,
        totalPages: 1,
      })
    }),
  )

  it.effect("limits the indexable listing on the same per-IP budget", () => {
    let seen: string | undefined

    return Effect.gen(function* () {
      const response = yield* request("/v1/public/indexable-profiles", {
        headers: { "CF-Connecting-IP": "198.51.100.9" },
      }).pipe(
        Effect.provide(routeLayer({
          publicRateLimitAllowed: false,
          onPublicRateLimit: (key) => {
            seen = key
          },
        })),
      )

      // It lives under /v1/public/, so it inherits the group's budget rather
      // than bringing one of its own.
      expect(seen).toBe("198.51.100.9")
      expect(response.status).toBe(429)
      expect(response.headers.get("retry-after")).toBe("42")
    })
  })

  it.effect("keeps the API Key Rate Limit away from the public group", () =>
    Effect.gen(function* () {
      // An API Key over its budget still reads a Public Profile: the public
      // group has its own per-IP budget and never consults the key.
      const response = yield* request("/v1/public/profiles/readerone", {
        headers: { authorization: `Bearer ${apiKey}` },
      }).pipe(
        Effect.provide(routeLayer({
          apiKeyAllowed: false,
          publicProfiles: [{
            handle: "readerone",
            visibility: "public",
            joinedAt: new Date(Date.now() - daysInMs(30)),
            publicSavedItemCount: 12,
          }],
        })),
      )

      expect(response.status).toBe(200)
    }),
  )

  it.effect("rate limits a session/OAuth bearer token, not just recognized API keys", () =>
    Effect.gen(function* () {
      // A signed session token (contains ".") skips the API-key check entirely —
      // this is the shape a runaway client retry-loop would hammer the API with.
      const response = yield* request("/v1/saved-items", {
        headers: { authorization: "Bearer session.token.value" },
      }).pipe(
        Effect.provide(routeLayer({
          sessionUserId: userId,
          bearerAllowed: false,
        })),
      )

      expect(response.status).toBe(429)
      expect(response.headers.get("retry-after")).toBe("42")
      expect(yield* json(response)).toEqual({
        _tag: "RateLimitExceeded",
        message: "Rate limit exceeded.",
      })
    }),
  )
})
