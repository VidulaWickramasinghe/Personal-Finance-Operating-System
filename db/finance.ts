import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { getD1Binding, getDb } from ".";
import {
  accounts,
  activity,
  bills,
  budgets,
  categories,
  goals,
  transactions,
  transfers,
  users,
} from "./schema";

const EMAIL_HEADER = "oai-authenticated-user-email";
const NAME_HEADER = "oai-authenticated-user-full-name";
const NAME_ENCODING_HEADER = "oai-authenticated-user-full-name-encoding";

export const CURRENT_WORKSPACE_VERSION = 1;

type SystemCategory = {
  slug: string;
  name: string;
  type: "income" | "expense";
  color: string;
  icon: string;
};

const SYSTEM_CATEGORIES = [
  { slug: "salary", name: "Salary", type: "income", color: "#34C88A", icon: "briefcase" },
  { slug: "bonus", name: "Bonus", type: "income", color: "#46B989", icon: "badge-dollar-sign" },
  { slug: "freelance", name: "Freelance", type: "income", color: "#4C9AFF", icon: "sparkles" },
  { slug: "business-income", name: "Business Income", type: "income", color: "#3AA7A3", icon: "building-2" },
  { slug: "investment-income", name: "Investment Income", type: "income", color: "#8D80F8", icon: "chart-no-axes-combined" },
  { slug: "interest", name: "Interest", type: "income", color: "#6C8CFF", icon: "percent" },
  { slug: "dividends", name: "Dividends", type: "income", color: "#9B78E5", icon: "landmark" },
  { slug: "rental-income", name: "Rental Income", type: "income", color: "#5B9CF6", icon: "house" },
  { slug: "refunds", name: "Refunds", type: "income", color: "#47B8B0", icon: "rotate-ccw" },
  { slug: "cash-deposits", name: "Cash Deposits", type: "income", color: "#58B87C", icon: "banknote" },
  { slug: "gifts-income", name: "Gifts Received", type: "income", color: "#D170E8", icon: "gift" },
  { slug: "government-payments", name: "Government Payments", type: "income", color: "#7696D8", icon: "landmark" },
  { slug: "other-income", name: "Other Income", type: "income", color: "#7D8799", icon: "circle-plus" },
  { slug: "groceries", name: "Groceries", type: "expense", color: "#FFB155", icon: "shopping-basket" },
  { slug: "food", name: "Food", type: "expense", color: "#F4A261", icon: "sandwich" },
  { slug: "dining", name: "Dining", type: "expense", color: "#F98E77", icon: "utensils" },
  { slug: "coffee", name: "Coffee", type: "expense", color: "#B8835A", icon: "coffee" },
  { slug: "fuel", name: "Fuel", type: "expense", color: "#E89A45", icon: "fuel" },
  { slug: "housing", name: "Housing", type: "expense", color: "#8D80F8", icon: "house" },
  { slug: "rent", name: "Rent", type: "expense", color: "#8378E3", icon: "key-round" },
  { slug: "mortgage", name: "Mortgage", type: "expense", color: "#756BD2", icon: "house-plus" },
  { slug: "phone", name: "Phone", type: "expense", color: "#5F9BFF", icon: "smartphone" },
  { slug: "internet", name: "Internet", type: "expense", color: "#4C9AFF", icon: "wifi" },
  { slug: "electricity", name: "Electricity", type: "expense", color: "#F0B94C", icon: "zap" },
  { slug: "water", name: "Water", type: "expense", color: "#5BA9E8", icon: "droplets" },
  { slug: "gas", name: "Gas", type: "expense", color: "#E5865E", icon: "flame" },
  { slug: "utilities", name: "Utilities", type: "expense", color: "#47B8B0", icon: "plug-zap" },
  { slug: "insurance", name: "Insurance", type: "expense", color: "#7589D8", icon: "shield-check" },
  { slug: "health", name: "Health", type: "expense", color: "#5BC1A7", icon: "heart-pulse" },
  { slug: "medical", name: "Medical", type: "expense", color: "#4DB59C", icon: "stethoscope" },
  { slug: "entertainment", name: "Entertainment", type: "expense", color: "#FF8E64", icon: "film" },
  { slug: "shopping", name: "Shopping", type: "expense", color: "#EC72A4", icon: "shopping-bag" },
  { slug: "transport", name: "Transport", type: "expense", color: "#6C8CFF", icon: "car" },
  { slug: "travel", name: "Travel", type: "expense", color: "#5F9BFF", icon: "plane" },
  { slug: "subscriptions", name: "Subscriptions", type: "expense", color: "#D170E8", icon: "repeat" },
  { slug: "loan", name: "Loan", type: "expense", color: "#D4866A", icon: "hand-coins" },
  { slug: "education", name: "Education", type: "expense", color: "#D09A48", icon: "graduation-cap" },
  { slug: "investment", name: "Investment", type: "expense", color: "#7E7BE5", icon: "chart-line" },
  { slug: "childcare", name: "Childcare", type: "expense", color: "#E887B2", icon: "baby" },
  { slug: "pets", name: "Pets", type: "expense", color: "#B7835B", icon: "paw-print" },
  { slug: "personal-care", name: "Personal Care", type: "expense", color: "#D47FA8", icon: "sparkles" },
  { slug: "taxes", name: "Taxes", type: "expense", color: "#7C879A", icon: "receipt" },
  { slug: "fees", name: "Fees & Charges", type: "expense", color: "#9399A6", icon: "circle-dollar-sign" },
  { slug: "charity", name: "Charity", type: "expense", color: "#E16F85", icon: "heart-handshake" },
  { slug: "gifts", name: "Gifts", type: "expense", color: "#C77BDE", icon: "gift" },
  { slug: "home-maintenance", name: "Home Maintenance", type: "expense", color: "#A78B6F", icon: "hammer" },
  { slug: "other", name: "Other", type: "expense", color: "#8C92A4", icon: "circle" },
] satisfies readonly SystemCategory[];

const LEGACY_DEMO_ROWS = {
  transactions: [
    "salary",
    "rent",
    "phone",
    "groceries",
    "coffee",
    "fuel",
    "cinema",
    "chatgpt",
  ],
  transfers: ["salary-bills", "salary-daily", "salary-savings"],
  budgets: ["groceries", "dining", "transport", "entertainment"],
  goals: ["emergency", "holiday"],
  bills: ["rent", "electricity", "internet", "chatgpt"],
  activity: ["welcome"],
  accounts: ["salary", "daily", "bills", "international", "savings"],
} as const;

type LegacyTable =
  | "transactions"
  | "transfers"
  | "budgets"
  | "goals"
  | "bills"
  | "activity";

type LegacyKind =
  | "transaction"
  | "transfer"
  | "budget"
  | "goal"
  | "bill"
  | "activity";

export type FinanceUser = typeof users.$inferSelect;

export class FinanceAuthError extends Error {
  constructor() {
    super("Sign in is required to access finance data.");
    this.name = "FinanceAuthError";
  }
}

export async function getFinanceUser(request: Request): Promise<FinanceUser> {
  const identity = identityFromRequest(request);
  if (!identity) throw new FinanceAuthError();

  const db = getDb();
  await db
    .insert(users)
    .values({
      id: crypto.randomUUID(),
      email: identity.email,
      displayName: identity.displayName,
    })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        displayName: identity.displayName,
        updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
      },
    });

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, identity.email))
    .limit(1);

  if (!user) throw new Error("Unable to create or load the finance profile.");
  return initializeFinanceWorkspace(user);
}

export async function initializeFinanceWorkspace(
  user: FinanceUser,
): Promise<FinanceUser> {
  if (user.workspaceVersion >= CURRENT_WORKSPACE_VERSION) return user;

  const d1 = getD1Binding();
  const statements: D1PreparedStatement[] = [
    prepareLegacyDelete(
      d1,
      user.id,
      "bills",
      "bill",
      LEGACY_DEMO_ROWS.bills,
    ),
    prepareLegacyDelete(
      d1,
      user.id,
      "budgets",
      "budget",
      LEGACY_DEMO_ROWS.budgets,
    ),
    prepareLegacyDelete(
      d1,
      user.id,
      "transfers",
      "transfer",
      LEGACY_DEMO_ROWS.transfers,
    ),
    prepareLegacyDelete(
      d1,
      user.id,
      "transactions",
      "transaction",
      LEGACY_DEMO_ROWS.transactions,
    ),
    prepareLegacyDelete(
      d1,
      user.id,
      "goals",
      "goal",
      LEGACY_DEMO_ROWS.goals,
    ),
    prepareLegacyDelete(
      d1,
      user.id,
      "activity",
      "activity",
      LEGACY_DEMO_ROWS.activity,
    ),
    ...LEGACY_DEMO_ROWS.accounts.map((slug) =>
      prepareLegacyAccountDelete(d1, user.id, slug),
    ),
    ...SYSTEM_CATEGORIES.map((category) =>
      prepareSystemCategoryInsert(d1, user.id, category, true),
    ),
    d1
      .prepare(
        `UPDATE users
         SET workspace_version = ?, seeded_at = NULL,
             updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         WHERE id = ? AND workspace_version < ?`,
      )
      .bind(
        CURRENT_WORKSPACE_VERSION,
        user.id,
        CURRENT_WORKSPACE_VERSION,
      ),
  ];

  await d1.batch(statements);
  return loadFinanceUserById(user.id);
}

function prepareLegacyDelete(
  d1: D1Database,
  userId: string,
  table: LegacyTable,
  kind: LegacyKind,
  slugs: readonly string[],
) {
  const ids = slugs.map((slug) => scopedId(userId, kind, slug));
  const placeholders = ids.map(() => "?").join(", ");
  return d1
    .prepare(
      `DELETE FROM ${table}
       WHERE user_id = ? AND id IN (${placeholders})
         AND EXISTS (
           SELECT 1 FROM users
           WHERE id = ? AND workspace_version < ?
         )`,
    )
    .bind(userId, ...ids, userId, CURRENT_WORKSPACE_VERSION);
}

function prepareLegacyAccountDelete(
  d1: D1Database,
  userId: string,
  slug: string,
) {
  return d1
    .prepare(
      `DELETE FROM accounts
       WHERE id = ? AND user_id = ?
         AND EXISTS (
           SELECT 1 FROM users
           WHERE id = ? AND workspace_version < ?
         )
         AND NOT EXISTS (
           SELECT 1 FROM transactions
           WHERE user_id = ? AND account_id = accounts.id
         )
         AND NOT EXISTS (
           SELECT 1 FROM transfers
           WHERE user_id = ?
             AND (
               from_account_id = accounts.id
               OR to_account_id = accounts.id
             )
         )
         AND NOT EXISTS (
           SELECT 1 FROM budgets
           WHERE user_id = ? AND account_id = accounts.id
         )
         AND NOT EXISTS (
           SELECT 1 FROM bills
           WHERE user_id = ? AND account_id = accounts.id
         )`,
    )
    .bind(
      scopedId(userId, "account", slug),
      userId,
      userId,
      CURRENT_WORKSPACE_VERSION,
      userId,
      userId,
      userId,
      userId,
    );
}

function prepareSystemCategoryInsert(
  d1: D1Database,
  userId: string,
  category: SystemCategory,
  requireOldVersion: boolean,
) {
  const id = scopedId(userId, "category", category.slug);
  if (requireOldVersion) {
    return d1
      .prepare(
        `INSERT OR IGNORE INTO categories (
           id, user_id, name, type, color, icon, is_system
         )
         SELECT ?, ?, ?, ?, ?, ?, 1
         WHERE EXISTS (
           SELECT 1 FROM users
           WHERE id = ? AND workspace_version < ?
         )`,
      )
      .bind(
        id,
        userId,
        category.name,
        category.type,
        category.color,
        category.icon,
        userId,
        CURRENT_WORKSPACE_VERSION,
      );
  }

  return d1
    .prepare(
      `INSERT OR IGNORE INTO categories (
         id, user_id, name, type, color, icon, is_system
       ) VALUES (?, ?, ?, ?, ?, ?, 1)`,
    )
    .bind(
      id,
      userId,
      category.name,
      category.type,
      category.color,
      category.icon,
    );
}

function scopedId(userId: string, kind: string, slug: string) {
  return `${userId}:${kind}:${slug}`;
}

async function loadFinanceUserById(userId: string): Promise<FinanceUser> {
  const [user] = await getDb()
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw new Error("Unable to load the finance profile.");
  return user;
}

export async function loadFinanceSnapshot(userId: string) {
  const db = getDb();
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);
  const endOfMonth = new Date(startOfMonth);
  endOfMonth.setUTCMonth(endOfMonth.getUTCMonth() + 1);

  const [
    accountRows,
    categoryRows,
    transactionRows,
    transferRows,
    budgetRows,
    goalRows,
    billRows,
    activityRows,
  ] = await Promise.all([
    db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, userId))
      .orderBy(asc(accounts.createdAt)),
    db
      .select()
      .from(categories)
      .where(eq(categories.userId, userId))
      .orderBy(asc(categories.type), asc(categories.name)),
    db
      .select()
      .from(transactions)
      .where(eq(transactions.userId, userId))
      .orderBy(desc(transactions.occurredAt), desc(transactions.createdAt)),
    db
      .select()
      .from(transfers)
      .where(eq(transfers.userId, userId))
      .orderBy(desc(transfers.transferDate), desc(transfers.createdAt)),
    db
      .select()
      .from(budgets)
      .where(eq(budgets.userId, userId))
      .orderBy(asc(budgets.name)),
    db
      .select()
      .from(goals)
      .where(eq(goals.userId, userId))
      .orderBy(asc(goals.createdAt)),
    db
      .select()
      .from(bills)
      .where(eq(bills.userId, userId))
      .orderBy(asc(bills.dueDate)),
    db
      .select()
      .from(activity)
      .where(eq(activity.userId, userId))
      .orderBy(desc(activity.createdAt))
      .limit(40),
  ]);

  const monthlyTransactions = transactionRows.filter(
    (item) =>
      item.status === "completed" &&
      item.occurredAt >= startOfMonth.toISOString() &&
      item.occurredAt < endOfMonth.toISOString(),
  );
  const monthlyIncomeCents = monthlyTransactions
    .filter((item) => item.type === "income")
    .reduce((sum, item) => sum + item.amountCents, 0);
  const monthlyExpensesCents = monthlyTransactions
    .filter((item) => item.type === "expense")
    .reduce((sum, item) => sum + item.amountCents, 0);
  const totalBalanceCents = accountRows
    .filter((item) => !item.isArchived)
    .reduce((sum, item) => sum + item.currentBalanceCents, 0);
  const activeMonthlyBudgetCents = budgetRows
    .filter((item) => item.status === "active")
    .reduce((sum, item) => sum + item.monthlyLimitCents, 0);
  const budgetRemainingCents = Math.max(
    0,
    activeMonthlyBudgetCents - monthlyExpensesCents,
  );
  const savingsCents = accountRows
    .filter((item) => item.purpose === "savings" && !item.isArchived)
    .reduce((sum, item) => sum + item.currentBalanceCents, 0);
  const upcomingBillsCents = billRows
    .filter((item) => item.status === "upcoming" || item.status === "overdue")
    .reduce((sum, item) => sum + item.amountCents, 0);
  const savingsRate =
    monthlyIncomeCents > 0
      ? Math.max(
          0,
          Math.round(
            ((monthlyIncomeCents - monthlyExpensesCents) /
              monthlyIncomeCents) *
              100,
          ),
        )
      : 0;
  const hasFinancialData =
    accountRows.length > 0 ||
    transactionRows.length > 0 ||
    transferRows.length > 0 ||
    budgetRows.length > 0 ||
    goalRows.length > 0 ||
    billRows.length > 0;
  const healthScore = hasFinancialData
    ? Math.max(
        0,
        Math.min(
          100,
          Math.round(
            52 +
              Math.min(22, savingsRate * 0.45) +
              (totalBalanceCents > upcomingBillsCents * 3 ? 14 : 4),
          ),
        ),
      )
    : 0;

  const spentByCategory = monthlyTransactions
    .filter((item) => item.type === "expense" && item.categoryId)
    .reduce<Record<string, number>>((result, item) => {
      result[item.categoryId!] =
        (result[item.categoryId!] ?? 0) + item.amountCents;
      return result;
    }, {});

  return {
    summary: {
      totalBalanceCents,
      monthlyIncomeCents,
      monthlyExpensesCents,
      cashFlowCents: monthlyIncomeCents - monthlyExpensesCents,
      budgetRemainingCents,
      savingsCents,
      upcomingBillsCents,
      savingsRate,
      healthScore,
    },
    accounts: accountRows,
    categories: categoryRows,
    transactions: transactionRows,
    transfers: transferRows,
    budgets: budgetRows.map((budget) => {
      const spentCents = spentByCategory[budget.categoryId] ?? 0;
      return {
        ...budget,
        spentCents,
        remainingCents: budget.monthlyLimitCents - spentCents,
        percentUsed:
          budget.monthlyLimitCents > 0
            ? Math.round((spentCents / budget.monthlyLimitCents) * 100)
            : 0,
      };
    }),
    goals: goalRows,
    bills: billRows,
    activity: activityRows,
  };
}

export async function resetFinanceUser(user: FinanceUser): Promise<FinanceUser> {
  const d1 = getD1Binding();
  await d1.batch([
    d1.prepare("DELETE FROM activity WHERE user_id = ?").bind(user.id),
    d1.prepare("DELETE FROM bills WHERE user_id = ?").bind(user.id),
    d1.prepare("DELETE FROM budgets WHERE user_id = ?").bind(user.id),
    d1.prepare("DELETE FROM transfers WHERE user_id = ?").bind(user.id),
    d1.prepare("DELETE FROM transactions WHERE user_id = ?").bind(user.id),
    d1.prepare("DELETE FROM goals WHERE user_id = ?").bind(user.id),
    d1.prepare("DELETE FROM accounts WHERE user_id = ?").bind(user.id),
    d1.prepare("DELETE FROM categories WHERE user_id = ?").bind(user.id),
    ...SYSTEM_CATEGORIES.map((category) =>
      prepareSystemCategoryInsert(d1, user.id, category, false),
    ),
    d1
      .prepare(
        `UPDATE users
         SET workspace_version = ?, seeded_at = NULL,
             updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         WHERE id = ?`,
      )
      .bind(CURRENT_WORKSPACE_VERSION, user.id),
  ]);

  return loadFinanceUserById(user.id);
}

export function impactCents(input: {
  type: string;
  status: string;
  amountCents: number;
}) {
  if (input.status !== "completed") return 0;
  return input.type === "income" ? input.amountCents : -input.amountCents;
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  return !Number.isNaN(Date.parse(value));
}

export function readCents(
  payload: Record<string, unknown>,
  centsKey = "amountCents",
  amountKey = "amount",
): number | null {
  const cents = payload[centsKey];
  if (typeof cents === "number" && Number.isFinite(cents)) {
    return Math.round(cents);
  }
  const amount = payload[amountKey];
  if (typeof amount === "number" && Number.isFinite(amount)) {
    return Math.round(amount * 100);
  }
  return null;
}

function identityFromRequest(request: Request) {
  const emailHeader = request.headers.get(EMAIL_HEADER)?.trim().toLowerCase();
  const url = new URL(request.url);
  const isLocal =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "::1" ||
    url.hostname === "[::1]";
  const email = emailHeader || (isLocal ? "local@cashflow.local" : "");
  if (!email) return null;

  const encodedName = request.headers.get(NAME_HEADER);
  const displayName =
    encodedName &&
    request.headers.get(NAME_ENCODING_HEADER) === "percent-encoded-utf-8"
      ? safeDecode(encodedName) || email.split("@")[0]
      : email === "local@cashflow.local"
        ? "Local user"
        : email.split("@")[0];

  return { email, displayName };
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}

export { and, asc, desc, eq, gte, lte, sql };
