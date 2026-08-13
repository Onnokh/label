ALTER TABLE "folders" ADD COLUMN "is_private" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "saved_items" ADD COLUMN "is_private" boolean DEFAULT false NOT NULL;