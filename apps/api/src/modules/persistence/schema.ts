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

export const userTable = pgTable(
  "user",
  {
    id: text("id").$type<UserId>().primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull(),
    image: text("image"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    emailUnique: uniqueIndex("user_email_unique").on(table.email),
  }),
)

export const sessionTable = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .$type<UserId>()
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
  },
  (table) => ({
    tokenUnique: uniqueIndex("session_token_unique").on(table.token),
    userIdIdx: index("session_user_id_idx").on(table.userId),
  }),
)

export const accountTable = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .$type<UserId>()
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    userIdIdx: index("account_user_id_idx").on(table.userId),
  }),
)

export const verificationTable = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => ({
    identifierIdx: index("verification_identifier_idx").on(table.identifier),
  }),
)

export const apikeyTable = pgTable(
  "apikey",
  {
    id: text("id").primaryKey(),
    configId: text("config_id").notNull(),
    name: text("name"),
    start: text("start"),
    referenceId: text("reference_id").notNull(),
    prefix: text("prefix"),
    key: text("key").notNull(),
    refillInterval: integer("refill_interval"),
    refillAmount: integer("refill_amount"),
    lastRefillAt: timestamp("last_refill_at", { withTimezone: true }),
    enabled: boolean("enabled").default(true),
    rateLimitEnabled: boolean("rate_limit_enabled").default(true),
    rateLimitTimeWindow: integer("rate_limit_time_window"),
    rateLimitMax: integer("rate_limit_max"),
    requestCount: integer("request_count").default(0),
    remaining: integer("remaining"),
    lastRequest: timestamp("last_request", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    permissions: text("permissions"),
    metadata: text("metadata"),
  },
  (table) => ({
    configIdIdx: index("apikey_config_id_idx").on(table.configId),
    referenceIdIdx: index("apikey_reference_id_idx").on(table.referenceId),
    keyIdx: index("apikey_key_idx").on(table.key),
  }),
)

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
      .references(() => userTable.id, { onDelete: "cascade" }),
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
  user: userTable,
  session: sessionTable,
  account: accountTable,
  verification: verificationTable,
  apikey: apikeyTable,
  savedItemsTable,
  enrichmentJobsTable,
}
