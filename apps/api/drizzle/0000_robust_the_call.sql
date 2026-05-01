CREATE TABLE `bookmarks` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`host` text NOT NULL,
	`is_read` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bookmarks_url_unique` ON `bookmarks` (`url`);--> statement-breakpoint
CREATE TABLE `captured_links` (
	`id` text PRIMARY KEY NOT NULL,
	`bookmark_id` text NOT NULL,
	`url` text NOT NULL,
	`captured_at` integer NOT NULL,
	FOREIGN KEY (`bookmark_id`) REFERENCES `bookmarks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `captured_links_url_unique` ON `captured_links` (`url`);
