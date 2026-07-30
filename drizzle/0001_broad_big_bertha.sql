ALTER TABLE `accounts` ADD `rule` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `goals` ADD `color` text DEFAULT '#6556E8' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `workspace_version` integer DEFAULT 0 NOT NULL;