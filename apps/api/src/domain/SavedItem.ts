import { Schema } from "effect"
import {
  CaptureChannel,
  EnrichmentStatus,
  LinkType,
  Topic,
} from "@sleevy/contract"

// Re-export the contract's enum schemas so domain consumers keep their existing
// import path. The source of truth lives in @sleevy/contract.
export { CaptureChannel, EnrichmentStatus, LinkType, Topic }

// Branded IDs are internal to the API: they enforce identifier discipline
// inside the server. On the wire (and in @sleevy/contract) IDs are plain strings.

export const SavedItemId = Schema.String.pipe(Schema.brand("SavedItemId"))
export type SavedItemId = typeof SavedItemId.Type

export const LinkId = Schema.String.pipe(Schema.brand("LinkId"))
export type LinkId = typeof LinkId.Type

export const UserId = Schema.String.pipe(Schema.brand("UserId"))
export type UserId = typeof UserId.Type

export const SourceId = Schema.String.pipe(Schema.brand("SourceId"))
export type SourceId = typeof SourceId.Type

export const FolderId = Schema.String.pipe(Schema.brand("FolderId"))
export type FolderId = typeof FolderId.Type

export class Link extends Schema.Class<Link>("Link")({
  id: LinkId,
  originalUrl: Schema.String,
  normalizedUrl: Schema.String,
  host: Schema.String,
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
}) {}

export class LinkMetadata extends Schema.Class<LinkMetadata>("LinkMetadata")({
  linkId: LinkId,
  title: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  siteName: Schema.optional(Schema.String),
  faviconUrl: Schema.optional(Schema.String),
  faviconLightUrl: Schema.optional(Schema.String),
  faviconDarkUrl: Schema.optional(Schema.String),
  imageUrl: Schema.optional(Schema.String),
  canonicalUrl: Schema.optional(Schema.String),
  fetchedAt: Schema.Date,
  updatedAt: Schema.Date,
}) {}

export class LinkEnrichment extends Schema.Class<LinkEnrichment>("LinkEnrichment")({
  linkId: LinkId,
  previewSummary: Schema.optional(Schema.String),
  type: LinkType,
  tags: Schema.Array(Topic),
  status: EnrichmentStatus,
  enrichedAt: Schema.optional(Schema.Date),
  updatedAt: Schema.Date,
}) {}

export class Source extends Schema.Class<Source>("Source")({
  id: SourceId,
  userId: UserId,
  name: Schema.String,
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
}) {}

export class Folder extends Schema.Class<Folder>("Folder")({
  id: FolderId,
  userId: UserId,
  name: Schema.String,
  emoji: Schema.NullOr(Schema.String),
  color: Schema.NullOr(Schema.String),
  isPrivate: Schema.Boolean,
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
}) {}

export class SavedItem extends Schema.Class<SavedItem>("SavedItem")({
  id: SavedItemId,
  userId: UserId,
  linkId: LinkId,
  sourceId: Schema.optional(SourceId),
  folderId: Schema.optional(FolderId),
  captureChannel: Schema.optional(CaptureChannel),
  tags: Schema.Array(Topic),
  isRead: Schema.Boolean,
  isPrivate: Schema.Boolean,
  lastSavedAt: Schema.Date,
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
}) {}

export type SavedItemWithLink = {
  readonly savedItem: SavedItem
  readonly link: Link
  readonly metadata: LinkMetadata
  readonly enrichment: LinkEnrichment
  readonly source?: Source
  readonly folder?: Folder
}
