import { randomUUID } from "node:crypto";

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import type { SavedItemId } from "../../domain/SavedItem.js";
import type { CapturedLinkId } from "../../domain/CapturedLink.js";
import type {
  EnrichmentJobId,
  EnrichmentJobStatus,
} from "../../domain/EnrichmentJob.js";

export const savedItemsTable = sqliteTable("saved_items", {
  id: text("id")
    .$type<SavedItemId>()
    .primaryKey()
    .$defaultFn(() => randomUUID() as SavedItemId),
  url: text("url").notNull().unique(),
  host: text("host").notNull(),
  title: text("title"),
  description: text("description"),
  siteName: text("site_name"),
  imageUrl: text("image_url"),
  canonicalUrl: text("canonical_url"),
  summary: text("summary"),
  extractedContent: text("extracted_content"),
  excerpt: text("excerpt"),
  wordCount: integer("word_count"),
  extractedAt: integer("extracted_at", { mode: "timestamp_ms" }),
  categoriesJson: text("categories_json").notNull().default("[]"),
  isRead: integer("is_read", { mode: "boolean" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const capturedLinksTable = sqliteTable("captured_links", {
  id: text("id").$type<CapturedLinkId>().primaryKey(),
  savedItemId: text("saved_item_id")
    .$type<SavedItemId>()
    .notNull()
    .references(() => savedItemsTable.id, { onDelete: "cascade" }),
  url: text("url").notNull().unique(),
  capturedAt: integer("captured_at", { mode: "timestamp_ms" }).notNull(),
});

export const enrichmentJobsTable = sqliteTable("enrichment_jobs", {
  id: text("id").$type<EnrichmentJobId>().primaryKey(),
  savedItemId: text("saved_item_id")
    .$type<SavedItemId>()
    .notNull()
    .references(() => savedItemsTable.id, { onDelete: "cascade" }),
  attempt: integer("attempt").notNull(),
  status: text("status").$type<EnrichmentJobStatus>().notNull(),
  stagesJson: text("stages_json").notNull().default("[]"),
  queuedAt: integer("queued_at", { mode: "timestamp_ms" }).notNull(),
  startedAt: integer("started_at", { mode: "timestamp_ms" }),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
});

export const schema = {
  savedItemsTable,
  capturedLinksTable,
  enrichmentJobsTable,
};
