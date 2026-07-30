import type { Budget, FinanceData, Transaction } from "./types";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function localDate(value = new Date()) {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

export function currentMonthKey(value = new Date()) {
  return localDate(value).slice(0, 7);
}

export function currentMonthStart(value = new Date()) {
  return `${currentMonthKey(value)}-01`;
}

export function currentYearStart(value = new Date()) {
  return `${value.getFullYear()}-01-01`;
}

export function currentQuarterStart(value = new Date()) {
  const quarterStartMonth = Math.floor(value.getMonth() / 3) * 3;
  return `${value.getFullYear()}-${pad(quarterStartMonth + 1)}-01`;
}

export function currentWeekStart(value = new Date()) {
  const start = new Date(value);
  const day = start.getDay();
  start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
  return localDate(start);
}

export function monthLabel(value = new Date()) {
  return new Intl.DateTimeFormat("en-AU", {
    month: "long",
    year: "numeric",
  }).format(value);
}

export function headingDate(value = new Date()) {
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(value);
}

export function reportDate(value = new Date()) {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(value);
}

export function daysInCurrentMonth(value = new Date()) {
  return new Date(value.getFullYear(), value.getMonth() + 1, 0).getDate();
}

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
  const month = currentMonthKey();
  return data.transactions.filter(
    (transaction) =>
      transaction.status === "completed" &&
      transaction.date.startsWith(month),
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
