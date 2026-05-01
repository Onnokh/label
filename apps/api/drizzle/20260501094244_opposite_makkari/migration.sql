CREATE TYPE "enrichment_job_status" AS ENUM('queued', 'running', 'succeeded', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "enrichment_status" AS ENUM('pending', 'enriched', 'failed');--> statement-breakpoint
CREATE TYPE "generated_type" AS ENUM('article', 'video', 'website', 'repository', 'unknown');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY,
	"google_subject" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capture_tokens" (
	"id" text PRIMARY KEY,
	"account_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"regenerated_at" timestamp with time zone
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
	"account_id" text NOT NULL,
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
CREATE UNIQUE INDEX "accounts_google_subject_unique" ON "accounts" ("google_subject");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_email_unique" ON "accounts" ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "capture_tokens_account_id_unique" ON "capture_tokens" ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "capture_tokens_token_hash_unique" ON "capture_tokens" ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_items_account_normalized_url_unique" ON "saved_items" ("account_id","normalized_url");--> statement-breakpoint
CREATE INDEX "saved_items_account_last_saved_at_idx" ON "saved_items" ("account_id","last_saved_at");--> statement-breakpoint
ALTER TABLE "capture_tokens" ADD CONSTRAINT "capture_tokens_account_id_accounts_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "enrichment_jobs" ADD CONSTRAINT "enrichment_jobs_saved_item_id_saved_items_id_fkey" FOREIGN KEY ("saved_item_id") REFERENCES "saved_items"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "saved_items" ADD CONSTRAINT "saved_items_account_id_accounts_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE;