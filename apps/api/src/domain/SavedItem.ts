import { Schema } from "effect";

export const SavedItemId = Schema.String.pipe(Schema.brand("SavedItemId"));
export type SavedItemId = typeof SavedItemId.Type;

export const UserId = Schema.String.pipe(Schema.brand("UserId"));
export type UserId = typeof UserId.Type;

export const enrichmentStatuses = ["pending", "enriched", "failed"] as const;
export const EnrichmentStatus = Schema.Literals(enrichmentStatuses);
export type EnrichmentStatus = typeof EnrichmentStatus.Type;

export const generatedTypes = [
  "article",
  "video",
  "website",
  "repository",
  "unknown",
] as const;
export const GeneratedType = Schema.Literals(generatedTypes);
export type GeneratedType = typeof GeneratedType.Type;

export class SavedItem extends Schema.Class<SavedItem>("SavedItem")({
  id: SavedItemId,
  userId: UserId,
  originalUrl: Schema.String,
  normalizedUrl: Schema.String,
  host: Schema.String,
  title: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  siteName: Schema.optional(Schema.String),
  imageUrl: Schema.optional(Schema.String),
  canonicalUrl: Schema.optional(Schema.String),
  previewSummary: Schema.optional(Schema.String),
  generatedType: Schema.optional(GeneratedType),
  generatedTopics: Schema.Array(Schema.String),
  enrichmentStatus: EnrichmentStatus,
  isRead: Schema.Boolean,
  lastSavedAt: Schema.Date,
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
}) {}
