CREATE TYPE "enrichment_job_status" AS ENUM('queued', 'running', 'succeeded', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "enrichment_status" AS ENUM('pending', 'enriched', 'failed');--> statement-breakpoint
CREATE TYPE "generated_type" AS ENUM('article', 'video', 'website', 'repository', 'unknown');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apikey" (
	"id" text PRIMARY KEY,
	"config_id" text NOT NULL,
	"name" text,
	"start" text,
	"reference_id" text NOT NULL,
	"prefix" text,
	"key" text NOT NULL,
	"refill_interval" integer,
	"refill_amount" integer,
	"last_refill_at" timestamp with time zone,
	"enabled" boolean DEFAULT true,
	"rate_limit_enabled" boolean DEFAULT true,
	"rate_limit_time_window" integer,
	"rate_limit_max" integer,
	"request_count" integer DEFAULT 0,
	"remaining" integer,
	"last_request" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"permissions" text,
	"metadata" text
);
--> statement-breakpoint
CREATE TABLE "enrichment_jobs" (
	"id" text PRIMARY KEY,
	"saved_item_id" text NOT NULL,
	"attempt" integer NOT NULL,
	"status" "enrichment_job_status" NOT NULL,
	"stages_json" jsonb DEFAULT '[]' NOT NULL,
	"queued_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "saved_items" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"original_url" text NOT NULL,
	"normalized_url" text NOT NULL,
	"host" text NOT NULL,
	"title" text,
	"description" text,
	"site_name" text,
	"image_url" text,
	"canonical_url" text,
	"preview_summary" text,
	"generated_type" "generated_type",
	"generated_topics" jsonb DEFAULT '[]' NOT NULL,
	"enrichment_status" "enrichment_status" DEFAULT 'pending'::"enrichment_status" NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"last_saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean NOT NULL,
	"image" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" ("user_id");--> statement-breakpoint
CREATE INDEX "apikey_config_id_idx" ON "apikey" ("config_id");--> statement-breakpoint
CREATE INDEX "apikey_reference_id_idx" ON "apikey" ("reference_id");--> statement-breakpoint
CREATE INDEX "apikey_key_idx" ON "apikey" ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_items_user_normalized_url_unique" ON "saved_items" ("user_id","normalized_url");--> statement-breakpoint
CREATE INDEX "saved_items_user_last_saved_at_idx" ON "saved_items" ("user_id","last_saved_at");--> statement-breakpoint
CREATE UNIQUE INDEX "session_token_unique" ON "session" ("token");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_unique" ON "user" ("email");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "enrichment_jobs" ADD CONSTRAINT "enrichment_jobs_saved_item_id_saved_items_id_fkey" FOREIGN KEY ("saved_item_id") REFERENCES "saved_items"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "saved_items" ADD CONSTRAINT "saved_items_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;