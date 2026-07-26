import type { Budget, FinanceData, Transaction } from "./types";

export const TODAY = "2026-07-26";
export const CURRENT_MONTH = "2026-07";

export function currency(value: number, code = "AUD", compact = false) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: code,
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 2,
  }).format(value);
}

export function shortDate(value: string) {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
  }).format(new Date(`${value}T12:00:00`));
}

export function longDate(value: string) {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

export function completedMonthTransactions(data: FinanceData) {
  return data.transactions.filter(
    (transaction) =>
      transaction.status === "completed" &&
      transaction.date.startsWith(CURRENT_MONTH),
  );
}

export function totalBalance(data: FinanceData) {
  return data.accounts
    .filter((account) => !account.archived)
    .reduce((total, account) => total + account.balance, 0);
}

export function monthlyIncome(data: FinanceData) {
  return completedMonthTransactions(data)
    .filter((transaction) => transaction.type === "income")
    .reduce((total, transaction) => total + transaction.amount, 0);
}

export function monthlyExpenses(data: FinanceData) {
  return completedMonthTransactions(data)
    .filter((transaction) => transaction.type === "expense")
    .reduce((total, transaction) => total + transaction.amount, 0);
}

export function spendingForBudget(data: FinanceData, budget: Budget) {
  return completedMonthTransactions(data)
    .filter(
      (transaction) =>
        transaction.type === "expense" &&
        transaction.categoryId === budget.categoryId,
    )
    .reduce((total, transaction) => total + transaction.amount, 0);
}

export function budgetSummary(data: FinanceData) {
  const limit = data.budgets
    .filter((budget) => budget.status === "active")
    .reduce((total, budget) => total + budget.monthlyLimit, 0);
  const spent = data.budgets
    .filter((budget) => budget.status === "active")
    .reduce((total, budget) => total + spendingForBudget(data, budget), 0);
  return { limit, spent, remaining: limit - spent };
}

export function savingsRate(data: FinanceData) {
  const income = monthlyIncome(data);
  if (!income) return 0;
  return Math.max(0, ((income - monthlyExpenses(data)) / income) * 100);
}

export function financialHealthScore(data: FinanceData) {
  const rate = savingsRate(data);
  const overspent = data.budgets.filter(
    (budget) => spendingForBudget(data, budget) > budget.monthlyLimit,
  ).length;
  const overdue = data.bills.filter((bill) => bill.status === "overdue").length;
  const emergency = data.goals.find((goal) =>
    goal.name.toLowerCase().includes("emergency"),
  );
  const emergencyScore = emergency
    ? Math.min(15, (emergency.currentAmount / emergency.targetAmount) * 15)
    : 0;
  return Math.round(
    Math.max(
      0,
      Math.min(100, 60 + Math.min(20, rate / 2) + emergencyScore - overspent * 4 - overdue * 7),
    ),
  );
}

export function categorySpending(data: FinanceData) {
  const totals = new Map<string, number>();
  completedMonthTransactions(data)
    .filter((transaction) => transaction.type === "expense")
    .forEach((transaction) =>
      totals.set(
        transaction.categoryId,
        (totals.get(transaction.categoryId) ?? 0) + transaction.amount,
      ),
    );
  return [...totals.entries()]
    .map(([categoryId, amount]) => ({
      category: data.categories.find((item) => item.id === categoryId),
      amount,
    }))
    .sort((a, b) => b.amount - a.amount);
}

export function accountMonthTotals(data: FinanceData, accountId: string) {
  const transactions = completedMonthTransactions(data).filter(
    (transaction) => transaction.accountId === accountId,
  );
  return {
    income: transactions
      .filter((transaction) => transaction.type === "income")
      .reduce((sum, transaction) => sum + transaction.amount, 0),
    expenses: transactions
      .filter((transaction) => transaction.type === "expense")
      .reduce((sum, transaction) => sum + transaction.amount, 0),
  };
}

export function goalMonthsRemaining(
  target: number,
  current: number,
  contribution: number,
) {
  if (current >= target) return 0;
  if (contribution <= 0) return null;
  return Math.ceil((target - current) / contribution);
}

export function accountName(data: FinanceData, id: string) {
  return data.accounts.find((account) => account.id === id)?.name ?? "Unknown account";
}

export function categoryName(data: FinanceData, id: string) {
  return data.categories.find((category) => category.id === id)?.name ?? "Uncategorised";
}

export function sortedTransactions(
  transactions: Transaction[],
  sort: "newest" | "oldest" | "highest" | "lowest",
) {
  return [...transactions].sort((a, b) => {
    if (sort === "highest") return b.amount - a.amount;
    if (sort === "lowest") return a.amount - b.amount;
    const difference = `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`);
    return sort === "oldest" ? -difference : difference;
  });
}
