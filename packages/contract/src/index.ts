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
  "public-profile",
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
  // A Private Saved Item is withheld from the Public Profile.
  isPrivate: Schema.Boolean,
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
  // Every Saved Item inside a Private Folder is withheld from the Public Profile.
  isPrivate: Schema.Boolean,
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

// The public half of a Public Profile: everything an anonymous visitor may read
// for a Handle. Identity is the Handle alone — no display name, no biography,
// and no avatar. `isIndexable` carries the search-indexing decision as a value
// the API computed, so the web layer renders a robots directive from a boolean
// and owns no part of the rule.
export class PublicProfileDto extends Schema.Class<PublicProfileDto>("PublicProfileDto")({
  handle: Schema.String,
  joinedAt: Schema.DateFromString,
  publicSavedItemCount: Schema.Number,
  isIndexable: Schema.Boolean,
}) {}
export namespace PublicProfileDto {
  export type Encoded = Schema.Codec.Encoded<typeof PublicProfileDto>
}

// One day of Reading Activity: how many first captures the Account made on that
// UTC calendar day. The day crosses the wire as a plain `YYYY-MM-DD` string and
// not as a timestamp, because the bucket is a UTC day for every visitor alike
// and a timestamp would invite a client to re-bucket it in a local timezone.
export class ReadingActivityDay extends Schema.Class<ReadingActivityDay>("ReadingActivityDay")({
  date: Schema.String,
  count: Schema.Number,
}) {}
export namespace ReadingActivityDay {
  export type Encoded = Schema.Codec.Encoded<typeof ReadingActivityDay>
}

// Reading Activity for one Public Profile over a rolling 52 weeks. `from` and
// `to` are the inclusive UTC bounds of that window, so the grid knows which
// cells to draw; `days` carries only the days inside it that have at least one
// save, and a day absent from `days` has none. Counts are first captures only,
// and they include Saved Items the item list withholds — see ADR 0016.
export class ReadingActivityResponse extends Schema.Class<ReadingActivityResponse>(
  "ReadingActivityResponse",
)({
  handle: Schema.String,
  from: Schema.String,
  to: Schema.String,
  days: Schema.Array(ReadingActivityDay),
}) {}
export namespace ReadingActivityResponse {
  export type Encoded = Schema.Codec.Encoded<typeof ReadingActivityResponse>
}

// One published Saved Item, defined as an allow-list instead of a projection of
// SavedItemDto. Only these properties may reach an anonymous visitor: Original
// URL, host, title, favicon variants, image, Type, Tags, Preview Summary, and
// the save date. The Folder, the Source name, the Capture Channel, the Read
// State, the Saved Item identifier, and the update timestamps are withheld.
// Reusing SavedItemDto is rejected on purpose: the private representation keeps
// growing, and every field added to it later would publish itself by default.
// The contract test asserts this property list exactly, so widening it can only
// happen deliberately.
export class PublicSavedItemDto extends Schema.Class<PublicSavedItemDto>("PublicSavedItemDto")({
  originalUrl: Schema.String,
  host: Schema.String,
  title: Schema.optional(Schema.String),
  faviconUrl: Schema.optional(Schema.String),
  faviconLightUrl: Schema.optional(Schema.String),
  faviconDarkUrl: Schema.optional(Schema.String),
  imageUrl: Schema.optional(Schema.String),
  type: LinkType,
  tags: Schema.Array(Topic),
  previewSummary: Schema.optional(Schema.String),
  // The Saved Item creation time, not Last Saved At: a Duplicate Save must not
  // reorder a published page.
  savedAt: Schema.DateFromString,
}) {}
export namespace PublicSavedItemDto {
  export type Encoded = Schema.Codec.Encoded<typeof PublicSavedItemDto>
}

// One page of a Public Profile's Saved Items. Pages carry their own number and
// the total, because a Public Profile is addressed by page number rather than by
// cursor: every page must be a real URL a crawler can reach.
export class PublicSavedItemsResponse extends Schema.Class<PublicSavedItemsResponse>(
  "PublicSavedItemsResponse",
)({
  savedItems: Schema.Array(PublicSavedItemDto),
  page: Schema.Number,
  pageSize: Schema.Number,
  totalPages: Schema.Number,
}) {}
export namespace PublicSavedItemsResponse {
  export type Encoded = Schema.Codec.Encoded<typeof PublicSavedItemsResponse>
}

export class PublicSavedItemsQuery extends Schema.Class<PublicSavedItemsQuery>(
  "PublicSavedItemsQuery",
)({
  // Omitted means the first page.
  page: Schema.optional(Schema.FiniteFromString),
}) {}
export namespace PublicSavedItemsQuery {
  export type Encoded = Schema.Codec.Encoded<typeof PublicSavedItemsQuery>
}

// One Public Profile a search engine may be offered. The Handle is the whole
// address — a Public Profile lives at /u/{handle} — and `lastModifiedAt` is when
// that page last changed, which is the creation time of the newest Saved Item it
// publishes. A profile that is public but not yet indexable is absent, so a
// caller lists what it finds here and decides nothing itself.
export class IndexableProfileDto extends Schema.Class<IndexableProfileDto>(
  "IndexableProfileDto",
)({
  handle: Schema.String,
  lastModifiedAt: Schema.DateFromString,
}) {}
export namespace IndexableProfileDto {
  export type Encoded = Schema.Codec.Encoded<typeof IndexableProfileDto>
}

// One page of indexable Handles. Paged like the published Saved Items of a
// single Handle, and for the same reason: the caller is a crawler-facing
// document builder that must be able to walk the whole list by number.
export class IndexableProfilesResponse extends Schema.Class<IndexableProfilesResponse>(
  "IndexableProfilesResponse",
)({
  profiles: Schema.Array(IndexableProfileDto),
  page: Schema.Number,
  pageSize: Schema.Number,
  totalPages: Schema.Number,
}) {}
export namespace IndexableProfilesResponse {
  export type Encoded = Schema.Codec.Encoded<typeof IndexableProfilesResponse>
}

export class IndexableProfilesQuery extends Schema.Class<IndexableProfilesQuery>(
  "IndexableProfilesQuery",
)({
  // Omitted means the first page.
  page: Schema.optional(Schema.FiniteFromString),
}) {}
export namespace IndexableProfilesQuery {
  export type Encoded = Schema.Codec.Encoded<typeof IndexableProfilesQuery>
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
  // Omitted on a first capture the Saved Item is public. Omitted on a
  // Duplicate Save the current value is kept; see CaptureServiceStore.
  isPrivate: Schema.optional(Schema.Boolean),
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

// The Saved Item half of publishing: one flag per item, set by its own action.
// Profile Visibility (public or private) is the Account setting and keeps its
// own payload.
export class SavedItemPrivacyPayload extends Schema.Class<SavedItemPrivacyPayload>(
  "SavedItemPrivacyPayload",
)({
  isPrivate: Schema.Boolean,
}) {}
export namespace SavedItemPrivacyPayload {
  export type Encoded = Schema.Codec.Encoded<typeof SavedItemPrivacyPayload>
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

// The Folder update payload. A Folder is a resource with fields, so it takes a
// widened PATCH instead of one endpoint per field. Every field is optional, so
// a name-only caller keeps working unchanged and an omitted field is left as it
// is. Creating a Folder keeps FolderNamePayload, where a name is required.
export class FolderUpdatePayload extends Schema.Class<FolderUpdatePayload>("FolderUpdatePayload")({
  name: Schema.optional(Schema.String),
  emoji: Schema.optional(Schema.NullOr(Schema.String)),
  color: Schema.optional(Schema.NullOr(Schema.String)),
  isPrivate: Schema.optional(Schema.Boolean),
}) {}
export namespace FolderUpdatePayload {
  export type Encoded = Schema.Codec.Encoded<typeof FolderUpdatePayload>
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

// The single not-found answer of the public group. An unknown Handle and a
// Handle whose Profile Visibility is private both get this exact response, so
// the API never discloses which Handles exist. It carries no Handle field for
// the same reason: the body must not vary with the request.
export class PublicProfileNotFoundError extends Schema.ErrorClass<PublicProfileNotFoundError>(
  "PublicProfileNotFoundError",
)({
  _tag: Schema.tag("PublicProfileNotFoundError"),
  message: Schema.String,
}, { httpApiStatus: 404 }) {}
export namespace PublicProfileNotFoundError {
  export type Encoded = Schema.Codec.Encoded<typeof PublicProfileNotFoundError>
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
  | PublicProfileNotFoundError.Encoded
