import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { getDb } from ".";
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

export type FinanceUser = typeof users.$inferSelect;

export class FinanceAuthError extends Error {
  constructor() {
    super("Sign in is required to access finance data.");
    this.name = "FinanceAuthError";
  }
}

export async function getFinanceUser(
  request: Request,
  options: { seed?: boolean } = {},
): Promise<FinanceUser> {
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

  if (options.seed !== false && !user.seededAt) {
    await seedFinanceUser(user);
    const [seededUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    return seededUser ?? user;
  }

  return user;
}

export async function seedFinanceUser(user: FinanceUser): Promise<void> {
  const db = getDb();
  const today = new Date();
  const date = (dayOffset: number, hour = 9) => {
    const value = new Date(today);
    value.setUTCDate(value.getUTCDate() + dayOffset);
    value.setUTCHours(hour, 0, 0, 0);
    return value.toISOString();
  };
  const dateOnly = (dayOffset: number) => date(dayOffset).slice(0, 10);
  const id = (kind: string, slug: string) => `${user.id}:${kind}:${slug}`;

  const categoryRows: Array<typeof categories.$inferInsert> = [
    ["salary", "Salary", "income", "#34C88A", "briefcase"],
    ["freelance", "Freelance", "income", "#4C9AFF", "sparkles"],
    ["groceries", "Groceries", "expense", "#FFB155", "shopping-basket"],
    ["dining", "Dining", "expense", "#F98E77", "utensils"],
    ["transport", "Transport", "expense", "#6C8CFF", "car"],
    ["housing", "Housing", "expense", "#8D80F8", "house"],
    ["utilities", "Utilities", "expense", "#47B8B0", "zap"],
    ["subscriptions", "Subscriptions", "expense", "#D170E8", "repeat"],
    ["shopping", "Shopping", "expense", "#EC72A4", "shopping-bag"],
    ["entertainment", "Entertainment", "expense", "#FF8E64", "film"],
    ["health", "Health", "expense", "#5BC1A7", "heart-pulse"],
    ["travel", "Travel", "expense", "#5F9BFF", "plane"],
    ["education", "Education", "expense", "#D09A48", "graduation-cap"],
    ["other", "Other", "expense", "#8C92A4", "circle"],
  ].map(([slug, name, type, color, icon]) => ({
    id: id("category", slug),
    userId: user.id,
    name,
    type,
    color,
    icon,
    isSystem: true,
  }));

  const accountRows: Array<typeof accounts.$inferInsert> = [
    {
      id: id("account", "salary"),
      userId: user.id,
      name: "Account A · Salary",
      bankName: "Northstar Bank",
      accountType: "checking",
      purpose: "salary",
      openingBalanceCents: 0,
      currentBalanceCents: 100000,
      currency: user.defaultCurrency,
      color: "#7A6BEF",
      icon: "landmark",
      notes: "Income only. Distribute funds from here.",
    },
    {
      id: id("account", "daily"),
      userId: user.id,
      name: "Account B · Daily",
      bankName: "Northstar Bank",
      accountType: "checking",
      purpose: "daily",
      openingBalanceCents: 0,
      currentBalanceCents: 93430,
      currency: user.defaultCurrency,
      color: "#FF9E6D",
      icon: "wallet-cards",
      notes: "Everyday spending only.",
    },
    {
      id: id("account", "bills"),
      userId: user.id,
      name: "Account B+ · Bills",
      bankName: "Northstar Bank",
      accountType: "checking",
      purpose: "bills",
      openingBalanceCents: 0,
      currentBalanceCents: 28100,
      currency: user.defaultCurrency,
      color: "#42B6A4",
      icon: "receipt-text",
      notes: "Reserved for recurring household bills.",
    },
    {
      id: id("account", "international"),
      userId: user.id,
      name: "Account C · International",
      bankName: "Atlas Money",
      accountType: "checking",
      purpose: "international",
      openingBalanceCents: 20000,
      currentBalanceCents: 16701,
      currency: user.defaultCurrency,
      color: "#5B9CF6",
      icon: "globe-2",
      notes: "Subscriptions and international payments.",
    },
    {
      id: id("account", "savings"),
      userId: user.id,
      name: "Account D · Long-Term Savings",
      bankName: "Northstar Bank",
      accountType: "savings",
      purpose: "savings",
      openingBalanceCents: 840000,
      currentBalanceCents: 900000,
      currency: user.defaultCurrency,
      color: "#B77AE7",
      icon: "piggy-bank",
      notes: "Emergency fund and long-term goals.",
    },
  ];

  const transactionRows: Array<typeof transactions.$inferInsert> = [
    {
      id: id("transaction", "salary"),
      userId: user.id,
      accountId: id("account", "salary"),
      categoryId: id("category", "salary"),
      title: "Monthly salary",
      description: "Regular salary deposit",
      amountCents: 500000,
      type: "income",
      occurredAt: date(-14, 8),
      merchant: "Acme Studio",
      paymentMethod: "bank-transfer",
      tagsJson: '["salary","recurring"]',
      isRecurring: true,
      status: "completed",
    },
    {
      id: id("transaction", "rent"),
      userId: user.id,
      accountId: id("account", "bills"),
      categoryId: id("category", "housing"),
      title: "Apartment rent",
      amountCents: 185000,
      type: "expense",
      occurredAt: date(-12, 9),
      merchant: "Parkside Property",
      paymentMethod: "direct-debit",
      isRecurring: true,
      status: "completed",
    },
    {
      id: id("transaction", "phone"),
      userId: user.id,
      accountId: id("account", "bills"),
      categoryId: id("category", "utilities"),
      title: "Mobile plan",
      amountCents: 6900,
      type: "expense",
      occurredAt: date(-8, 10),
      merchant: "Orbit Mobile",
      paymentMethod: "direct-debit",
      isRecurring: true,
      status: "completed",
    },
    {
      id: id("transaction", "groceries"),
      userId: user.id,
      accountId: id("account", "daily"),
      categoryId: id("category", "groceries"),
      title: "Weekly groceries",
      amountCents: 14280,
      type: "expense",
      occurredAt: date(-5, 17),
      merchant: "The Fresh Market",
      paymentMethod: "card",
      tagsJson: '["essentials"]',
      status: "completed",
    },
    {
      id: id("transaction", "coffee"),
      userId: user.id,
      accountId: id("account", "daily"),
      categoryId: id("category", "dining"),
      title: "Morning coffee",
      amountCents: 650,
      type: "expense",
      occurredAt: date(-3, 8),
      merchant: "Common Ground",
      paymentMethod: "card",
      status: "completed",
    },
    {
      id: id("transaction", "fuel"),
      userId: user.id,
      accountId: id("account", "daily"),
      categoryId: id("category", "transport"),
      title: "Fuel",
      amountCents: 8240,
      type: "expense",
      occurredAt: date(-2, 18),
      merchant: "Ampol",
      paymentMethod: "card",
      status: "completed",
    },
    {
      id: id("transaction", "cinema"),
      userId: user.id,
      accountId: id("account", "daily"),
      categoryId: id("category", "entertainment"),
      title: "Cinema tickets",
      amountCents: 3400,
      type: "expense",
      occurredAt: date(-1, 20),
      merchant: "Palace Cinema",
      paymentMethod: "card",
      status: "completed",
    },
    {
      id: id("transaction", "chatgpt"),
      userId: user.id,
      accountId: id("account", "international"),
      categoryId: id("category", "subscriptions"),
      title: "ChatGPT Plus",
      amountCents: 3299,
      type: "expense",
      occurredAt: date(-6, 7),
      merchant: "OpenAI",
      paymentMethod: "card",
      tagsJson: '["software","subscription"]',
      isRecurring: true,
      status: "completed",
    },
  ];

  const transferRows: Array<typeof transfers.$inferInsert> = [
    {
      id: id("transfer", "salary-bills"),
      userId: user.id,
      fromAccountId: id("account", "salary"),
      toAccountId: id("account", "bills"),
      amountCents: 220000,
      transferDate: date(-13, 8),
      notes: "Monthly bills reserve",
      status: "completed",
    },
    {
      id: id("transfer", "salary-daily"),
      userId: user.id,
      fromAccountId: id("account", "salary"),
      toAccountId: id("account", "daily"),
      amountCents: 120000,
      transferDate: date(-13, 8),
      notes: "Monthly everyday spending",
      status: "completed",
    },
    {
      id: id("transfer", "salary-savings"),
      userId: user.id,
      fromAccountId: id("account", "salary"),
      toAccountId: id("account", "savings"),
      amountCents: 60000,
      transferDate: date(-13, 8),
      notes: "Automatic savings contribution",
      status: "completed",
    },
  ];

  await db.insert(categories).values(categoryRows).onConflictDoNothing();
  await db.insert(accounts).values(accountRows).onConflictDoNothing();
  for (let offset = 0; offset < transactionRows.length; offset += 4) {
    await db
      .insert(transactions)
      .values(transactionRows.slice(offset, offset + 4))
      .onConflictDoNothing();
  }
  await db.insert(transfers).values(transferRows).onConflictDoNothing();

  await db
    .insert(budgets)
    .values([
      {
        id: id("budget", "groceries"),
        userId: user.id,
        categoryId: id("category", "groceries"),
        name: "Groceries",
        monthlyLimitCents: 65000,
        weeklyLimitCents: 16000,
        dailyLimitCents: 4000,
      },
      {
        id: id("budget", "dining"),
        userId: user.id,
        categoryId: id("category", "dining"),
        name: "Dining & coffee",
        monthlyLimitCents: 22000,
        weeklyLimitCents: 5500,
        dailyLimitCents: 1800,
      },
      {
        id: id("budget", "transport"),
        userId: user.id,
        categoryId: id("category", "transport"),
        name: "Transport",
        monthlyLimitCents: 32000,
        weeklyLimitCents: 8000,
        dailyLimitCents: 2500,
      },
      {
        id: id("budget", "entertainment"),
        userId: user.id,
        categoryId: id("category", "entertainment"),
        name: "Entertainment",
        monthlyLimitCents: 18000,
        weeklyLimitCents: 4500,
        dailyLimitCents: 1800,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(goals)
    .values([
      {
        id: id("goal", "emergency"),
        userId: user.id,
        name: "Emergency fund",
        targetAmountCents: 1500000,
        currentAmountCents: 900000,
        deadline: dateOnly(240),
        monthlyContributionCents: 60000,
        notes: "Six months of essential expenses",
      },
      {
        id: id("goal", "holiday"),
        userId: user.id,
        name: "Japan trip",
        targetAmountCents: 650000,
        currentAmountCents: 238000,
        deadline: dateOnly(330),
        monthlyContributionCents: 42000,
        notes: "Flights, stays and experiences",
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(bills)
    .values([
      {
        id: id("bill", "rent"),
        userId: user.id,
        accountId: id("account", "bills"),
        categoryId: id("category", "housing"),
        name: "Apartment rent",
        amountCents: 185000,
        dueDate: dateOnly(7),
        frequency: "monthly",
        isAutoPay: true,
      },
      {
        id: id("bill", "electricity"),
        userId: user.id,
        accountId: id("account", "bills"),
        categoryId: id("category", "utilities"),
        name: "Electricity",
        amountCents: 12400,
        dueDate: dateOnly(11),
        frequency: "monthly",
      },
      {
        id: id("bill", "internet"),
        userId: user.id,
        accountId: id("account", "bills"),
        categoryId: id("category", "utilities"),
        name: "Home internet",
        amountCents: 7900,
        dueDate: dateOnly(15),
        frequency: "monthly",
        isAutoPay: true,
      },
      {
        id: id("bill", "chatgpt"),
        userId: user.id,
        accountId: id("account", "international"),
        categoryId: id("category", "subscriptions"),
        name: "ChatGPT Plus",
        amountCents: 3299,
        dueDate: dateOnly(19),
        frequency: "monthly",
        isAutoPay: true,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(activity)
    .values({
      id: id("activity", "welcome"),
      userId: user.id,
      entityType: "profile",
      entityId: user.id,
      action: "seeded",
      summary: "CashFlow OS workspace created",
      metadataJson: '{"source":"first-use"}',
    })
    .onConflictDoNothing();

  await db
    .update(users)
    .set({
      seededAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
      updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
    })
    .where(eq(users.id, user.id));
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
      .orderBy(desc(transactions.occurredAt), desc(transactions.createdAt))
      .limit(200),
    db
      .select()
      .from(transfers)
      .where(eq(transfers.userId, userId))
      .orderBy(desc(transfers.transferDate), desc(transfers.createdAt))
      .limit(100),
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
  const healthScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        52 +
          Math.min(22, savingsRate * 0.45) +
          (totalBalanceCents > upcomingBillsCents * 3 ? 14 : 4),
      ),
    ),
  );

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
  const db = getDb();
  await db.delete(users).where(eq(users.id, user.id));
  const replacement: typeof users.$inferInsert = {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    defaultCurrency: user.defaultCurrency,
  };
  await db.insert(users).values(replacement);
  const [fresh] = await db
    .select()
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  if (!fresh) throw new Error("Unable to reset the finance workspace.");
  await seedFinanceUser(fresh);
  const [seeded] = await db
    .select()
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  return seeded ?? fresh;
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
  const email = emailHeader || (isLocal ? "demo@cashflow.local" : "");
  if (!email) return null;

  const encodedName = request.headers.get(NAME_HEADER);
  const displayName =
    encodedName &&
    request.headers.get(NAME_ENCODING_HEADER) === "percent-encoded-utf-8"
      ? safeDecode(encodedName) || email.split("@")[0]
      : email === "demo@cashflow.local"
        ? "Alex Morgan"
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
