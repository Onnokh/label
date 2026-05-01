import { randomUUID } from "node:crypto"

import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

import type { EnrichmentStatus, GeneratedType, SavedItemId, UserId } from "../../domain/SavedItem.js"
import type {
  EnrichmentJobId,
  EnrichmentJobStatus,
} from "../../domain/EnrichmentJob.js"
import {
  account,
  apikey,
  session,
  user,
  verification,
} from "./better-auth.generated.js"

export { account, apikey, session, user, verification }

export const enrichmentStatusEnum = pgEnum("enrichment_status", [
  "pending",
  "enriched",
  "failed",
])

export const generatedTypeEnum = pgEnum("generated_type", [
  "article",
  "video",
  "website",
  "repository",
  "unknown",
])

export const enrichmentJobStatusEnum = pgEnum("enrichment_job_status", [
  "queued",
  "running",
  "succeeded",
  "partial",
  "failed",
])

export const savedItemsTable = pgTable(
  "saved_items",
  {
    id: text("id")
      .$type<SavedItemId>()
      .primaryKey()
      .$defaultFn(() => randomUUID() as SavedItemId),
    userId: text("user_id")
      .$type<UserId>()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    originalUrl: text("original_url").notNull(),
    normalizedUrl: text("normalized_url").notNull(),
    host: text("host").notNull(),
    title: text("title"),
    description: text("description"),
    siteName: text("site_name"),
    imageUrl: text("image_url"),
    canonicalUrl: text("canonical_url"),
    previewSummary: text("preview_summary"),
    generatedType: generatedTypeEnum("generated_type").$type<GeneratedType>(),
    generatedTopics: jsonb("generated_topics").$type<readonly string[]>().notNull().default([]),
    enrichmentStatus: enrichmentStatusEnum("enrichment_status")
      .$type<EnrichmentStatus>()
      .notNull()
      .default("pending"),
    isRead: boolean("is_read").notNull().default(false),
    lastSavedAt: timestamp("last_saved_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userNormalizedUrlUnique: uniqueIndex("saved_items_user_normalized_url_unique").on(
      table.userId,
      table.normalizedUrl,
    ),
    userLastSavedAtIdx: index("saved_items_user_last_saved_at_idx").on(
      table.userId,
      table.lastSavedAt,
    ),
  }),
)

export const enrichmentJobsTable = pgTable("enrichment_jobs", {
  id: text("id")
    .$type<EnrichmentJobId>()
    .primaryKey()
    .$defaultFn(() => randomUUID() as EnrichmentJobId),
  savedItemId: text("saved_item_id")
    .$type<SavedItemId>()
    .notNull()
    .references(() => savedItemsTable.id, { onDelete: "cascade" }),
  attempt: integer("attempt").notNull(),
  status: enrichmentJobStatusEnum("status").$type<EnrichmentJobStatus>().notNull(),
  stagesJson: jsonb("stages_json").notNull().default([]),
  queuedAt: timestamp("queued_at", { withTimezone: true }).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
})

export const schema = {
  user,
  session,
  account,
  verification,
  apikey,
  savedItemsTable,
  enrichmentJobsTable,
}
