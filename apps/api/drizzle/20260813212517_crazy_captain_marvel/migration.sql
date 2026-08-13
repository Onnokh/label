ALTER TYPE "link_type" ADD VALUE 'post';--> statement-breakpoint
ALTER TABLE "link_metadata" ADD COLUMN "author_name" text;--> statement-breakpoint
ALTER TABLE "link_metadata" ADD COLUMN "author_handle" text;--> statement-breakpoint
ALTER TABLE "link_metadata" ADD COLUMN "author_avatar_url" text;