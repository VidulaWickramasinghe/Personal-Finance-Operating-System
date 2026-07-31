ALTER TABLE `users` ADD `dashboard_density` text DEFAULT 'comfortable' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `start_page` text DEFAULT 'overview' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `show_health_score` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `show_upcoming_bills` integer DEFAULT true NOT NULL;