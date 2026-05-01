import { Schema } from "effect";

export const SavedItemId = Schema.String.pipe(Schema.brand("SavedItemId"));
export type SavedItemId = typeof SavedItemId.Type;

export class SavedItem extends Schema.Class<SavedItem>("SavedItem")({
  id: SavedItemId,
  url: Schema.String,
  host: Schema.String,
  title: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  siteName: Schema.optional(Schema.String),
  imageUrl: Schema.optional(Schema.String),
  canonicalUrl: Schema.optional(Schema.String),
  summary: Schema.optional(Schema.String),
  extractedContent: Schema.optional(Schema.String),
  excerpt: Schema.optional(Schema.String),
  wordCount: Schema.optional(Schema.Int),
  extractedAt: Schema.optional(Schema.Date),
  categories: Schema.Array(Schema.String),
  isRead: Schema.Boolean,
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
}) {}
