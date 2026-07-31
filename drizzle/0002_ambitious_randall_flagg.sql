ALTER TABLE `users` ADD `timezone` text DEFAULT 'Australia/Melbourne' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `language` text DEFAULT 'en-AU' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `theme` text DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `bill_reminders` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `budget_alerts` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `large_transaction_alerts` integer DEFAULT true NOT NULL;