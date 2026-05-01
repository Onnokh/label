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

import type { AccountId, EnrichmentStatus, GeneratedType, SavedItemId } from "../../domain/SavedItem.js"
import type { CaptureTokenId } from "../../domain/Account.js"
import type {
  EnrichmentJobId,
  EnrichmentJobStatus,
} from "../../domain/EnrichmentJob.js"

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

export const accountsTable = pgTable(
  "accounts",
  {
    id: text("id")
      .$type<AccountId>()
      .primaryKey()
      .$defaultFn(() => randomUUID() as AccountId),
    googleSubject: text("google_subject").notNull(),
    email: text("email").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    googleSubjectUnique: uniqueIndex("accounts_google_subject_unique").on(table.googleSubject),
    emailUnique: uniqueIndex("accounts_email_unique").on(table.email),
  }),
)

export const captureTokensTable = pgTable(
  "capture_tokens",
  {
    id: text("id")
      .$type<CaptureTokenId>()
      .primaryKey()
      .$defaultFn(() => randomUUID() as CaptureTokenId),
    accountId: text("account_id")
      .$type<AccountId>()
      .notNull()
      .references(() => accountsTable.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    regeneratedAt: timestamp("regenerated_at", { withTimezone: true }),
  },
  (table) => ({
    oneTokenPerAccount: uniqueIndex("capture_tokens_account_id_unique").on(table.accountId),
    tokenHashUnique: uniqueIndex("capture_tokens_token_hash_unique").on(table.tokenHash),
  }),
)

export const savedItemsTable = pgTable(
  "saved_items",
  {
    id: text("id")
      .$type<SavedItemId>()
      .primaryKey()
      .$defaultFn(() => randomUUID() as SavedItemId),
    accountId: text("account_id")
      .$type<AccountId>()
      .notNull()
      .references(() => accountsTable.id, { onDelete: "cascade" }),
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
    accountNormalizedUrlUnique: uniqueIndex("saved_items_account_normalized_url_unique").on(
      table.accountId,
      table.normalizedUrl,
    ),
    accountLastSavedAtIdx: index("saved_items_account_last_saved_at_idx").on(
      table.accountId,
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
  accountsTable,
  captureTokensTable,
  savedItemsTable,
  enrichmentJobsTable,
}
