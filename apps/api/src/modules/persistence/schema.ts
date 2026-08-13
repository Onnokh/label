import { defineRelations, sql } from "drizzle-orm"
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

import {
  captureChannels,
  enrichmentStatuses,
  linkTypes,
  profileVisibilities,
} from "@sleevy/contract"
import type {
  CaptureChannel,
  EnrichmentStatus,
  LinkType,
  SavedItemId,
  SourceId,
  FolderId,
  LinkId,
  UserId,
} from "../../domain/SavedItem.js"
import type { ProfileId, ProfileVisibility } from "../../domain/Profile.js"
import type {
  EnrichmentJobId,
  EnrichmentJobStatus,
} from "../../domain/EnrichmentJob.js"
import {
  account,
  apikey,
  jwks,
  oauthAccessToken,
  oauthClient,
  oauthConsent,
  oauthRefreshToken,
  session,
  user,
  verification,
} from "./better-auth.generated.js"

export {
  account,
  apikey,
  jwks,
  oauthAccessToken,
  oauthClient,
  oauthConsent,
  oauthRefreshToken,
  session,
  user,
  verification,
}

export const enrichmentStatusEnum = pgEnum("enrichment_status", enrichmentStatuses)

export const linkTypeEnum = pgEnum("link_type", linkTypes)

export const captureChannelEnum = pgEnum("capture_channel", captureChannels)

export const profileVisibilityEnum = pgEnum("profile_visibility", profileVisibilities)

export const enrichmentJobStatusEnum = pgEnum("enrichment_job_status", [
  "queued",
  "running",
  "succeeded",
  "partial",
  "failed",
])

export const linksTable = pgTable(
  "links",
  {
    id: text("id")
      .$type<LinkId>()
      .primaryKey()
      .$defaultFn(() => randomUUID() as LinkId),
    originalUrl: text("original_url").notNull(),
    normalizedUrl: text("normalized_url").notNull(),
    host: text("host").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("links_normalized_url_unique").on(table.normalizedUrl),
    index("links_host_idx").on(table.host),
  ],
)

export const linkMetadataTable = pgTable("link_metadata", {
  linkId: text("link_id")
    .$type<LinkId>()
    .primaryKey()
    .references(() => linksTable.id, { onDelete: "cascade" }),
  title: text("title"),
  description: text("description"),
  siteName: text("site_name"),
  faviconUrl: text("favicon_url"),
  faviconLightUrl: text("favicon_light_url"),
  faviconDarkUrl: text("favicon_dark_url"),
  imageUrl: text("image_url"),
  canonicalUrl: text("canonical_url"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const linkEnrichmentTable = pgTable(
  "link_enrichment",
  {
    linkId: text("link_id")
      .$type<LinkId>()
      .primaryKey()
      .references(() => linksTable.id, { onDelete: "cascade" }),
    previewSummary: text("preview_summary"),
    type: linkTypeEnum("type")
      .$type<LinkType>()
      .notNull()
      .default("website"),
    tags: text("tags").array().notNull().default([]),
    status: enrichmentStatusEnum("status")
      .$type<EnrichmentStatus>()
      .notNull()
      .default("pending"),
    enrichedAt: timestamp("enriched_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("link_enrichment_type_idx").on(table.type),
    index("link_enrichment_status_idx").on(table.status),
  ],
)

export const sourcesTable = pgTable(
  "sources",
  {
    id: text("id")
      .$type<SourceId>()
      .primaryKey()
      .$defaultFn(() => randomUUID() as SourceId),
    userId: text("user_id")
      .$type<UserId>()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("sources_user_name_unique").on(table.userId, table.name),
  ],
)

export const foldersTable = pgTable(
  "folders",
  {
    id: text("id")
      .$type<FolderId>()
      .primaryKey()
      .$defaultFn(() => randomUUID() as FolderId),
    userId: text("user_id")
      .$type<UserId>()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    emoji: text("emoji"),
    color: text("color"),
    // A Private Folder withholds every Saved Item inside it from the Public
    // Profile. Public by default, so existing Folders keep their meaning.
    isPrivate: boolean("is_private").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("folders_user_name_lower_unique").on(table.userId, sql`lower(${table.name})`),
  ],
)

// One Public Profile record per Account. The Handle lives here rather than on
// the Better Auth user because it is a product identifier, not a credential.
// Handles are stored lowercase; the lower() index keeps two Accounts from
// holding Handles that differ only by case, the same way Folder names work.
export const profilesTable = pgTable(
  "profiles",
  {
    id: text("id")
      .$type<ProfileId>()
      .primaryKey()
      .$defaultFn(() => randomUUID() as ProfileId),
    userId: text("user_id")
      .$type<UserId>()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    handle: text("handle").notNull(),
    visibility: profileVisibilityEnum("visibility")
      .$type<ProfileVisibility>()
      .notNull()
      .default("private"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("profiles_user_id_unique").on(table.userId),
    uniqueIndex("profiles_handle_lower_unique").on(sql`lower(${table.handle})`),
  ],
)

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
    linkId: text("link_id")
      .$type<LinkId>()
      .notNull()
      .references(() => linksTable.id, { onDelete: "cascade" }),
    sourceId: text("source_id")
      .$type<SourceId>()
      .references(() => sourcesTable.id, { onDelete: "set null" }),
    folderId: text("folder_id")
      .$type<FolderId>()
      .references(() => foldersTable.id, { onDelete: "set null" }),
    captureChannel: captureChannelEnum("capture_channel").$type<CaptureChannel>(),
    tags: text("tags").array().notNull().default([]),
    isRead: boolean("is_read").notNull().default(false),
    // A Private Saved Item is withheld from the Public Profile. Public by
    // default, so existing Saved Items keep their meaning.
    isPrivate: boolean("is_private").notNull().default(false),
    lastSavedAt: timestamp("last_saved_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("saved_items_user_link_unique").on(
      table.userId,
      table.linkId,
    ),
    index("saved_items_user_last_saved_at_idx").on(
      table.userId,
      table.lastSavedAt,
    ),
    index("saved_items_user_folder_id_idx").on(table.userId, table.folderId),
  ],
)

export const connectCodesTable = pgTable(
  "connect_codes",
  {
    code: text("code").primaryKey(),
    userId: text("user_id")
      .$type<UserId>()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    client: text("client").notNull(),
    scopes: text("scopes").array().notNull(),
    label: text("label").notNull(),
    deviceHint: text("device_hint"),
    codeChallenge: text("code_challenge").notNull(),
    redirectUri: text("redirect_uri").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
  },
  (table) => [
    index("connect_codes_expires_at_idx").on(table.expiresAt),
  ],
)

export const enrichmentJobsTable = pgTable("enrichment_jobs", {
  id: text("id")
    .$type<EnrichmentJobId>()
    .primaryKey()
    .$defaultFn(() => randomUUID() as EnrichmentJobId),
  linkId: text("link_id")
    .$type<LinkId>()
    .notNull()
    .references(() => linksTable.id, { onDelete: "cascade" }),
  attempt: integer("attempt").notNull(),
  status: enrichmentJobStatusEnum("status").$type<EnrichmentJobStatus>().notNull(),
  stagesJson: jsonb("stages_json").notNull().default([]),
  queuedAt: timestamp("queued_at", { withTimezone: true }).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
})

export const relationalSchema = {
  user,
  session,
  account,
  verification,
  apikey,
  jwks,
  oauthClient,
  oauthRefreshToken,
  oauthAccessToken,
  oauthConsent,
  links: linksTable,
  linkMetadata: linkMetadataTable,
  linkEnrichment: linkEnrichmentTable,
  sources: sourcesTable,
  folders: foldersTable,
  profiles: profilesTable,
  savedItems: savedItemsTable,
  enrichmentJobs: enrichmentJobsTable,
} as const

export const relations = defineRelations(relationalSchema, (r) => ({
  links: {
    metadata: r.one.linkMetadata({
      from: r.links.id,
      to: r.linkMetadata.linkId,
      optional: false,
    }),
    enrichment: r.one.linkEnrichment({
      from: r.links.id,
      to: r.linkEnrichment.linkId,
      optional: false,
    }),
    savedItems: r.many.savedItems({
      from: r.links.id,
      to: r.savedItems.linkId,
    }),
    enrichmentJobs: r.many.enrichmentJobs({
      from: r.links.id,
      to: r.enrichmentJobs.linkId,
    }),
  },
  linkMetadata: {
    link: r.one.links({
      from: r.linkMetadata.linkId,
      to: r.links.id,
      optional: false,
    }),
  },
  linkEnrichment: {
    link: r.one.links({
      from: r.linkEnrichment.linkId,
      to: r.links.id,
      optional: false,
    }),
  },
  sources: {
    savedItems: r.many.savedItems({
      from: r.sources.id,
      to: r.savedItems.sourceId,
    }),
  },
  folders: {
    savedItems: r.many.savedItems({
      from: r.folders.id,
      to: r.savedItems.folderId,
    }),
  },
  savedItems: {
    link: r.one.links({
      from: r.savedItems.linkId,
      to: r.links.id,
      optional: false,
    }),
    source: r.one.sources({
      from: r.savedItems.sourceId,
      to: r.sources.id,
      optional: true,
    }),
    folder: r.one.folders({
      from: r.savedItems.folderId,
      to: r.folders.id,
      optional: true,
    }),
  },
  enrichmentJobs: {
    link: r.one.links({
      from: r.enrichmentJobs.linkId,
      to: r.links.id,
      optional: false,
    }),
  },
}))

// Keys double as Better Auth model names — the drizzle adapter resolves
// tables via schema[model], so every table a Better Auth plugin touches
// must be listed here under its model name.
export const schema = {
  user,
  session,
  account,
  verification,
  apikey,
  jwks,
  oauthClient,
  oauthAccessToken,
  oauthRefreshToken,
  oauthConsent,
  linksTable,
  linkMetadataTable,
  linkEnrichmentTable,
  sourcesTable,
  foldersTable,
  profilesTable,
  savedItemsTable,
  enrichmentJobsTable,
  connectCodesTable,
}
