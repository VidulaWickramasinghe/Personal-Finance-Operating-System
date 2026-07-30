CREATE TABLE `user_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`timezone` text DEFAULT 'Australia/Melbourne' NOT NULL,
	`language` text DEFAULT 'en-AU' NOT NULL,
	`bill_reminders` integer DEFAULT true NOT NULL,
	`budget_alerts` integer DEFAULT true NOT NULL,
	`large_transaction_alerts` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `transactions` ADD `receipt_key` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `receipt_name` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `receipt_content_type` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `receipt_size` integer;