ALTER TABLE `bookmarks` ADD `title` text;
--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `description` text;
--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `site_name` text;
--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `image_url` text;
--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `canonical_url` text;
--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `summary` text;
--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `extracted_content` text;
--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `excerpt` text;
--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `word_count` integer;
--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `extracted_at` integer;
--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `categories_json` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
CREATE TABLE `enrichment_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`bookmark_id` text NOT NULL,
	`attempt` integer NOT NULL,
	`status` text NOT NULL,
	`stages_json` text DEFAULT '[]' NOT NULL,
	`queued_at` integer NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	FOREIGN KEY (`bookmark_id`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade
);
