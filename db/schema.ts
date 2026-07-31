import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    displayName: text("display_name"),
    defaultCurrency: text("default_currency").notNull().default("AUD"),
    timezone: text("timezone").notNull().default("Australia/Melbourne"),
    language: text("language").notNull().default("en-AU"),
    theme: text("theme").notNull().default("system"),
    billReminders: integer("bill_reminders", { mode: "boolean" }).notNull().default(true),
    budgetAlerts: integer("budget_alerts", { mode: "boolean" }).notNull().default(true),
    largeTransactionAlerts: integer("large_transaction_alerts", { mode: "boolean" }).notNull().default(true),
    seededAt: text("seeded_at"),
    workspaceVersion: integer("workspace_version").notNull().default(0),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    uniqueIndex("users_email_unique").on(table.email),
    check(
      "users_currency_length_check",
      sql`length(${table.defaultCurrency}) = 3`,
    ),
  ],
);

export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    bankName: text("bank_name").notNull().default(""),
    accountType: text("account_type").notNull().default("checking"),
    purpose: text("purpose").notNull().default("custom"),
    rule: text("rule").notNull().default(""),
    openingBalanceCents: integer("opening_balance_cents").notNull().default(0),
    currentBalanceCents: integer("current_balance_cents").notNull().default(0),
    currency: text("currency").notNull().default("AUD"),
    color: text("color").notNull().default("#6556E8"),
    icon: text("icon").notNull().default("wallet"),
    notes: text("notes").notNull().default(""),
    isArchived: integer("is_archived", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    index("accounts_user_archived_idx").on(table.userId, table.isArchived),
    uniqueIndex("accounts_user_name_unique").on(table.userId, table.name),
    check("accounts_currency_length_check", sql`length(${table.currency}) = 3`),
    check(
      "accounts_purpose_check",
      sql`${table.purpose} in ('salary', 'daily', 'bills', 'international', 'savings', 'custom')`,
    ),
  ],
);

export const categories = sqliteTable(
  "categories",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type").notNull(),
    color: text("color").notNull().default("#8D80F8"),
    icon: text("icon").notNull().default("circle"),
    isSystem: integer("is_system", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    uniqueIndex("categories_user_name_type_unique").on(
      table.userId,
      table.name,
      table.type,
    ),
    index("categories_user_type_idx").on(table.userId, table.type),
    check(
      "categories_type_check",
      sql`${table.type} in ('income', 'expense')`,
    ),
  ],
);

export const transactions = sqliteTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    categoryId: text("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    amountCents: integer("amount_cents").notNull(),
    type: text("type").notNull(),
    occurredAt: text("occurred_at").notNull(),
    merchant: text("merchant").notNull().default(""),
    paymentMethod: text("payment_method").notNull().default("card"),
    tagsJson: text("tags_json").notNull().default("[]"),
    notes: text("notes").notNull().default(""),
    receiptUrl: text("receipt_url"),
    location: text("location"),
    isRecurring: integer("is_recurring", { mode: "boolean" })
      .notNull()
      .default(false),
    status: text("status").notNull().default("completed"),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    index("transactions_user_occurred_idx").on(table.userId, table.occurredAt),
    index("transactions_user_account_occurred_idx").on(
      table.userId,
      table.accountId,
      table.occurredAt,
    ),
    index("transactions_user_category_occurred_idx").on(
      table.userId,
      table.categoryId,
      table.occurredAt,
    ),
    index("transactions_user_status_idx").on(table.userId, table.status),
    check("transactions_amount_check", sql`${table.amountCents} > 0`),
    check(
      "transactions_type_check",
      sql`${table.type} in ('income', 'expense')`,
    ),
    check(
      "transactions_status_check",
      sql`${table.status} in ('pending', 'completed', 'cancelled')`,
    ),
  ],
);

export const transfers = sqliteTable(
  "transfers",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fromAccountId: text("from_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    toAccountId: text("to_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    amountCents: integer("amount_cents").notNull(),
    transferDate: text("transfer_date").notNull(),
    notes: text("notes").notNull().default(""),
    status: text("status").notNull().default("completed"),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    index("transfers_user_date_idx").on(table.userId, table.transferDate),
    index("transfers_user_from_idx").on(table.userId, table.fromAccountId),
    index("transfers_user_to_idx").on(table.userId, table.toAccountId),
    check("transfers_amount_check", sql`${table.amountCents} > 0`),
    check(
      "transfers_distinct_accounts_check",
      sql`${table.fromAccountId} <> ${table.toAccountId}`,
    ),
    check(
      "transfers_status_check",
      sql`${table.status} in ('pending', 'completed', 'cancelled')`,
    ),
  ],
);

export const budgets = sqliteTable(
  "budgets",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    accountId: text("account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    monthlyLimitCents: integer("monthly_limit_cents").notNull().default(0),
    weeklyLimitCents: integer("weekly_limit_cents").notNull().default(0),
    dailyLimitCents: integer("daily_limit_cents").notNull().default(0),
    resetDay: integer("reset_day").notNull().default(1),
    status: text("status").notNull().default("active"),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    index("budgets_user_status_idx").on(table.userId, table.status),
    index("budgets_user_category_idx").on(table.userId, table.categoryId),
    check(
      "budgets_limits_check",
      sql`${table.monthlyLimitCents} >= 0 and ${table.weeklyLimitCents} >= 0 and ${table.dailyLimitCents} >= 0`,
    ),
    check(
      "budgets_reset_day_check",
      sql`${table.resetDay} between 1 and 28`,
    ),
    check(
      "budgets_status_check",
      sql`${table.status} in ('active', 'paused')`,
    ),
  ],
);

export const goals = sqliteTable(
  "goals",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    targetAmountCents: integer("target_amount_cents").notNull(),
    currentAmountCents: integer("current_amount_cents").notNull().default(0),
    deadline: text("deadline"),
    monthlyContributionCents: integer("monthly_contribution_cents")
      .notNull()
      .default(0),
    notes: text("notes").notNull().default(""),
    color: text("color").notNull().default("#6556E8"),
    status: text("status").notNull().default("active"),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    index("goals_user_status_idx").on(table.userId, table.status),
    check("goals_target_check", sql`${table.targetAmountCents} > 0`),
    check(
      "goals_amounts_check",
      sql`${table.currentAmountCents} >= 0 and ${table.monthlyContributionCents} >= 0`,
    ),
    check(
      "goals_status_check",
      sql`${table.status} in ('active', 'completed', 'paused', 'archived')`,
    ),
  ],
);

export const bills = sqliteTable(
  "bills",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    categoryId: text("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    amountCents: integer("amount_cents").notNull(),
    dueDate: text("due_date").notNull(),
    reminderDays: integer("reminder_days").notNull().default(3),
    frequency: text("frequency").notNull().default("monthly"),
    status: text("status").notNull().default("upcoming"),
    isAutoPay: integer("is_auto_pay", { mode: "boolean" })
      .notNull()
      .default(false),
    notes: text("notes").notNull().default(""),
    paidAt: text("paid_at"),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (table) => [
    index("bills_user_due_idx").on(table.userId, table.dueDate),
    index("bills_user_status_due_idx").on(
      table.userId,
      table.status,
      table.dueDate,
    ),
    check("bills_amount_check", sql`${table.amountCents} > 0`),
    check("bills_reminder_check", sql`${table.reminderDays} >= 0`),
    check(
      "bills_frequency_check",
      sql`${table.frequency} in ('once', 'weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly')`,
    ),
    check(
      "bills_status_check",
      sql`${table.status} in ('upcoming', 'paid', 'overdue', 'cancelled')`,
    ),
  ],
);

export const activity = sqliteTable(
  "activity",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    action: text("action").notNull(),
    summary: text("summary").notNull(),
    metadataJson: text("metadata_json").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(now),
  },
  (table) => [
    index("activity_user_created_idx").on(table.userId, table.createdAt),
    index("activity_entity_idx").on(table.entityType, table.entityId),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  categories: many(categories),
  transactions: many(transactions),
  transfers: many(transfers),
  budgets: many(budgets),
  goals: many(goals),
  bills: many(bills),
  activity: many(activity),
}));

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
  transactions: many(transactions),
  budgets: many(budgets),
  bills: many(bills),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  user: one(users, { fields: [categories.userId], references: [users.id] }),
  transactions: many(transactions),
  budgets: many(budgets),
  bills: many(bills),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, { fields: [transactions.userId], references: [users.id] }),
  account: one(accounts, {
    fields: [transactions.accountId],
    references: [accounts.id],
  }),
  category: one(categories, {
    fields: [transactions.categoryId],
    references: [categories.id],
  }),
}));

export const transfersRelations = relations(transfers, ({ one }) => ({
  user: one(users, { fields: [transfers.userId], references: [users.id] }),
  fromAccount: one(accounts, {
    fields: [transfers.fromAccountId],
    references: [accounts.id],
    relationName: "transferFromAccount",
  }),
  toAccount: one(accounts, {
    fields: [transfers.toAccountId],
    references: [accounts.id],
    relationName: "transferToAccount",
  }),
}));

export const budgetsRelations = relations(budgets, ({ one }) => ({
  user: one(users, { fields: [budgets.userId], references: [users.id] }),
  account: one(accounts, {
    fields: [budgets.accountId],
    references: [accounts.id],
  }),
  category: one(categories, {
    fields: [budgets.categoryId],
    references: [categories.id],
  }),
}));

export const goalsRelations = relations(goals, ({ one }) => ({
  user: one(users, { fields: [goals.userId], references: [users.id] }),
}));

export const billsRelations = relations(bills, ({ one }) => ({
  user: one(users, { fields: [bills.userId], references: [users.id] }),
  account: one(accounts, {
    fields: [bills.accountId],
    references: [accounts.id],
  }),
  category: one(categories, {
    fields: [bills.categoryId],
    references: [categories.id],
  }),
}));

export const activityRelations = relations(activity, ({ one }) => ({
  user: one(users, { fields: [activity.userId], references: [users.id] }),
}));
