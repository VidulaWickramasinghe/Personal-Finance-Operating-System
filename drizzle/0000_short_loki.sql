CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`bank_name` text DEFAULT '' NOT NULL,
	`account_type` text DEFAULT 'checking' NOT NULL,
	`purpose` text DEFAULT 'custom' NOT NULL,
	`opening_balance_cents` integer DEFAULT 0 NOT NULL,
	`current_balance_cents` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'AUD' NOT NULL,
	`color` text DEFAULT '#6556E8' NOT NULL,
	`icon` text DEFAULT 'wallet' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`is_archived` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "accounts_currency_length_check" CHECK(length("accounts"."currency") = 3),
	CONSTRAINT "accounts_purpose_check" CHECK("accounts"."purpose" in ('salary', 'daily', 'bills', 'international', 'savings', 'custom'))
);
--> statement-breakpoint
CREATE INDEX `accounts_user_archived_idx` ON `accounts` (`user_id`,`is_archived`);--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_user_name_unique` ON `accounts` (`user_id`,`name`);--> statement-breakpoint
CREATE TABLE `activity` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`action` text NOT NULL,
	`summary` text NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `activity_user_created_idx` ON `activity` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `activity_entity_idx` ON `activity` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `bills` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`category_id` text,
	`name` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`due_date` text NOT NULL,
	`reminder_days` integer DEFAULT 3 NOT NULL,
	`frequency` text DEFAULT 'monthly' NOT NULL,
	`status` text DEFAULT 'upcoming' NOT NULL,
	`is_auto_pay` integer DEFAULT false NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`paid_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "bills_amount_check" CHECK("bills"."amount_cents" > 0),
	CONSTRAINT "bills_reminder_check" CHECK("bills"."reminder_days" >= 0),
	CONSTRAINT "bills_frequency_check" CHECK("bills"."frequency" in ('once', 'weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly')),
	CONSTRAINT "bills_status_check" CHECK("bills"."status" in ('upcoming', 'paid', 'overdue', 'cancelled'))
);
--> statement-breakpoint
CREATE INDEX `bills_user_due_idx` ON `bills` (`user_id`,`due_date`);--> statement-breakpoint
CREATE INDEX `bills_user_status_due_idx` ON `bills` (`user_id`,`status`,`due_date`);--> statement-breakpoint
CREATE TABLE `budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`category_id` text NOT NULL,
	`account_id` text,
	`name` text NOT NULL,
	`monthly_limit_cents` integer DEFAULT 0 NOT NULL,
	`weekly_limit_cents` integer DEFAULT 0 NOT NULL,
	`daily_limit_cents` integer DEFAULT 0 NOT NULL,
	`reset_day` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "budgets_limits_check" CHECK("budgets"."monthly_limit_cents" >= 0 and "budgets"."weekly_limit_cents" >= 0 and "budgets"."daily_limit_cents" >= 0),
	CONSTRAINT "budgets_reset_day_check" CHECK("budgets"."reset_day" between 1 and 28),
	CONSTRAINT "budgets_status_check" CHECK("budgets"."status" in ('active', 'paused'))
);
--> statement-breakpoint
CREATE INDEX `budgets_user_status_idx` ON `budgets` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `budgets_user_category_idx` ON `budgets` (`user_id`,`category_id`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`color` text DEFAULT '#8D80F8' NOT NULL,
	`icon` text DEFAULT 'circle' NOT NULL,
	`is_system` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "categories_type_check" CHECK("categories"."type" in ('income', 'expense'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_user_name_type_unique` ON `categories` (`user_id`,`name`,`type`);--> statement-breakpoint
CREATE INDEX `categories_user_type_idx` ON `categories` (`user_id`,`type`);--> statement-breakpoint
CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`target_amount_cents` integer NOT NULL,
	`current_amount_cents` integer DEFAULT 0 NOT NULL,
	`deadline` text,
	`monthly_contribution_cents` integer DEFAULT 0 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "goals_target_check" CHECK("goals"."target_amount_cents" > 0),
	CONSTRAINT "goals_amounts_check" CHECK("goals"."current_amount_cents" >= 0 and "goals"."monthly_contribution_cents" >= 0),
	CONSTRAINT "goals_status_check" CHECK("goals"."status" in ('active', 'completed', 'paused', 'archived'))
);
--> statement-breakpoint
CREATE INDEX `goals_user_status_idx` ON `goals` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`category_id` text,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`amount_cents` integer NOT NULL,
	`type` text NOT NULL,
	`occurred_at` text NOT NULL,
	`merchant` text DEFAULT '' NOT NULL,
	`payment_method` text DEFAULT 'card' NOT NULL,
	`tags_json` text DEFAULT '[]' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`receipt_url` text,
	`location` text,
	`is_recurring` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'completed' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "transactions_amount_check" CHECK("transactions"."amount_cents" > 0),
	CONSTRAINT "transactions_type_check" CHECK("transactions"."type" in ('income', 'expense')),
	CONSTRAINT "transactions_status_check" CHECK("transactions"."status" in ('pending', 'completed', 'cancelled'))
);
--> statement-breakpoint
CREATE INDEX `transactions_user_occurred_idx` ON `transactions` (`user_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `transactions_user_account_occurred_idx` ON `transactions` (`user_id`,`account_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `transactions_user_category_occurred_idx` ON `transactions` (`user_id`,`category_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `transactions_user_status_idx` ON `transactions` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`from_account_id` text NOT NULL,
	`to_account_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`transfer_date` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'completed' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`to_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "transfers_amount_check" CHECK("transfers"."amount_cents" > 0),
	CONSTRAINT "transfers_distinct_accounts_check" CHECK("transfers"."from_account_id" <> "transfers"."to_account_id"),
	CONSTRAINT "transfers_status_check" CHECK("transfers"."status" in ('pending', 'completed', 'cancelled'))
);
--> statement-breakpoint
CREATE INDEX `transfers_user_date_idx` ON `transfers` (`user_id`,`transfer_date`);--> statement-breakpoint
CREATE INDEX `transfers_user_from_idx` ON `transfers` (`user_id`,`from_account_id`);--> statement-breakpoint
CREATE INDEX `transfers_user_to_idx` ON `transfers` (`user_id`,`to_account_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text,
	`default_currency` text DEFAULT 'AUD' NOT NULL,
	`seeded_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "users_currency_length_check" CHECK(length("users"."default_currency") = 3)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);