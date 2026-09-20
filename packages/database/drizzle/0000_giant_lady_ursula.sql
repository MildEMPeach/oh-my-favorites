CREATE TABLE `item_tags` (
	`item_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `item_tags_unique` ON `item_tags` (`item_id`,`tag_id`);--> statement-breakpoint
CREATE TABLE `items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`url` text NOT NULL,
	`title` text,
	`description` text,
	`favicon_url` text,
	`source` text DEFAULT 'desktop' NOT NULL,
	`read_status` text DEFAULT 'unread' NOT NULL,
	`is_favorite` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`read_at` integer,
	`favorited_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `items_url_unique` ON `items` (`url`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);