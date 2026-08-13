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
  CaptureCreated,
  CapturePayload,
  CaptureUpdated,
  FolderAssignmentPayload,
  FolderDto,
  FolderNameConflictError,
  FolderNamePayload,
  FolderNotFoundError,
  FoldersResponse,
  HandleAvailabilityQuery,
  HandleAvailabilityResponse,
  HandleConflictError,
  HandlePayload,
  HealthResponse,
  InvalidFolderNameError,
  InvalidHandleError,
  InvalidUrlError,
  ProfileDto,
  ProfileNotFoundError,
  ProfileVisibilityPayload,
  RateLimitExceeded,
  SavedItemDto,
  SavedItemNotFoundError,
  SavedItemReadStatePayload,
  SavedItemsQuery,
  SavedItemsResponse,
  Unauthorized,
} from "@sleevy/contract"

import type { Profile } from "../domain/Profile.js"
import { FolderId, SavedItemId, type SavedItemWithLink, type UserId } from "../domain/SavedItem.js"
import { AuthContext, V1_SCOPES } from "../modules/auth/Scopes.js"
import { CONNECT_CLIENT_IDS } from "../modules/connect/ConnectClients.js"

// Re-export the contract schemas so existing API consumers can keep importing
// from ApiContract while the source of truth lives in @sleevy/contract.
export {
  CaptureCreated,
  CapturePayload,
  CaptureUpdated,
  FolderAssignmentPayload,
  FolderDto,
  FolderNameConflictError,
  FolderNamePayload,
  FolderNotFoundError,
  FoldersResponse,
  HandleAvailabilityQuery,
  HandleAvailabilityResponse,
  HandleConflictError,
  HandlePayload,
  HealthResponse,
  InvalidFolderNameError,
  InvalidHandleError,
  InvalidUrlError,
  ProfileDto,
  ProfileNotFoundError,
  ProfileVisibilityPayload,
  RateLimitExceeded,
  SavedItemDto,
  SavedItemNotFoundError,
  SavedItemReadStatePayload,
  SavedItemsQuery,
  SavedItemsResponse,
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
  const tags = savedItem.tags.length > 0 ? savedItem.tags : enrichment.tags

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
    }) : null,
    isRead: savedItem.isRead,
    lastSavedAt: savedItem.lastSavedAt,
    createdAt: savedItem.createdAt,
    updatedAt: savedItem.updatedAt,
  })
}

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
    HttpApiEndpoint.post("capture", "/v1/captures", {
      payload: CapturePayload,
      success: [CaptureCreated, CaptureUpdated],
      error: [InvalidUrlError, FolderNotFoundError, RateLimitExceeded],
    }),
  )
  .middleware(SessionOrApiKeyAuth)

const healthGroup = HttpApiGroup.make("health")
  .add(
    HttpApiEndpoint.get("check", "/health", {
      success: HealthResponse,
    }),
  )
  .add(
    HttpApiEndpoint.get("checkV1", "/v1/health", {
      success: HealthResponse,
    }),
  )

const savedItemsGroup = HttpApiGroup.make("saved-items")
  .add(
    HttpApiEndpoint.get("list", "/v1/saved-items", {
      query: SavedItemsQuery,
      success: SavedItemsResponse,
      error: [FolderNotFoundError, RateLimitExceeded],
    }),
  )
  .add(
    HttpApiEndpoint.post("markOpened", "/v1/saved-items/:id/open", {
      params: Schema.Struct({ id: SavedItemId }),
      success: SavedItemDto,
      error: [SavedItemNotFoundError, RateLimitExceeded],
    }),
  )
  .add(
    HttpApiEndpoint.post("markRead", "/v1/saved-items/:id/read", {
      params: Schema.Struct({ id: SavedItemId }),
      success: SavedItemDto,
      error: [SavedItemNotFoundError, RateLimitExceeded],
    }),
  )
  .add(
    HttpApiEndpoint.post("markUnread", "/v1/saved-items/:id/unread", {
      params: Schema.Struct({ id: SavedItemId }),
      success: SavedItemDto,
      error: [SavedItemNotFoundError, RateLimitExceeded],
    }),
  )
  .add(
    HttpApiEndpoint.post("setReadState", "/v1/saved-items/:id/read-state", {
      params: Schema.Struct({ id: SavedItemId }),
      payload: SavedItemReadStatePayload,
      success: SavedItemDto,
      error: [SavedItemNotFoundError, RateLimitExceeded],
    }),
  )
  .add(
    HttpApiEndpoint.put("setFolder", "/v1/saved-items/:id/folder", {
      params: Schema.Struct({ id: SavedItemId }),
      payload: FolderAssignmentPayload,
      success: SavedItemDto,
      error: [SavedItemNotFoundError, FolderNotFoundError, RateLimitExceeded],
    }),
  )
  .add(
    HttpApiEndpoint.delete("remove", "/v1/saved-items/:id", {
      params: Schema.Struct({ id: SavedItemId }),
      success: HttpApiSchema.NoContent,
      error: RateLimitExceeded,
    }),
  )
  .middleware(SessionOrApiKeyAuth)

const foldersGroup = HttpApiGroup.make("folders")
  .add(
    HttpApiEndpoint.get("list", "/v1/folders", {
      success: FoldersResponse,
      error: RateLimitExceeded,
    }),
  )
  .add(
    HttpApiEndpoint.post("create", "/v1/folders", {
      payload: FolderNamePayload,
      success: FolderDto,
      error: [InvalidFolderNameError, FolderNameConflictError, RateLimitExceeded],
    }),
  )
  .add(
    HttpApiEndpoint.patch("rename", "/v1/folders/:id", {
      params: Schema.Struct({ id: FolderId }),
      payload: FolderNamePayload,
      success: FolderDto,
      error: [InvalidFolderNameError, FolderNotFoundError, FolderNameConflictError, RateLimitExceeded],
    }),
  )
  .add(
    HttpApiEndpoint.delete("remove", "/v1/folders/:id", {
      params: Schema.Struct({ id: FolderId }),
      success: HttpApiSchema.NoContent,
      error: [FolderNotFoundError, RateLimitExceeded],
    }),
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
    }),
  )
  .add(
    HttpApiEndpoint.get("checkHandle", "/v1/profile/handle-availability", {
      query: HandleAvailabilityQuery,
      success: HandleAvailabilityResponse,
      error: [InvalidHandleError, RateLimitExceeded],
    }),
  )
  .add(
    HttpApiEndpoint.post("claimHandle", "/v1/profile/handle", {
      payload: HandlePayload,
      success: ProfileDto,
      error: [InvalidHandleError, HandleConflictError, RateLimitExceeded],
    }),
  )
  .add(
    HttpApiEndpoint.patch("renameHandle", "/v1/profile/handle", {
      payload: HandlePayload,
      success: ProfileDto,
      error: [InvalidHandleError, ProfileNotFoundError, HandleConflictError, RateLimitExceeded],
    }),
  )
  .add(
    HttpApiEndpoint.put("setVisibility", "/v1/profile/visibility", {
      payload: ProfileVisibilityPayload,
      success: ProfileDto,
      error: [ProfileNotFoundError, RateLimitExceeded],
    }),
  )
  .middleware(SessionOnlyAuth)

const connectAuthorizeGroup = HttpApiGroup.make("connect-authorize")
  .add(
    HttpApiEndpoint.post("authorize", "/connect/authorize", {
      payload: ConnectAuthorizePayload,
      success: ConnectAuthorizeResponse,
      error: [ConnectError, RateLimitExceeded],
    }),
  )
  .middleware(SessionOnlyAuth)

const connectExchangeGroup = HttpApiGroup.make("connect-exchange")
  .add(
    HttpApiEndpoint.post("exchange", "/connect/exchange", {
      payload: ConnectExchangePayload,
      success: ConnectExchangeResponse,
      error: [ConnectError, RateLimitExceeded],
    }),
  )

export const sleevyApi = HttpApi.make("SleevyApi")
  .annotate(OpenApi.Title, "Sleevy API")
  .annotate(OpenApi.Description, "REST API for saving, listing, and managing your read-later queue.")
  .annotate(OpenApi.Version, "1.0.0")
  .annotate(OpenApi.Servers, [{
    url: "https://api.sleevy.app",
    description: "Sleevy production API",
  }])
  .add(healthGroup)
  .add(capturesGroup)
  .add(savedItemsGroup)
  .add(foldersGroup)
  .add(profileGroup)
  .add(connectAuthorizeGroup)
  .add(connectExchangeGroup)
