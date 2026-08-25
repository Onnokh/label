import { Context, Schema } from "effect"
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpApiSecurity,
  HttpApiSchema,
  OpenApi,
} from "effect/unstable/httpapi"
import {
  BatchCapturePayload,
  BatchCaptureResponse,
  BatchCaptureResult,
  CaptureCreated,
  CapturePayload,
  CaptureUpdated,
  FolderAssignmentPayload,
  FolderDto,
  FolderNameConflictError,
  FolderNamePayload,
  FolderNotFoundError,
  FoldersResponse,
  FolderUpdatePayload,
  HandleAvailabilityQuery,
  HandleAvailabilityResponse,
  HandleConflictError,
  HandlePayload,
  HealthResponse,
  IndexableProfileDto,
  IndexableProfilesQuery,
  IndexableProfilesResponse,
  InvalidFolderNameError,
  InvalidHandleError,
  InvalidUrlError,
  ProfileDto,
  ProfileNotFoundError,
  ProfileVisibilityPayload,
  PublicProfileDto,
  PublicProfileNotFoundError,
  PublicSavedItemDto,
  PublicSavedItemsQuery,
  PublicSavedItemsResponse,
  RateLimitExceeded,
  ReadingActivityDay,
  ReadingActivityResponse,
  SavedItemDto,
  SavedItemNotFoundError,
  SavedItemReadStatePayload,
  SavedItemsQuery,
  SavedItemsResponse,
  SourceAssignmentPayload,
  Unauthorized,
} from "@sleevy/contract"

import type { Profile } from "../domain/Profile.js"
import {
  effectiveTags,
  FolderId,
  SavedItemId,
  type SavedItemWithLink,
  type UserId,
} from "../domain/SavedItem.js"
import {
  AuthContext,
  type Scope,
  V1_SCOPE_DESCRIPTIONS,
  V1_SCOPES,
} from "../modules/auth/Scopes.js"
import { CONNECT_CLIENT_IDS } from "../modules/connect/ConnectClients.js"
import type { PublicSavedItem } from "../modules/profiles/PublicProfileRepository.js"

// Re-export the contract schemas so existing API consumers can keep importing
// from ApiContract while the source of truth lives in @sleevy/contract.
export {
  BatchCapturePayload,
  BatchCaptureResponse,
  BatchCaptureResult,
  CaptureCreated,
  CapturePayload,
  CaptureUpdated,
  FolderAssignmentPayload,
  FolderDto,
  FolderNameConflictError,
  FolderNamePayload,
  FolderNotFoundError,
  FoldersResponse,
  FolderUpdatePayload,
  HandleAvailabilityQuery,
  HandleAvailabilityResponse,
  HandleConflictError,
  HandlePayload,
  HealthResponse,
  IndexableProfileDto,
  IndexableProfilesQuery,
  IndexableProfilesResponse,
  InvalidFolderNameError,
  InvalidHandleError,
  InvalidUrlError,
  ProfileDto,
  ProfileNotFoundError,
  ProfileVisibilityPayload,
  PublicProfileDto,
  PublicProfileNotFoundError,
  PublicSavedItemDto,
  PublicSavedItemsQuery,
  PublicSavedItemsResponse,
  RateLimitExceeded,
  ReadingActivityDay,
  ReadingActivityResponse,
  SavedItemDto,
  SavedItemNotFoundError,
  SavedItemReadStatePayload,
  SavedItemsQuery,
  SavedItemsResponse,
  SourceAssignmentPayload,
  Unauthorized,
}

export const profileToDto = (profile: Profile) =>
  new ProfileDto({
    handle: profile.handle,
    visibility: profile.visibility,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  })

export const savedItemToDto = ({
  savedItem,
  link,
  metadata,
  enrichment,
  source,
  folder,
}: SavedItemWithLink) => {
  const tags = effectiveTags(savedItem.tags, enrichment.tags)

  return new SavedItemDto({
    id: savedItem.id,
    originalUrl: link.originalUrl,
    normalizedUrl: link.normalizedUrl,
    host: link.host,
    title: metadata.title,
    description: metadata.description,
    siteName: metadata.siteName,
    faviconUrl: metadata.faviconUrl,
    faviconLightUrl: metadata.faviconLightUrl,
    faviconDarkUrl: metadata.faviconDarkUrl,
    imageUrl: metadata.imageUrl,
    canonicalUrl: metadata.canonicalUrl,
    authorName: metadata.authorName,
    authorHandle: metadata.authorHandle,
    authorAvatarUrl: metadata.authorAvatarUrl,
    previewSummary: enrichment.previewSummary,
    type: enrichment.type,
    tags,
    enrichmentStatus: enrichment.status,
    sourceName: source?.name,
    captureChannel: savedItem.captureChannel,
    folder: folder ? new FolderDto({
      id: folder.id,
      name: folder.name,
      emoji: folder.emoji,
      color: folder.color,
      isPublished: folder.isPublished,
    }) : null,
    isRead: savedItem.isRead,
    lastSavedAt: savedItem.lastSavedAt,
    createdAt: savedItem.createdAt,
    updatedAt: savedItem.updatedAt,
  })
}

// Every property is named here rather than spread from the row, so a field
// added to the repository shape cannot publish itself. This is the second guard
// on the allow-list; the first is the repository's select list.
export const publicSavedItemToDto = (item: PublicSavedItem) =>
  new PublicSavedItemDto({
    originalUrl: item.originalUrl,
    host: item.host,
    title: item.title,
    faviconUrl: item.faviconUrl,
    faviconLightUrl: item.faviconLightUrl,
    faviconDarkUrl: item.faviconDarkUrl,
    imageUrl: item.imageUrl,
    authorName: item.authorName,
    authorHandle: item.authorHandle,
    authorAvatarUrl: item.authorAvatarUrl,
    type: item.type,
    tags: item.tags,
    previewSummary: item.previewSummary,
    savedAt: item.savedAt,
  })

export class CurrentUser extends Context.Service<CurrentUser, UserId>()(
  "@app/api/CurrentUser",
) {}

export class SessionOrApiKeyAuth extends HttpApiMiddleware.Service<SessionOrApiKeyAuth, {
  provides: CurrentUser | AuthContext
}>()("@app/api/SessionOrApiKeyAuth", {
  error: Unauthorized,
  security: {
    bearer: HttpApiSecurity.bearer,
  },
}) {}

export class SessionOnlyAuth extends HttpApiMiddleware.Service<SessionOnlyAuth, {
  provides: CurrentUser
}>()("@app/api/SessionOnlyAuth", {
  error: Unauthorized,
  security: {
    bearer: HttpApiSecurity.bearer,
  },
}) {}

export const ConnectClientLiteral = Schema.Literals(CONNECT_CLIENT_IDS)
export const ConnectScopeLiteral = Schema.Literals(V1_SCOPES)

export class ConnectAuthorizePayload extends Schema.Class<ConnectAuthorizePayload>(
  "ConnectAuthorizePayload",
)({
  client: ConnectClientLiteral,
  redirectUri: Schema.String,
  codeChallenge: Schema.String,
  codeChallengeMethod: Schema.Literal("S256"),
  scopes: Schema.Array(ConnectScopeLiteral),
  label: Schema.String,
  deviceHint: Schema.optional(Schema.String),
}) {}

export class ConnectAuthorizeResponse extends Schema.Class<ConnectAuthorizeResponse>(
  "ConnectAuthorizeResponse",
)({
  code: Schema.String,
}) {}

export class ConnectExchangePayload extends Schema.Class<ConnectExchangePayload>(
  "ConnectExchangePayload",
)({
  client: ConnectClientLiteral,
  code: Schema.String,
  codeVerifier: Schema.String,
}) {}

export class ConnectExchangeResponse extends Schema.Class<ConnectExchangeResponse>(
  "ConnectExchangeResponse",
)({
  apiKey: Schema.String,
  scopes: Schema.Array(ConnectScopeLiteral),
  label: Schema.String,
}) {}

export class ConnectError extends Schema.ErrorClass<ConnectError>("ConnectError")({
  _tag: Schema.tag("ConnectError"),
  code: Schema.Literals([
    "unknown_client",
    "invalid_redirect_uri",
    "invalid_scope",
    "invalid_code",
    "invalid_verifier",
    "client_mismatch",
  ] as const),
  message: Schema.String,
}, { httpApiStatus: 400 }) {}

const capturesGroup = HttpApiGroup.make("captures")
  .add(
    HttpApiEndpoint.post("captureBatch", "/v1/captures/batch", {
      payload: BatchCapturePayload,
      success: BatchCaptureResponse,
      error: RateLimitExceeded,
    })
      .annotate(OpenApi.Summary, "Save many URLs in one request")
      .annotate(OpenApi.Description, "Save up to 50 URLs to the authenticated account's read-later queue in one request, so an agent working through a list does not have to make one call per link.\n\nEntries are applied one at a time and the batch is not a transaction: each result carries its own `outcome` of `created`, `updated`, or `failed`, and a failing entry does not roll back the ones that succeeded. Results are returned in request order and each carries its `index`, so a caller can line them up with what it sent.\n\nThe response is always `200` when the batch itself was accepted, even if every entry failed. Read `created`, `updated`, and `failed` for the totals, and each result's `code` and `message` for why an entry failed.\n\nSend an `Idempotency-Key` header to make a retry after a network failure safe; the whole batch replays as one recorded response.")
  )
  .add(
    HttpApiEndpoint.post("capture", "/v1/captures", {
      payload: CapturePayload,
      success: [CaptureCreated, CaptureUpdated],
      error: [InvalidUrlError, FolderNotFoundError, RateLimitExceeded],
    })
      .annotate(OpenApi.Summary, "Save a URL")
      .annotate(OpenApi.Description, "Save an HTTP or HTTPS URL to the authenticated account's read-later queue.\n\nCapture is idempotent by URL: saving a URL that is already in the queue returns `200` with the existing Saved Item rather than creating a duplicate, while a genuinely new URL returns `201`. Read the `created` field of the response to tell the two apart.\n\nLink Metadata and Link Enrichment are fetched in the background, so the title, image, and tags of a freshly captured item may still be empty in this response. Poll the Saved Item until `enrichmentStatus` leaves `pending`.\n\nSend an `Idempotency-Key` header to make a retry after a network failure safe."),
  )
  .middleware(SessionOrApiKeyAuth)

const healthGroup = HttpApiGroup.make("health")
  .add(
    HttpApiEndpoint.get("check", "/health", {
      success: HealthResponse,
    })
      .annotate(OpenApi.Summary, "Health check")
      .annotate(OpenApi.Description, "Report whether the API is serving requests. Unauthenticated, uncounted against any rate limit, and safe to poll."),
  )
  .add(
    HttpApiEndpoint.get("checkV1", "/v1/health", {
      success: HealthResponse,
    })
      .annotate(OpenApi.Summary, "Health check (v1)")
      .annotate(OpenApi.Description, "The versioned alias of `GET /health`, for clients that address every route under the `/v1` prefix. Unauthenticated."),
  )

const savedItemsGroup = HttpApiGroup.make("saved-items")
  .add(
    HttpApiEndpoint.get("list", "/v1/saved-items", {
      query: SavedItemsQuery,
      success: SavedItemsResponse,
      error: [FolderNotFoundError, RateLimitExceeded],
    })
      .annotate(OpenApi.Summary, "List saved items")
      .annotate(OpenApi.Description, "List the authenticated account's Saved Items.\n\nUse `sort` to choose the ordering and `folder` to restrict the list to one Folder. Pass `limit` and the `nextCursor` of the previous response to page through the list; `nextCursor` is `null` on the last page. Treat the cursor as opaque and never construct one."),
  )
  .add(
    HttpApiEndpoint.post("markOpened", "/v1/saved-items/:id/open", {
      params: Schema.Struct({ id: SavedItemId }),
      success: SavedItemDto,
      error: [SavedItemNotFoundError, RateLimitExceeded],
    })
      .annotate(OpenApi.Summary, "Record a saved item as opened")
      .annotate(OpenApi.Description, "Record that the person opened this Saved Item, which also marks it read. Use this rather than `POST /read` when the person actually followed the link, so the Open is recorded as well as the read state."),
  )
  .add(
    HttpApiEndpoint.post("markRead", "/v1/saved-items/:id/read", {
      params: Schema.Struct({ id: SavedItemId }),
      success: SavedItemDto,
      error: [SavedItemNotFoundError, RateLimitExceeded],
    })
      .annotate(OpenApi.Summary, "Mark a saved item read")
      .annotate(OpenApi.Description, "Mark this Saved Item as read without recording an Open. Idempotent: marking an already-read item read again succeeds and changes nothing."),
  )
  .add(
    HttpApiEndpoint.post("markUnread", "/v1/saved-items/:id/unread", {
      params: Schema.Struct({ id: SavedItemId }),
      success: SavedItemDto,
      error: [SavedItemNotFoundError, RateLimitExceeded],
    })
      .annotate(OpenApi.Summary, "Mark a saved item unread")
      .annotate(OpenApi.Description, "Return this Saved Item to the unread queue. Idempotent: marking an already-unread item unread again succeeds and changes nothing."),
  )
  .add(
    HttpApiEndpoint.post("setReadState", "/v1/saved-items/:id/read-state", {
      params: Schema.Struct({ id: SavedItemId }),
      payload: SavedItemReadStatePayload,
      success: SavedItemDto,
      error: [SavedItemNotFoundError, RateLimitExceeded],
    })
      .annotate(OpenApi.Summary, "Set a saved item's read state")
      .annotate(OpenApi.Description, "Set the read state of this Saved Item from a boolean, for callers syncing a toggle. Equivalent to `POST /read` or `POST /unread` depending on the value sent."),
  )
  .add(
    HttpApiEndpoint.put("setFolder", "/v1/saved-items/:id/folder", {
      params: Schema.Struct({ id: SavedItemId }),
      payload: FolderAssignmentPayload,
      success: SavedItemDto,
      error: [SavedItemNotFoundError, FolderNotFoundError, RateLimitExceeded],
    })
      .annotate(OpenApi.Summary, "Move a saved item into a folder")
      .annotate(OpenApi.Description, "Move this Saved Item into a Folder, or send a null Folder to take it out of the one it is in. A Saved Item belongs to at most one Folder. Returns `404` when either the Saved Item or the Folder does not belong to the authenticated account."),
  )
  .add(
    HttpApiEndpoint.put("setSource", "/v1/saved-items/source", {
      payload: SourceAssignmentPayload,
      success: HttpApiSchema.NoContent,
      error: RateLimitExceeded,
    })
      .annotate(OpenApi.Summary, "Rename this client's capture source")
      .annotate(OpenApi.Description, "Set the Source name this client records on the items it captures, such as the device name a person will recognise later. Applies to future captures from this client and returns `204`."),
  )
  .add(
    HttpApiEndpoint.delete("remove", "/v1/saved-items/:id", {
      params: Schema.Struct({ id: SavedItemId }),
      success: HttpApiSchema.NoContent,
      error: RateLimitExceeded,
    })
      .annotate(OpenApi.Summary, "Delete a saved item")
      .annotate(OpenApi.Description, "Permanently delete this Saved Item from the authenticated account. Deletion cannot be undone, so an agent should confirm with the person first. Returns `204`, including when the item was already gone, so a retry is safe."),
  )
  .middleware(SessionOrApiKeyAuth)

const foldersGroup = HttpApiGroup.make("folders")
  .add(
    HttpApiEndpoint.get("list", "/v1/folders", {
      success: FoldersResponse,
      error: RateLimitExceeded,
    })
      .annotate(OpenApi.Summary, "List folders")
      .annotate(OpenApi.Description, "List every Folder in the authenticated account, with its name, emoji, colour, and whether it is published to the account's Public Profile."),
  )
  .add(
    HttpApiEndpoint.post("create", "/v1/folders", {
      payload: FolderNamePayload,
      success: FolderDto,
      error: [InvalidFolderNameError, FolderNameConflictError, RateLimitExceeded],
    })
      .annotate(OpenApi.Summary, "Create a folder")
      .annotate(OpenApi.Description, "Create a Folder. The name must be unique within the account; a duplicate returns `409`. Send an `Idempotency-Key` header so a retried request cannot create a second Folder."),
  )
  .add(
    HttpApiEndpoint.patch("update", "/v1/folders/:id", {
      params: Schema.Struct({ id: FolderId }),
      payload: FolderUpdatePayload,
      success: FolderDto,
      error: [InvalidFolderNameError, FolderNotFoundError, FolderNameConflictError, RateLimitExceeded],
    })
      .annotate(OpenApi.Summary, "Update a folder")
      .annotate(OpenApi.Description, "Update a Folder's name, emoji, colour, or published state. Every field is optional and an omitted field is left as it is, so a caller changing one field does not have to resend the rest."),
  )
  .add(
    HttpApiEndpoint.delete("remove", "/v1/folders/:id", {
      params: Schema.Struct({ id: FolderId }),
      success: HttpApiSchema.NoContent,
      error: [FolderNotFoundError, RateLimitExceeded],
    })
      .annotate(OpenApi.Summary, "Delete a folder")
      .annotate(OpenApi.Description, "Delete a Folder. The Saved Items in it are kept and become unfiled rather than being deleted with it. Deletion cannot be undone, so an agent should confirm with the person first."),
  )
  .middleware(SessionOrApiKeyAuth)

// Handle and Profile Visibility are Account settings, so this group is
// session-only: the v1 REST API does not expose account administration
// through API Keys.
const profileGroup = HttpApiGroup.make("profile")
  .add(
    HttpApiEndpoint.get("get", "/v1/profile", {
      success: ProfileDto,
      error: [ProfileNotFoundError, RateLimitExceeded],
    })
      .annotate(OpenApi.Summary, "Get the account profile")
      .annotate(OpenApi.Description, "Read the authenticated account's Handle and Profile Visibility. Requires an App Session: the v1 REST API does not expose account administration through an API Key."),
  )
  .add(
    HttpApiEndpoint.get("checkHandle", "/v1/profile/handle-availability", {
      query: HandleAvailabilityQuery,
      success: HandleAvailabilityResponse,
      error: [InvalidHandleError, RateLimitExceeded],
    })
      .annotate(OpenApi.Summary, "Check whether a handle is free")
      .annotate(OpenApi.Description, "Report whether a Handle can be claimed, before trying to claim it. A Handle that is reserved or already taken is reported unavailable."),
  )
  .add(
    HttpApiEndpoint.post("claimHandle", "/v1/profile/handle", {
      payload: HandlePayload,
      success: ProfileDto,
      error: [InvalidHandleError, HandleConflictError, RateLimitExceeded],
    })
      .annotate(OpenApi.Summary, "Claim a handle")
      .annotate(OpenApi.Description, "Claim a Handle for the authenticated account. The Handle becomes the address of the account's Public Profile at `/u/{handle}`. Returns `409` if another account claimed it first."),
  )
  .add(
    HttpApiEndpoint.patch("renameHandle", "/v1/profile/handle", {
      payload: HandlePayload,
      success: ProfileDto,
      error: [InvalidHandleError, ProfileNotFoundError, HandleConflictError, RateLimitExceeded],
    })
      .annotate(OpenApi.Summary, "Rename the account handle")
      .annotate(OpenApi.Description, "Change the authenticated account's Handle. The old Handle is released and the Public Profile moves to the new address, so any link to the old one stops resolving."),
  )
  .add(
    HttpApiEndpoint.put("setVisibility", "/v1/profile/visibility", {
      payload: ProfileVisibilityPayload,
      success: ProfileDto,
      error: [ProfileNotFoundError, RateLimitExceeded],
    })
      .annotate(OpenApi.Summary, "Set profile visibility")
      .annotate(OpenApi.Description, "Turn the account's Public Profile on or off. While it is off, the public routes answer as though the Handle does not exist, so nothing is disclosed about the account."),
  )
  .middleware(SessionOnlyAuth)

// The public half of Public Profiles. This group takes no middleware on
// purpose: a visitor reads a Public Profile without an App Session and without
// an API Key, so it is bucketed on the client address instead (see
// PublicProfileRateLimiter). Every route lives under /v1/public/, which is the
// prefix the per-IP budget is applied to, and every route answers a Handle it
// cannot resolve with the same not-found error, so the three disclose nothing
// between them.
const publicProfilesGroup = HttpApiGroup.make("public-profiles")
  .add(
    HttpApiEndpoint.get("get", "/v1/public/profiles/:handle", {
      params: Schema.Struct({ handle: Schema.String }),
      success: PublicProfileDto,
      error: [PublicProfileNotFoundError, RateLimitExceeded],
    })
      .annotate(OpenApi.Summary, "Get a public profile")
      .annotate(OpenApi.Description, "Read one person's Public Profile by Handle. Unauthenticated, and bucketed on the client address rather than on a credential. Returns `404` for a Handle that does not exist and for one whose owner has Profile Visibility off, so the two cannot be told apart."),
  )
  // The published Saved Items of one Handle, newest first, one numbered page at
  // a time.
  .add(
    HttpApiEndpoint.get("listSavedItems", "/v1/public/profiles/:handle/saved-items", {
      params: Schema.Struct({ handle: Schema.String }),
      query: PublicSavedItemsQuery,
      success: PublicSavedItemsResponse,
      error: [PublicProfileNotFoundError, RateLimitExceeded],
    })
      .annotate(OpenApi.Summary, "List a public profile's saved items")
      .annotate(OpenApi.Description, "List the Saved Items a person publishes on their Public Profile, newest first, one numbered page at a time. Unauthenticated. Only items in published Folders appear, and each carries a deliberately narrow field set."),
  )
  .add(
    HttpApiEndpoint.get("getActivity", "/v1/public/profiles/:handle/activity", {
      params: Schema.Struct({ handle: Schema.String }),
      success: ReadingActivityResponse,
      error: [PublicProfileNotFoundError, RateLimitExceeded],
    })
      .annotate(OpenApi.Summary, "Get a public profile's reading activity")
      .annotate(OpenApi.Description, "Read the daily reading activity of a Public Profile over a rolling window, as a count per day. Unauthenticated."),
  )
  // Every Handle a search engine may be offered, so a crawler-facing document
  // can name the Public Profiles that exist. This route carries no not-found
  // error: no Handle is asked for, and a deployment with nothing worth indexing
  // answers with an empty page rather than with a miss.
  .add(
    HttpApiEndpoint.get("listIndexable", "/v1/public/indexable-profiles", {
      query: IndexableProfilesQuery,
      success: IndexableProfilesResponse,
      error: RateLimitExceeded,
    })
      .annotate(OpenApi.Summary, "List indexable public profiles")
      .annotate(OpenApi.Description, "List every Handle a search engine may be offered, so a crawler-facing document such as a sitemap can name the Public Profiles that exist. A profile that is public but has nothing worth indexing is absent. Unauthenticated."),
  )

const connectAuthorizeGroup = HttpApiGroup.make("connect-authorize")
  .add(
    HttpApiEndpoint.post("authorize", "/connect/authorize", {
      payload: ConnectAuthorizePayload,
      success: ConnectAuthorizeResponse,
      error: [ConnectError, RateLimitExceeded],
    })
      .annotate(OpenApi.Summary, "Authorize a first-party client")
      .annotate(OpenApi.Description, "Issue a short-lived authorization code for a first-party Sleevy client, such as the iOS app or the Raycast extension, using PKCE. Requires an App Session. Third-party integrations use the OAuth 2.1 endpoints under `/api/auth/oauth2` instead."),
  )
  .middleware(SessionOnlyAuth)

const connectExchangeGroup = HttpApiGroup.make("connect-exchange")
  .add(
    HttpApiEndpoint.post("exchange", "/connect/exchange", {
      payload: ConnectExchangePayload,
      success: ConnectExchangeResponse,
      error: [ConnectError, RateLimitExceeded],
    })
      .annotate(OpenApi.Summary, "Exchange an authorization code for an API key")
      .annotate(OpenApi.Description, "Exchange a code from `POST /connect/authorize`, together with its PKCE verifier, for a scoped API Key. The code is single-use and expires quickly."),
  )

const oauthScopesByOperationId: Record<string, ReadonlyArray<ReadonlyArray<Scope>>> = {
  "captures.capture": [["saved-items:capture"]],
  "captures.captureBatch": [["saved-items:capture"]],
  "saved-items.list": [["saved-items:read"]],
  "saved-items.markOpened": [["saved-items:write"]],
  "saved-items.markRead": [["saved-items:write"]],
  "saved-items.markUnread": [["saved-items:write"]],
  "saved-items.setReadState": [["saved-items:write"]],
  "saved-items.setFolder": [["saved-items:write"]],
  "saved-items.setSource": [["saved-items:write"]],
  "saved-items.remove": [["saved-items:write"], ["saved-items:delete"]],
  "folders.list": [["folders:read"]],
  "folders.create": [["folders:write"]],
  "folders.update": [["folders:write"]],
  "folders.remove": [["folders:delete"]],
}

const WRITE_METHODS = ["post", "put", "patch"] as const

// Agents retry on a network failure without knowing whether the first attempt
// landed. The header is only useful if they can discover it, so every write
// operation declares it rather than leaving it to prose.
const idempotencyKeyParameter = {
  name: "Idempotency-Key",
  in: "header",
  required: false,
  description:
    "A unique value identifying this write. The first response for a given key is recorded for 24 hours and replayed for every later request that repeats it, so a retry after a timeout cannot create a duplicate. Replayed responses carry `Idempotent-Replay: true`. A key whose original request is still running gets `409`. Use a UUID or a ULID, and reuse a key only when retrying the same request.",
  schema: { type: "string", maxLength: 255 },
  example: "8f14e45f-ea4e-4a1f-9c2b-6f0a1d3c5e77",
} as const

const addIdempotencyToOpenApi = (spec: Record<string, any>) => {
  for (const pathItem of Object.values(spec.paths ?? {}) as ReadonlyArray<Record<string, any>>) {
    for (const method of WRITE_METHODS) {
      const operation = pathItem[method]
      if (!operation) continue
      // The public group takes no credential, so it has no caller to scope a
      // key to and no write to make idempotent.
      if (operation.security?.length === 0) continue
      operation.parameters = [...(operation.parameters ?? []), { ...idempotencyKeyParameter }]
    }
  }

  return spec
}

const addOAuthToOpenApi = (spec: Record<string, any>) => {
  const securitySchemes = spec.components?.securitySchemes as Record<string, any>
  if (securitySchemes.bearer) {
    securitySchemes.bearer.description =
      "Personal API Key or App Session bearer token."
  }
  securitySchemes.oauth2 = {
    type: "oauth2",
    description: "OAuth 2.0 Authorization Code flow with PKCE for delegated access.",
    flows: {
      authorizationCode: {
        authorizationUrl: "https://api.sleevy.app/api/auth/oauth2/authorize",
        tokenUrl: "https://api.sleevy.app/api/auth/oauth2/token",
        refreshUrl: "https://api.sleevy.app/api/auth/oauth2/token",
        scopes: V1_SCOPE_DESCRIPTIONS,
      },
    },
  }

  for (const pathItem of Object.values(spec.paths ?? {}) as ReadonlyArray<Record<string, any>>) {
    for (const operation of Object.values(pathItem) as ReadonlyArray<Record<string, any>>) {
      if (!operation || typeof operation.operationId !== "string") continue
      const scopeAlternatives = oauthScopesByOperationId[operation.operationId]
      if (!scopeAlternatives) continue
      operation.security = [
        ...(operation.security ?? []),
        ...scopeAlternatives.map((scopes) => ({ oauth2: [...scopes] })),
      ]
    }
  }

  return spec
}

export const sleevyApi = HttpApi.make("SleevyApi")
  .annotate(OpenApi.Title, "Sleevy API")
  .annotate(OpenApi.Description, "REST API for saving, listing, and managing your read-later queue.")
  .annotate(OpenApi.Version, "1.0.0")
  .annotate(OpenApi.Servers, [{
    url: "https://api.sleevy.app",
    description: "Sleevy production API",
  }])
  .annotate(OpenApi.Transform, (spec) => addIdempotencyToOpenApi(addOAuthToOpenApi(spec)))
  .add(healthGroup)
  .add(capturesGroup)
  .add(savedItemsGroup)
  .add(foldersGroup)
  .add(profileGroup)
  .add(publicProfilesGroup)
  .add(connectAuthorizeGroup)
  .add(connectExchangeGroup)
