// @sleevy/contract — the canonical wire shape of the Sleevy REST API.
//
// This is the single source of truth for the API contract. The schemas defined
// here are imported by apps/api (which uses them directly in HttpApiEndpoint
// route definitions) and by TypeScript clients (apps/web, apps/chrome-extension,
// and vendored into apps/raycast-plugin), which use them as type-only imports
// to derive plain wire types.
//
// For non-Effect consumers, each Schema.Class exposes a merged namespace with
// an `Encoded` type alias representing the JSON wire shape:
//
//   import type { SavedItemDto } from "@sleevy/contract"
//   const items: SavedItemDto.Encoded[] = await response.json()
//
// IDs cross the wire as plain strings. Dates cross as ISO 8601 strings.

import { Schema } from "effect"

// ─── Enum vocabularies ──────────────────────────────────────────────────────

export const linkTypes = [
  "article",
  "video",
  "website",
  "repository",
] as const
export const LinkType = Schema.Literals(linkTypes)
export type LinkType = typeof LinkType.Type

export const topics = [
  "ai",
  "tools",
  "typescript",
  "security",
  "design",
  "backend",
  "front-end",
] as const
export const Topic = Schema.Literals(topics)
export type Topic = typeof Topic.Type

export const captureChannels = [
  "chrome-extension",
  "ios-app",
  "ios-share-extension",
  "raycast",
  "web-companion",
  "api",
] as const
export const CaptureChannel = Schema.Literals(captureChannels)
export type CaptureChannel = typeof CaptureChannel.Type

export const enrichmentStatuses = ["pending", "enriched", "failed"] as const
export const EnrichmentStatus = Schema.Literals(enrichmentStatuses)
export type EnrichmentStatus = typeof EnrichmentStatus.Type

export const profileVisibilities = ["private", "public"] as const
export const ProfileVisibility = Schema.Literals(profileVisibilities)
export type ProfileVisibility = typeof ProfileVisibility.Type

export const savedItemSorts = ["newest", "oldest", "title", "unread"] as const
export const SavedItemSort = Schema.Literals(savedItemSorts)
export type SavedItemSort = typeof SavedItemSort.Type

// ─── Success DTOs ───────────────────────────────────────────────────────────

export class SavedItemDto extends Schema.Class<SavedItemDto>("SavedItemDto")({
  id: Schema.String,
  originalUrl: Schema.String,
  normalizedUrl: Schema.String,
  host: Schema.String,
  title: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  siteName: Schema.optional(Schema.String),
  faviconUrl: Schema.optional(Schema.String),
  faviconLightUrl: Schema.optional(Schema.String),
  faviconDarkUrl: Schema.optional(Schema.String),
  imageUrl: Schema.optional(Schema.String),
  canonicalUrl: Schema.optional(Schema.String),
  previewSummary: Schema.optional(Schema.String),
  type: LinkType,
  tags: Schema.Array(Topic),
  enrichmentStatus: EnrichmentStatus,
  sourceName: Schema.optional(Schema.String),
  captureChannel: Schema.optional(CaptureChannel),
  folder: Schema.NullOr(Schema.suspend(() => FolderDto)),
  isRead: Schema.Boolean,
  lastSavedAt: Schema.DateFromString,
  createdAt: Schema.DateFromString,
  updatedAt: Schema.DateFromString,
}) {}
export namespace SavedItemDto {
  export type Encoded = Schema.Codec.Encoded<typeof SavedItemDto>
}

export class SavedItemsResponse extends Schema.Class<SavedItemsResponse>("SavedItemsResponse")({
  savedItems: Schema.Array(SavedItemDto),
}) {}
export namespace SavedItemsResponse {
  export type Encoded = Schema.Codec.Encoded<typeof SavedItemsResponse>
}

export class FolderDto extends Schema.Class<FolderDto>("FolderDto")({
  id: Schema.String,
  name: Schema.String,
  emoji: Schema.NullOr(Schema.String),
  color: Schema.NullOr(Schema.String),
}) {}
export namespace FolderDto {
  export type Encoded = Schema.Codec.Encoded<typeof FolderDto>
}

export class FoldersResponse extends Schema.Class<FoldersResponse>("FoldersResponse")({
  folders: Schema.Array(FolderDto),
}) {}
export namespace FoldersResponse {
  export type Encoded = Schema.Codec.Encoded<typeof FoldersResponse>
}

// The private half of a Public Profile: the Handle an Account claimed and the
// Profile Visibility that decides whether that Handle resolves publicly.
export class ProfileDto extends Schema.Class<ProfileDto>("ProfileDto")({
  handle: Schema.String,
  visibility: ProfileVisibility,
  createdAt: Schema.DateFromString,
  updatedAt: Schema.DateFromString,
}) {}
export namespace ProfileDto {
  export type Encoded = Schema.Codec.Encoded<typeof ProfileDto>
}

export class HandleAvailabilityResponse extends Schema.Class<HandleAvailabilityResponse>(
  "HandleAvailabilityResponse",
)({
  handle: Schema.String,
  available: Schema.Boolean,
}) {}
export namespace HandleAvailabilityResponse {
  export type Encoded = Schema.Codec.Encoded<typeof HandleAvailabilityResponse>
}

export class CaptureCreated extends Schema.Class<CaptureCreated>("CaptureCreated")({
  savedItem: SavedItemDto,
  captureResult: Schema.Literal("created"),
}, { httpApiStatus: 201 }) {}
export namespace CaptureCreated {
  export type Encoded = Schema.Codec.Encoded<typeof CaptureCreated>
}

export class CaptureUpdated extends Schema.Class<CaptureUpdated>("CaptureUpdated")({
  savedItem: SavedItemDto,
  captureResult: Schema.Literal("updated"),
}, { httpApiStatus: 200 }) {}
export namespace CaptureUpdated {
  export type Encoded = Schema.Codec.Encoded<typeof CaptureUpdated>
}

export type CaptureResponseEncoded = CaptureCreated.Encoded | CaptureUpdated.Encoded

export class HealthResponse extends Schema.Class<HealthResponse>("HealthResponse")({
  ok: Schema.Boolean,
}) {}
export namespace HealthResponse {
  export type Encoded = Schema.Codec.Encoded<typeof HealthResponse>
}

// ─── Request payloads ───────────────────────────────────────────────────────

export class CapturePayload extends Schema.Class<CapturePayload>("CapturePayload")({
  url: Schema.String,
  sourceName: Schema.optional(Schema.String),
  captureChannel: Schema.optional(CaptureChannel),
  tags: Schema.optional(Schema.Array(Topic)),
  folderId: Schema.optional(Schema.NullOr(Schema.String)),
}) {}
export namespace CapturePayload {
  export type Encoded = Schema.Codec.Encoded<typeof CapturePayload>
}

export class SavedItemReadStatePayload extends Schema.Class<SavedItemReadStatePayload>(
  "SavedItemReadStatePayload",
)({
  isRead: Schema.Boolean,
}) {}
export namespace SavedItemReadStatePayload {
  export type Encoded = Schema.Codec.Encoded<typeof SavedItemReadStatePayload>
}

export class SavedItemsQuery extends Schema.Class<SavedItemsQuery>("SavedItemsQuery")({
  sort: Schema.optional(SavedItemSort),
  folder: Schema.optional(Schema.String),
}) {}
export namespace SavedItemsQuery {
  export type Encoded = Schema.Codec.Encoded<typeof SavedItemsQuery>
}

export class FolderNamePayload extends Schema.Class<FolderNamePayload>("FolderNamePayload")({
  name: Schema.String,
  emoji: Schema.optional(Schema.NullOr(Schema.String)),
  color: Schema.optional(Schema.NullOr(Schema.String)),
}) {}
export namespace FolderNamePayload {
  export type Encoded = Schema.Codec.Encoded<typeof FolderNamePayload>
}

export class FolderAssignmentPayload extends Schema.Class<FolderAssignmentPayload>("FolderAssignmentPayload")({
  folderId: Schema.NullOr(Schema.String),
}) {}
export namespace FolderAssignmentPayload {
  export type Encoded = Schema.Codec.Encoded<typeof FolderAssignmentPayload>
}

export class HandlePayload extends Schema.Class<HandlePayload>("HandlePayload")({
  handle: Schema.String,
}) {}
export namespace HandlePayload {
  export type Encoded = Schema.Codec.Encoded<typeof HandlePayload>
}

export class ProfileVisibilityPayload extends Schema.Class<ProfileVisibilityPayload>(
  "ProfileVisibilityPayload",
)({
  visibility: ProfileVisibility,
}) {}
export namespace ProfileVisibilityPayload {
  export type Encoded = Schema.Codec.Encoded<typeof ProfileVisibilityPayload>
}

export class HandleAvailabilityQuery extends Schema.Class<HandleAvailabilityQuery>(
  "HandleAvailabilityQuery",
)({
  handle: Schema.String,
}) {}
export namespace HandleAvailabilityQuery {
  export type Encoded = Schema.Codec.Encoded<typeof HandleAvailabilityQuery>
}

// ─── Error shapes ───────────────────────────────────────────────────────────

export class Unauthorized extends Schema.ErrorClass<Unauthorized>("Unauthorized")({
  _tag: Schema.tag("Unauthorized"),
  message: Schema.String,
}, { httpApiStatus: 401 }) {}
export namespace Unauthorized {
  export type Encoded = Schema.Codec.Encoded<typeof Unauthorized>
}

export class RateLimitExceeded extends Schema.ErrorClass<RateLimitExceeded>("RateLimitExceeded")({
  _tag: Schema.tag("RateLimitExceeded"),
  message: Schema.String,
}, { httpApiStatus: 429 }) {}
export namespace RateLimitExceeded {
  export type Encoded = Schema.Codec.Encoded<typeof RateLimitExceeded>
}

export class InvalidUrlError extends Schema.ErrorClass<InvalidUrlError>("InvalidUrlError")({
  _tag: Schema.tag("InvalidUrlError"),
  message: Schema.String,
  url: Schema.String,
}, { httpApiStatus: 400 }) {}
export namespace InvalidUrlError {
  export type Encoded = Schema.Codec.Encoded<typeof InvalidUrlError>
}

export class SavedItemNotFoundError extends Schema.ErrorClass<SavedItemNotFoundError>(
  "SavedItemNotFoundError",
)({
  _tag: Schema.tag("SavedItemNotFoundError"),
  message: Schema.String,
  savedItemId: Schema.String,
}, { httpApiStatus: 404 }) {}
export namespace SavedItemNotFoundError {
  export type Encoded = Schema.Codec.Encoded<typeof SavedItemNotFoundError>
}

export class InvalidFolderNameError extends Schema.ErrorClass<InvalidFolderNameError>("InvalidFolderNameError")({
  _tag: Schema.tag("InvalidFolderNameError"),
  message: Schema.String,
}, { httpApiStatus: 400 }) {}
export namespace InvalidFolderNameError {
  export type Encoded = Schema.Codec.Encoded<typeof InvalidFolderNameError>
}

export class FolderNotFoundError extends Schema.ErrorClass<FolderNotFoundError>("FolderNotFoundError")({
  _tag: Schema.tag("FolderNotFoundError"),
  message: Schema.String,
  folderId: Schema.String,
}, { httpApiStatus: 404 }) {}
export namespace FolderNotFoundError {
  export type Encoded = Schema.Codec.Encoded<typeof FolderNotFoundError>
}

export class FolderNameConflictError extends Schema.ErrorClass<FolderNameConflictError>("FolderNameConflictError")({
  _tag: Schema.tag("FolderNameConflictError"),
  message: Schema.String,
}, { httpApiStatus: 409 }) {}
export namespace FolderNameConflictError {
  export type Encoded = Schema.Codec.Encoded<typeof FolderNameConflictError>
}

export class InvalidHandleError extends Schema.ErrorClass<InvalidHandleError>("InvalidHandleError")({
  _tag: Schema.tag("InvalidHandleError"),
  message: Schema.String,
}, { httpApiStatus: 400 }) {}
export namespace InvalidHandleError {
  export type Encoded = Schema.Codec.Encoded<typeof InvalidHandleError>
}

export class HandleConflictError extends Schema.ErrorClass<HandleConflictError>("HandleConflictError")({
  _tag: Schema.tag("HandleConflictError"),
  message: Schema.String,
}, { httpApiStatus: 409 }) {}
export namespace HandleConflictError {
  export type Encoded = Schema.Codec.Encoded<typeof HandleConflictError>
}

export class ProfileNotFoundError extends Schema.ErrorClass<ProfileNotFoundError>("ProfileNotFoundError")({
  _tag: Schema.tag("ProfileNotFoundError"),
  message: Schema.String,
}, { httpApiStatus: 404 }) {}
export namespace ProfileNotFoundError {
  export type Encoded = Schema.Codec.Encoded<typeof ProfileNotFoundError>
}

export type ApiErrorEncoded =
  | Unauthorized.Encoded
  | RateLimitExceeded.Encoded
  | InvalidUrlError.Encoded
  | SavedItemNotFoundError.Encoded
  | InvalidFolderNameError.Encoded
  | FolderNotFoundError.Encoded
  | FolderNameConflictError.Encoded
  | InvalidHandleError.Encoded
  | HandleConflictError.Encoded
  | ProfileNotFoundError.Encoded
