"use client";

/* eslint-disable @typescript-eslint/no-explicit-any -- API records are normalized at the network boundary before entering the typed finance model. */

import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  accountMonthTotals,
  accountName,
  budgetSummary,
  categoryName,
  categorySpending,
  completedMonthTransactions,
  currentMonthKey,
  currentMonthStart,
  currentQuarterStart,
  currentWeekStart,
  currentYearStart,
  currency,
  daysInCurrentMonth,
  financialHealthScore,
  goalMonthsRemaining,
  headingDate,
  localDate,
  longDate,
  monthLabel,
  monthlyExpenses,
  monthlyIncome,
  reportDate,
  savingsRate,
  shortDate,
  sortedTransactions,
  spendingForBudget,
  totalBalance,
} from "./finance";
import type {
  Account,
  Bill,
  Budget,
  EditorState,
  FinanceData,
  FinancePreferences,
  Goal,
  ModuleId,
  ResourceKind,
  Transaction,
  Transfer,
} from "./types";

type Toast = { title: string; detail?: string; tone?: "success" | "danger" | "info" };
type ConfirmState = {
  kind: ResourceKind;
  id: string;
  label: string;
} | null;
type Preferences = {
  defaultCurrency: string;
  timezone: string;
  language: string;
  theme: "light" | "dark" | "system";
  billReminders: boolean;
  budgetAlerts: boolean;
  largeTransactionAlerts: boolean;
};
const DEFAULT_PREFERENCES: Preferences = { defaultCurrency: "AUD", timezone: "Australia/Melbourne", language: "en-AU", theme: "system", billReminders: true, budgetAlerts: true, largeTransactionAlerts: true };

const NAV_ITEMS: { id: ModuleId; label: string; glyph: string }[] = [
  { id: "overview", label: "Overview", glyph: "⌂" },
  { id: "transactions", label: "Transactions", glyph: "↕" },
  { id: "accounts", label: "Accounts", glyph: "▰" },
  { id: "budgets", label: "Budgets", glyph: "◒" },
  { id: "goals", label: "Goals", glyph: "◎" },
  { id: "bills", label: "Bills", glyph: "◷" },
  { id: "reports", label: "Reports", glyph: "⌁" },
];

const RESOURCE_LIST: Record<ResourceKind, keyof FinanceData> = {
  transaction: "transactions",
  account: "accounts",
  transfer: "transfers",
  budget: "budgets",
  goal: "goals",
  bill: "bills",
};

const API_RESOURCE: Record<ResourceKind, string> = {
  transaction: "transactions",
  account: "accounts",
  transfer: "transfers",
  budget: "budgets",
  goal: "goals",
  bill: "bills",
};

const EMPTY_FINANCE_DATA: FinanceData = {
  preferences: {
    defaultCurrency: "AUD",
    timezone: "Australia/Melbourne",
    language: "en-AU",
    billReminders: true,
    budgetAlerts: true,
    largeTransactionAlerts: true,
  },
  accounts: [],
  categories: [],
  transactions: [],
  transfers: [],
  budgets: [],
  goals: [],
  bills: [],
  activity: [],
};

function toNumber(value: FormDataEntryValue | null, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function valueInDollars(raw: any, plain: string, cents: string, fallback = 0) {
  if (typeof raw?.[plain] === "number") return raw[plain];
  if (typeof raw?.[cents] === "number") return raw[cents] / 100;
  return fallback;
}

function localTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "12:00";
  return `${String(parsed.getHours()).padStart(2, "0")}:${String(parsed.getMinutes()).padStart(2, "0")}`;
}

function localDateFromTimestamp(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? localDate() : localDate(parsed);
}

function defaultGoalDeadline() {
  const value = new Date();
  value.setFullYear(value.getFullYear() + 1);
  return localDate(value);
}

function creationRequirement(kind: ResourceKind, data: FinanceData) {
  const activeAccounts = data.accounts.filter((account) => !account.archived);
  const expenseCategories = data.categories.filter(
    (category) => category.kind === "expense" || category.kind === "both",
  );
  const transactionCategories = data.categories.filter(
    (category) => category.kind === "income" || category.kind === "expense" || category.kind === "both",
  );

  if (kind === "transaction") {
    if (!activeAccounts.length) return "Add an account before recording a transaction.";
    if (!transactionCategories.length) return "Transaction categories are still being prepared. Try again shortly.";
  }
  if (kind === "transfer" && activeAccounts.length < 2) {
    return "Add at least two active accounts before transferring money.";
  }
  if (kind === "budget" && !expenseCategories.length) {
    return "Expense categories are still being prepared. Try again shortly.";
  }
  if (kind === "bill") {
    if (!activeAccounts.length) return "Add an account before scheduling a bill.";
    if (!expenseCategories.length) return "Expense categories are still being prepared. Try again shortly.";
  }
  return null;
}

function normalizeFinance(raw: any): FinanceData {
  const source = raw?.data ?? raw;
  const requiredLists = [
    "accounts",
    "categories",
    "transactions",
    "transfers",
    "budgets",
    "goals",
    "bills",
  ];
  if (
    !source ||
    typeof source !== "object" ||
    requiredLists.some((key) => !Array.isArray(source[key]))
  ) {
    throw new Error("The finance service returned an invalid data snapshot.");
  }

  return {
    preferences: {
      defaultCurrency:
        source.preferences?.defaultCurrency ??
        source.user?.defaultCurrency ??
        "AUD",
      timezone: source.preferences?.timezone ?? "Australia/Melbourne",
      language: source.preferences?.language ?? "en-AU",
      billReminders: source.preferences?.billReminders ?? true,
      budgetAlerts: source.preferences?.budgetAlerts ?? true,
      largeTransactionAlerts:
        source.preferences?.largeTransactionAlerts ?? true,
    },
    accounts: source.accounts.map((item: any) => ({
      id: String(item.id),
      name: item.name ?? item.accountName ?? "Account",
      bankName: item.bankName ?? item.institution ?? "",
      type:
        item.type ??
        ({
          salary: "Salary",
          daily: "Transaction",
          bills: "Bills",
          international: "International",
          savings: "Savings",
        } as Record<string, string>)[item.purpose] ??
        item.accountType ??
        "Transaction",
      balance: valueInDollars(item, "balance", "balanceCents",
        valueInDollars(item, "currentBalance", "currentBalanceCents")),
      openingBalance: valueInDollars(item, "openingBalance", "openingBalanceCents"),
      currency: item.currency ?? "AUD",
      color: item.color ?? item.accountColor ?? "#6f74e8",
      icon: (() => {
        const rawIcon = item.icon ?? item.accountIcon;
        if (typeof rawIcon === "string" && rawIcon.length <= 3) return rawIcon;
        const match = String(item.name ?? "").match(/Account\s+(B\+|[A-Z])/i);
        return match?.[1]?.toUpperCase() ?? "A";
      })(),
      notes: item.notes ?? "",
      archived: Boolean(item.archived ?? item.isArchived),
      purpose: item.purpose ?? "custom",
      rule: item.rule ?? item.accountRule ?? ({
        salary: "Income only · no card spending",
        daily: "Daily spending only",
        bills: "Essential scheduled bills",
        international: "Subscriptions and international",
        savings: "Long-term savings",
      } as Record<string, string>)[item.purpose] ?? "",
    })),
    categories: (source.categories ?? []).map((item: any) => ({
      id: String(item.id),
      name: item.name ?? "Other",
      kind: item.kind ?? item.type ?? "expense",
      color: item.color ?? "#8f98a7",
      icon: typeof item.icon === "string" && item.icon.length <= 2 ? item.icon : String(item.name ?? "·").slice(0, 1),
    })),
    transactions: (source.transactions ?? []).map((item: any) => ({
      id: String(item.id),
      title: item.title ?? "Transaction",
      description: item.description ?? "",
      amount: valueInDollars(item, "amount", "amountCents"),
      type: item.type ?? "expense",
      categoryId: String(item.categoryId ?? ""),
      accountId: String(item.accountId ?? ""),
      date:
        item.date ??
        item.transactionDate ??
        (typeof item.occurredAt === "string"
          ? localDateFromTimestamp(item.occurredAt)
          : localDate()),
      time:
        item.time ??
        item.transactionTime ??
        (typeof item.occurredAt === "string" ? localTime(item.occurredAt) : "12:00"),
      merchant: item.merchant ?? "",
      paymentMethod: item.paymentMethod ?? "Debit card",
      tags: Array.isArray(item.tags)
        ? item.tags
        : typeof item.tags === "string"
          ? item.tags.split(",").filter(Boolean)
          : typeof item.tagsJson === "string"
            ? (() => {
                try {
                  const tags = JSON.parse(item.tagsJson);
                  return Array.isArray(tags) ? tags : [];
                } catch {
                  return [];
                }
              })()
            : [],
      notes: item.notes ?? "",
      receiptName: item.receiptName ?? (item.receiptUrl ? "Saved receipt" : undefined),
      receiptKey: item.receiptKey ?? undefined,
      receiptUrl: item.receiptUrl ?? undefined,
      receiptContentType: item.receiptContentType ?? undefined,
      receiptSize:
        typeof item.receiptSize === "number" ? item.receiptSize : undefined,
      location: item.location ?? "",
      recurring: Boolean(item.recurring ?? item.isRecurring),
      status: item.status ?? "completed",
      createdAt: item.createdAt,
    })),
    transfers: (source.transfers ?? []).map((item: any) => ({
      id: String(item.id),
      fromAccountId: String(item.fromAccountId ?? ""),
      toAccountId: String(item.toAccountId ?? ""),
      amount: valueInDollars(item, "amount", "amountCents"),
      date: String(item.date ?? item.transferDate ?? localDate()).slice(0, 10),
      notes: item.notes ?? "",
      status: item.status ?? "completed",
      createdAt: item.createdAt,
    })),
    budgets: (source.budgets ?? []).map((item: any) => ({
      id: String(item.id),
      name: item.name ?? "Budget",
      categoryId: String(item.categoryId ?? ""),
      accountId: item.accountId ?? null,
      monthlyLimit: valueInDollars(item, "monthlyLimit", "monthlyLimitCents"),
      weeklyLimit: valueInDollars(item, "weeklyLimit", "weeklyLimitCents"),
      dailyLimit: valueInDollars(item, "dailyLimit", "dailyLimitCents"),
      resetDay: Number(item.resetDay ?? 1),
      status: item.status ?? "active",
    })),
    goals: (source.goals ?? []).map((item: any) => ({
      id: String(item.id),
      name: item.name ?? "Goal",
      targetAmount: valueInDollars(item, "targetAmount", "targetAmountCents"),
      currentAmount: valueInDollars(item, "currentAmount", "currentAmountCents"),
      deadline: item.deadline ?? defaultGoalDeadline(),
      monthlyContribution: valueInDollars(
        item,
        "monthlyContribution",
        "monthlyContributionCents",
      ),
      notes: item.notes ?? "",
      color: item.color ?? "#6f74e8",
      status: item.status ?? "active",
    })),
    bills: (source.bills ?? []).map((item: any) => ({
      id: String(item.id),
      name: item.name ?? "Bill",
      amount: valueInDollars(item, "amount", "amountCents"),
      dueDate: item.dueDate ?? localDate(),
      accountId: String(item.accountId ?? ""),
      categoryId: String(item.categoryId ?? ""),
      reminderDays: Number(item.reminderDays ?? 3),
      frequency: item.frequency ?? "monthly",
      status: item.status ?? "upcoming",
      autopay: Boolean(item.autopay ?? item.autoPay ?? item.isAutoPay),
      notes: item.notes ?? "",
    })),
    activity: source.activity ?? [],
  };
}

function payloadForApi(kind: ResourceKind, value: any) {
  if (kind === "transaction" || kind === "transfer" || kind === "bill") {
    value.amountCents = Math.round(value.amount * 100);
  }
  if (kind === "account") {
    value.balanceCents = Math.round(value.balance * 100);
    value.openingBalanceCents = Math.round(value.openingBalance * 100);
    value.currentBalanceCents = value.balanceCents;
    value.accountType = value.type;
    value.isArchived = Boolean(value.archived);
    value.purpose =
      value.purpose ??
      (/salary/i.test(value.type) ? "salary" :
        /bill/i.test(value.type) ? "bills" :
          /saving/i.test(value.type) ? "savings" :
            /international/i.test(value.type) ? "international" :
              /transaction/i.test(value.type) ? "daily" : "custom");
  }
  if (kind === "budget") {
    value.monthlyLimitCents = Math.round(value.monthlyLimit * 100);
    value.weeklyLimitCents = Math.round(value.weeklyLimit * 100);
    value.dailyLimitCents = Math.round(value.dailyLimit * 100);
    value.resetDay = Number(value.resetDay ?? 1);
  }
  if (kind === "goal") {
    value.targetAmountCents = Math.round(value.targetAmount * 100);
    value.currentAmountCents = Math.round(value.currentAmount * 100);
    value.monthlyContributionCents = Math.round(value.monthlyContribution * 100);
  }
  if (kind === "transaction") {
    value.isRecurring = Boolean(value.recurring);
    value.occurredAt = new Date(`${value.date}T${value.time || "12:00"}:00`).toISOString();
    value.receiptUrl = value.receiptUrl ?? (value.receiptKey ? `/api/finance/receipts/${encodeURIComponent(value.receiptKey)}` : undefined);
  }
  if (kind === "transfer") {
    value.transferDate = value.date;
    if (value.status === "scheduled") value.status = "pending";
  }
  if (kind === "bill") {
    value.isAutoPay = Boolean(value.autopay);
  }
  return value;
}

export default function CashflowApp({
  userName,
  initialData,
  initialPreferences,
}: {
  userName: string;
  initialData?: unknown;
  initialPreferences?: Partial<Preferences>;
}) {
  const hasInitialData = initialData !== undefined;
  const [data, setData] = useState<FinanceData>(() =>
    hasInitialData ? normalizeFinance(initialData) : EMPTY_FINANCE_DATA,
  );
  const [active, setActive] = useState<ModuleId>("overview");
  const [editor, setEditor] = useState<EditorState>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [isLoading, setIsLoading] = useState(!hasInitialData);
  const [hasLoadedData, setHasLoadedData] = useState(hasInitialData);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [preferences, setPreferences] = useState<Preferences>({ ...DEFAULT_PREFERENCES, ...initialPreferences });
  const [commandOpen, setCommandOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch("/api/finance", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        const failure = await response
          .json()
          .catch(() => null) as { error?: string } | null;
        throw new Error(failure?.error ?? "Could not load your finance data.");
      }
      const payload = await response.json();
      setData(normalizeFinance(payload));
      setHasLoadedData(true);
      setLoadError(null);
      return true;
    } catch (error) {
      setLoadError(
        error instanceof DOMException && error.name === "AbortError"
          ? "Finance storage took too long to respond. Check the development server and try again."
          : error instanceof Error
          ? error.message
          : "Could not load your finance data.",
      );
      return false;
    } finally {
      window.clearTimeout(timeout);
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const task = window.setTimeout(() => void loadData(hasInitialData), 0);
    return () => window.clearTimeout(task);
  }, [hasInitialData, loadData]);

  useEffect(() => {
    const stored = window.localStorage.getItem("cashflow-theme");
    const nextTheme =
      stored === "dark" ||
      (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches)
        ? "dark"
        : "light";
    const task = window.setTimeout(() => setTheme(nextTheme), 0);
    return () => window.clearTimeout(task);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("cashflow-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const openEditor = useCallback(
    (state: EditorState) => {
      if (!state) {
        setEditor(null);
        return;
      }
      if (state.mode === "create") {
        const requirement = creationRequirement(state.kind, data);
        if (requirement) {
          setToast({
            title: "One setup step first",
            detail: requirement,
            tone: "info",
          });
          return;
        }
      }
      setEditor(state);
    },
    [data],
  );

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      const typing =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT";
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((value) => !value);
      } else if (!typing && event.key.toLowerCase() === "n") {
        event.preventDefault();
        openEditor({ kind: "transaction", mode: "create" });
      } else if (!typing && event.key === "/") {
        event.preventDefault();
        setActive("transactions");
        window.setTimeout(() => searchRef.current?.focus(), 0);
      } else if (event.key === "Escape") {
        setEditor(null);
        setCommandOpen(false);
        setAssistantOpen(false);
        setNotificationsOpen(false);
        setSettingsOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openEditor]);

  const saveResource = useCallback(
    async (kind: ResourceKind, item: any, editingId?: string) => {
      const resource = API_RESOURCE[kind];
      setEditor(null);
      setIsSyncing(true);
      try {
        const response = await fetch(
          `/api/finance/${resource}${editingId ? `/${editingId}` : ""}`,
          {
            method: editingId ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payloadForApi(kind, { ...item })),
          },
        );
        if (!response.ok) {
          const failure = await response
            .json()
            .catch(() => null) as { error?: string } | null;
          throw new Error(failure?.error ?? "Unable to save this record.");
        }
        const refreshed = await loadData(true);
        setEditor(null);
        setToast({
          title: `${kind[0].toUpperCase()}${kind.slice(1)} ${editingId ? "updated" : "created"}`,
          detail: refreshed
            ? "Dashboard totals and forecasts are up to date."
            : "Saved in the backend. Retry the refresh to load the latest totals.",
          tone: refreshed ? "success" : "info",
        });
      } catch (error) {
        setToast({
          title: "Change not saved",
          detail: error instanceof Error ? error.message : "Please try again.",
          tone: "danger",
        });
      } finally {
        setIsSyncing(false);
      }
    },
    [loadData],
  );

  const deleteResource = useCallback(async () => {
    if (!confirm) return;
    const { kind, id, label } = confirm;
    setConfirm(null);
    setIsSyncing(true);
    try {
      const response = await fetch(`/api/finance/${API_RESOURCE[kind]}/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const failure = await response
          .json()
          .catch(() => null) as { error?: string } | null;
        throw new Error(failure?.error ?? "Unable to delete this record.");
      }
      const refreshed = await loadData(true);
      setToast({
        title: `${label} deleted`,
        detail: refreshed
          ? "Your totals were recalculated."
          : "Deleted from the backend. Retry the refresh to load the latest totals.",
        tone: refreshed ? "success" : "info",
      });
    } catch (error) {
      setToast({
        title: "Delete failed",
        detail: error instanceof Error ? error.message : "Please try again.",
        tone: "danger",
      });
    } finally {
      setIsSyncing(false);
    }
  }, [confirm, loadData]);

  const markBillPaid = useCallback(
    async (bill: Bill) => {
      setIsSyncing(true);
      try {
        const response = await fetch(`/api/finance/bills/${bill.id}/pay`, {
          method: "POST",
        });
        if (!response.ok) throw new Error("Unable to mark the bill paid.");
        const refreshed = await loadData(true);
        setToast({
          title: `${bill.name} paid`,
          detail: refreshed
            ? `${currency(bill.amount)} was recorded and your account balance updated.`
            : "Payment was recorded in the backend. Retry the refresh to load the latest balance.",
          tone: refreshed ? "success" : "info",
        });
      } catch (error) {
        setToast({
          title: "Payment update failed",
          detail: error instanceof Error ? error.message : "Please try again.",
          tone: "danger",
        });
      } finally {
        setIsSyncing(false);
      }
    },
    [loadData],
  );

  const duplicateResource = (kind: Exclude<ResourceKind, "transfer">, id: string) =>
    setEditor({ kind, mode: "duplicate", id });

  const savePreferences = useCallback(async (next: Preferences) => {
    const response = await fetch("/api/finance/preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
    if (!response.ok) throw new Error("Unable to save workspace preferences.");
    setPreferences(next);
    if (next.theme !== "system") setTheme(next.theme);
    setSettingsOpen(false);
    setToast({ title: "Preferences saved", detail: "Your private workspace settings are stored securely.", tone: "success" });
  }, []);

  const activeLabel = NAV_ITEMS.find((item) => item.id === active)?.label ?? "Overview";
  const overdueCount = data.bills.filter((bill) => bill.status === "overdue").length;
  const blockingLoadError = Boolean(loadError && !hasLoadedData);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">C</span>
          <span>
            <strong>CashFlow</strong>
            <small>OS</small>
          </span>
        </div>
        <div className="workspace-chip">
          <span className="workspace-avatar">WA</span>
          <span><strong>Personal finances</strong><small>AUD · Melbourne</small></span>
          <span aria-hidden="true">⌄</span>
        </div>
        <nav className="main-nav">
          <span className="nav-label">Workspace</span>
          {NAV_ITEMS.map((item) => (
            <button
              className={active === item.id ? "nav-item active" : "nav-item"}
              key={item.id}
              onClick={() => setActive(item.id)}
              aria-current={active === item.id ? "page" : undefined}
            >
              <Glyph>{item.glyph}</Glyph>
              <span>{item.label}</span>
              {item.id === "bills" && overdueCount > 0 ? (
                <span className="nav-badge">{overdueCount}</span>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <button className="nav-item insight-nav" onClick={() => setAssistantOpen(true)}>
          <Glyph>✦</Glyph><span>AI Assistant</span><span className="new-badge">Beta</span>
        </button>
        <button className="nav-item" onClick={() => setSettingsOpen(true)}>
          <Glyph>⚙</Glyph><span>Settings</span>
        </button>
        <div className="security-note">
          <span className="security-dot" />
          <span><strong>Secure & private</strong><small>Encrypted workspace data</small></span>
        </div>
      </aside>

      <div className="app-frame">
        <header className="topbar">
          <div className="mobile-brand">
            <span className="brand-mark">C</span><strong>CashFlow OS</strong>
          </div>
          <div className="breadcrumb">
            <span>Personal finances</span><span>/</span><strong>{activeLabel}</strong>
          </div>
          <button className="month-picker" aria-label="Select reporting month">
            <span aria-hidden="true">◷</span><span>{monthLabel()}</span>
          </button>
          <div className="topbar-actions">
            <button className="search-trigger" onClick={() => setCommandOpen(true)}>
              <span aria-hidden="true">⌕</span><span>Search anything</span><kbd>⌘ K</kbd>
            </button>
            <button
              className="icon-button"
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            >
              {theme === "light" ? "☾" : "☀"}
            </button>
            <button
              className="icon-button notification-button"
              aria-label="Open notifications"
              onClick={() => setNotificationsOpen(true)}
            >
              ◌<span className="notification-dot" />
            </button>
            <button className="profile-button" onClick={() => setSettingsOpen(true)} aria-label="Open profile settings">
              <span>WA</span>
            </button>
            <button className="primary-button top-add" onClick={() => openEditor({ kind: "transaction", mode: "create" })}>
              <span aria-hidden="true">＋</span> Add transaction
            </button>
          </div>
        </header>

        <main id="main-content" className="main-content" tabIndex={-1}>
          {isLoading ? <LoadingView /> : null}
          {!isLoading && blockingLoadError ? (
            <DataErrorView
              detail={loadError ?? "Could not load your finance data."}
              onRetry={() => void loadData()}
            />
          ) : null}
          {!isLoading && loadError && hasLoadedData ? (
            <div className="data-warning" role="status">
              <span>!</span>
              <p><strong>Could not refresh the latest data.</strong><small>{loadError}</small></p>
              <button className="secondary-button small" onClick={() => void loadData()}>Retry</button>
            </div>
          ) : null}
          {!isLoading && !blockingLoadError && active === "overview" ? (
            <OverviewView
              data={data}
              userName={userName}
              onNavigate={setActive}
              onEdit={openEditor}
              onAssistant={() => setAssistantOpen(true)}
            />
          ) : null}
          {!isLoading && !blockingLoadError && active === "transactions" ? (
            <TransactionsView
              data={data}
              searchRef={searchRef}
              onEdit={openEditor}
              onDelete={(transaction) =>
                setConfirm({ kind: "transaction", id: transaction.id, label: transaction.title })
              }
              onDuplicate={(id) => duplicateResource("transaction", id)}
              onBulkDelete={async (ids) => {
                const response = await fetch("/api/finance/transactions/bulk", {
                  method: "DELETE",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ ids }),
                });
                if (!response.ok) {
                  setToast({ title: "Bulk delete failed", detail: "No records were removed from the dashboard.", tone: "danger" });
                  return;
                }
                const refreshed = await loadData(true);
                setToast({
                  title: `${ids.length} transactions deleted`,
                  detail: refreshed
                    ? "Balances and budgets were recalculated."
                    : "Deleted from the backend. Retry the refresh to load the latest totals.",
                  tone: refreshed ? "success" : "info",
                });
              }}
              onBulkUpdate={async (ids, changes) => {
                const response = await fetch("/api/finance/transactions/bulk", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ ids, changes }),
                });
                if (!response.ok) {
                  setToast({ title: "Bulk edit failed", detail: "No records were changed.", tone: "danger" });
                  return;
                }
                const refreshed = await loadData(true);
                setToast({
                  title: `${ids.length} transactions updated`,
                  detail: refreshed
                    ? "Dashboard totals are current."
                    : "Updated in the backend. Retry the refresh to load the latest totals.",
                  tone: refreshed ? "success" : "info",
                });
              }}
            />
          ) : null}
          {!isLoading && !blockingLoadError && active === "accounts" ? (
            <AccountsView
              data={data}
              onEdit={openEditor}
              onDelete={(account) =>
                setConfirm({ kind: "account", id: account.id, label: account.name })
              }
              onDuplicate={(id) => duplicateResource("account", id)}
              onArchive={(account) =>
                void saveResource("account", { ...account, archived: !account.archived }, account.id)
              }
              onDeleteTransfer={(transfer) =>
                setConfirm({ kind: "transfer", id: transfer.id, label: transfer.notes || "transfer" })
              }
            />
          ) : null}
          {!isLoading && !blockingLoadError && active === "budgets" ? (
            <BudgetsView
              data={data}
              onEdit={openEditor}
              onDelete={(budget) =>
                setConfirm({ kind: "budget", id: budget.id, label: budget.name })
              }
              onDuplicate={(id) => duplicateResource("budget", id)}
              onReset={(budget) =>
                void saveResource("budget", { ...budget, resetDay: 1 }, budget.id)
              }
            />
          ) : null}
          {!isLoading && !blockingLoadError && active === "goals" ? (
            <GoalsView
              data={data}
              onEdit={openEditor}
              onDelete={(goal) =>
                setConfirm({ kind: "goal", id: goal.id, label: goal.name })
              }
              onDuplicate={(id) => duplicateResource("goal", id)}
            />
          ) : null}
          {!isLoading && !blockingLoadError && active === "bills" ? (
            <BillsView
              data={data}
              onEdit={openEditor}
              onDelete={(bill) =>
                setConfirm({ kind: "bill", id: bill.id, label: bill.name })
              }
              onDuplicate={(id) => duplicateResource("bill", id)}
              onPay={(bill) => void markBillPaid(bill)}
            />
          ) : null}
          {!isLoading && !blockingLoadError && active === "reports" ? (
            <ReportsView data={data} onToast={setToast} />
          ) : null}
        </main>
      </div>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {NAV_ITEMS.slice(0, 2).map((item) => (
          <button key={item.id} className={active === item.id ? "active" : ""} onClick={() => setActive(item.id)}>
            <span>{item.glyph}</span><small>{item.label}</small>
          </button>
        ))}
        <button className="mobile-add" onClick={() => openEditor({ kind: "transaction", mode: "create" })}>
          <span>＋</span><small>Add</small>
        </button>
        <button className={active === "budgets" ? "active" : ""} onClick={() => setActive("budgets")}>
          <span>◒</span><small>Budgets</small>
        </button>
        <button className={["accounts", "goals", "bills", "reports"].includes(active) ? "active" : ""} onClick={() => setCommandOpen(true)}>
          <span>•••</span><small>More</small>
        </button>
      </nav>

      {isSyncing ? <div className="sync-indicator"><span /> Saving changes</div> : null}
      {editor ? (
        <EditorDrawer
          state={editor}
          data={data}
          onClose={() => setEditor(null)}
          onSave={saveResource}
        />
      ) : null}
      {confirm ? (
        <ConfirmDialog
          title={`Delete ${confirm.label}?`}
          detail="This will permanently remove the record and immediately recalculate balances, budgets, charts and reports."
          onCancel={() => setConfirm(null)}
          onConfirm={() => void deleteResource()}
        />
      ) : null}
      {commandOpen ? (
        <CommandPalette
          onClose={() => setCommandOpen(false)}
          onNavigate={(module) => {
            setActive(module);
            setCommandOpen(false);
          }}
          onCreate={(kind) => {
            openEditor({ kind, mode: "create" });
            setCommandOpen(false);
          }}
          onAssistant={() => {
            setAssistantOpen(true);
            setCommandOpen(false);
          }}
        />
      ) : null}
      {assistantOpen ? (
        <AssistantPanel data={data} onClose={() => setAssistantOpen(false)} />
      ) : null}
      {notificationsOpen ? (
        <NotificationsPanel data={data} onClose={() => setNotificationsOpen(false)} />
      ) : null}
      {settingsOpen ? (
        <SettingsPanel
          userName={userName}
          onTheme={setTheme}
          onSave={savePreferences}
          onClose={() => setSettingsOpen(false)}
          onSavePreferences={savePreferences}
          preferences={preferences}
        />
      ) : null}
      {toast ? <ToastMessage toast={toast} onClose={() => setToast(null)} /> : null}
    </div>
  );
}

function Glyph({ children }: { children: ReactNode }) {
  return <span className="glyph" aria-hidden="true">{children}</span>;
}

function LoadingView() {
  return (
    <div className="loading-view" aria-live="polite" aria-busy="true">
      <div className="loading-heading" />
      <div className="loading-metrics">
        {[1, 2, 3, 4].map((item) => <div key={item} className="loading-card" />)}
      </div>
      <div className="loading-grid"><div /><div /></div>
      <span className="sr-only">Loading your financial workspace</span>
    </div>
  );
}

function DataErrorView({
  detail,
  onRetry,
}: {
  detail: string;
  onRetry: () => void;
}) {
  return (
    <section className="data-error card" role="alert">
      <span className="metric-icon danger">!</span>
      <div>
        <span className="eyebrow">Finance data unavailable</span>
        <h1>We couldn’t open your workspace</h1>
        <p>{detail}</p>
        <small>No sample records were substituted. Your saved data remains in the secure backend.</small>
      </div>
      <button className="primary-button" onClick={onRetry}>Try again</button>
    </section>
  );
}

function PageHeading({
  eyebrow,
  title,
  detail,
  actions,
}: {
  eyebrow?: string;
  title: string;
  detail: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h1>{title}</h1>
        <p>{detail}</p>
      </div>
      {actions ? <div className="heading-actions">{actions}</div> : null}
    </div>
  );
}

function StatusPill({ children, tone = "neutral" }: { children: ReactNode; tone?: string }) {
  return <span className={`status-pill ${tone}`}><span className="pill-dot" />{children}</span>;
}

function ProgressBar({
  value,
  max,
  color,
  label,
}: {
  value: number;
  max: number;
  color?: string;
  label: string;
}) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      className="progress-track"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
    >
      <span style={{ width: `${percent}%`, background: color }} />
    </div>
  );
}

function EmptyState({
  glyph,
  title,
  detail,
  action,
}: {
  glyph: string;
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <Glyph>{glyph}</Glyph>
      <h3>{title}</h3>
      <p>{detail}</p>
      {action}
    </div>
  );
}

function OverviewView({
  data,
  userName,
  onNavigate,
  onEdit,
  onAssistant,
}: {
  data: FinanceData;
  userName: string;
  onNavigate: (module: ModuleId) => void;
  onEdit: (state: EditorState) => void;
  onAssistant: () => void;
}) {
  if (!data.accounts.length) {
    return (
      <div className="page-stack">
        <PageHeading
          eyebrow={headingDate()}
          title={`Welcome, ${userName.split(" ")[0] || "there"}`}
          detail="Start with an account so every transaction, bill and transfer has a secure home."
        />
        <section className="first-run-card card">
          <span className="first-run-mark">▰</span>
          <div>
            <span className="eyebrow">Your workspace is ready</span>
            <h2>Add your first financial account</h2>
            <p>
              Enter the real opening balance for a bank account, credit card,
              loan, savings account or cash wallet. CashFlow OS will keep future
              changes in the backend and build your dashboard from those records.
            </p>
            <ol>
              <li><b>1</b><span><strong>Add an account</strong><small>Name it by purpose and enter its current balance.</small></span></li>
              <li><b>2</b><span><strong>Record transactions</strong><small>Income and expenses update balances automatically.</small></span></li>
              <li><b>3</b><span><strong>Plan ahead</strong><small>Create budgets, goals and bill reminders from your own data.</small></span></li>
            </ol>
          </div>
          <button className="primary-button" onClick={() => onEdit({ kind: "account", mode: "create" })}>
            ＋ Add first account
          </button>
        </section>
      </div>
    );
  }

  const balance = totalBalance(data);
  const income = monthlyIncome(data);
  const expenses = monthlyExpenses(data);
  const cashFlow = income - expenses;
  const budgets = budgetSummary(data);
  const rate = savingsRate(data);
  const score = financialHealthScore(data);
  const savingsBalance = data.accounts
    .filter((account) => /saving|future/i.test(`${account.type} ${account.name}`) && !account.archived)
    .reduce((sum, account) => sum + Math.max(0, account.balance), 0);
  const debtBalance = data.accounts
    .filter((account) => /loan|credit/i.test(`${account.type} ${account.name}`) && !account.archived)
    .reduce((sum, account) => sum + Math.abs(account.balance), 0);
  const upcomingBillTotal = data.bills
    .filter((bill) => bill.status !== "paid")
    .reduce((sum, bill) => sum + bill.amount, 0);
  const categories = categorySpending(data);
  const monthTransactions = completedMonthTransactions(data);
  const hasMonthlyActivity = monthTransactions.length > 0;
  const topCategories = categories.slice(0, 5);
  const spendingTotal = Math.max(1, categories.reduce((sum, item) => sum + item.amount, 0));
  const donutStops = topCategories
    .reduce<{ stops: string[]; turn: number }>(
      (result, item) => {
        const nextTurn = result.turn + (item.amount / spendingTotal) * 100;
        return {
          stops: [
            ...result.stops,
            `${item.category?.color ?? "#8f98a7"} ${result.turn}% ${nextTurn}%`,
          ],
          turn: nextTurn,
        };
      },
      { stops: [], turn: 0 },
    )
    .stops
    .join(", ");
  const weekCount = Math.ceil(daysInCurrentMonth() / 7);
  const weeks = Array.from({ length: weekCount }, (_, index) => index + 1).map((week) => {
    const rows = monthTransactions.filter((transaction) => {
      const day = Number(transaction.date.slice(-2));
      return Math.ceil(day / 7) === week && transaction.status === "completed";
    });
    return {
      week: `W${week}`,
      income: rows.filter((item) => item.type === "income").reduce((sum, item) => sum + item.amount, 0),
      expenses: rows.filter((item) => item.type === "expense").reduce((sum, item) => sum + item.amount, 0),
    };
  });
  const chartMax = Math.max(1, ...weeks.flatMap((week) => [week.income, week.expenses]));
  const upcoming = [...data.bills]
    .filter((bill) => bill.status !== "paid")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 4);
  const recent = sortedTransactions(data.transactions, "newest").slice(0, 6);
  const activeAccounts = data.accounts.filter((account) => !account.archived);
  const accountChartMax = Math.max(
    1,
    ...activeAccounts.map((account) => Math.max(0, account.balance)),
  );
  const topGoal = data.goals
    .filter((goal) => goal.currentAmount < goal.targetAmount)
    .sort(
      (left, right) =>
        right.currentAmount / right.targetAmount -
        left.currentAmount / left.targetAmount,
    )[0];

  return (
    <div className="page-stack">
      <PageHeading
        eyebrow={headingDate()}
        title={`Welcome back, ${userName.split(" ")[0] || "there"}`}
        detail={`Here’s your financial position for ${monthLabel()}.`}
        actions={
          <>
            <button className="secondary-button" onClick={onAssistant}>✦ Ask CashFlow</button>
            <button className="primary-button" onClick={() => onEdit({ kind: "transaction", mode: "create" })}>＋ Add transaction</button>
          </>
        }
      />

      <section className="overview-hero" aria-label="Financial overview">
        <div className="balance-block">
          <span className="hero-label">Total cash balance <button aria-label="Hide balances">◉</button></span>
          <div className="hero-balance">{currency(balance)}</div>
          <div className="hero-change"><span>{activeAccounts.length}</span> <small>active {activeAccounts.length === 1 ? "account" : "accounts"} included</small></div>
        </div>
        <div className="hero-chart" aria-label="Current account balance comparison">
          {activeAccounts.map((account) => (
            <span
              key={account.id}
              style={{
                height: `${Math.max(4, (Math.max(0, account.balance) / accountChartMax) * 100)}%`,
                background: account.color,
              }}
              title={`${account.name}: ${currency(account.balance, account.currency)}`}
            />
          ))}
        </div>
        <div className="health-block">
          <div className="health-ring" style={{ "--score": `${score * 3.6}deg` } as React.CSSProperties}>
            <span><strong>{hasMonthlyActivity ? score : "—"}</strong><small>{hasMonthlyActivity ? "/ 100" : "Add data"}</small></span>
          </div>
          <div>
            <span className="hero-label">Financial health</span>
            <strong>{hasMonthlyActivity ? (score >= 80 ? "Excellent" : score >= 65 ? "Good" : "Needs attention") : "Not enough activity"}</strong>
            <small>{hasMonthlyActivity ? "Based on cash flow, budgets and bills" : "Add this month’s income and expenses"}</small>
          </div>
          <button aria-label="View health details">›</button>
        </div>
      </section>

      <section className="metric-grid" aria-label="Monthly metrics">
        <MetricCard glyph="↗" label="Monthly income" value={currency(income)} trend={`${monthTransactions.filter((item) => item.type === "income").length}`} tone="positive" detail="completed income records" />
        <MetricCard glyph="↙" label="Monthly expenses" value={currency(expenses)} trend={`${monthTransactions.filter((item) => item.type === "expense").length}`} tone={expenses > income && income > 0 ? "danger" : "neutral"} detail="completed expense records" />
        <MetricCard glyph="⌁" label="Net cash flow" value={currency(cashFlow)} trend={cashFlow > 0 ? "Positive" : cashFlow < 0 ? "Negative" : "Even"} tone={cashFlow > 0 ? "positive" : cashFlow < 0 ? "danger" : "neutral"} detail="Income less expenses" />
        <MetricCard glyph="◎" label="Savings rate" value={income ? `${rate.toFixed(1)}%` : "—"} trend={income ? "Current" : "No income"} tone={rate > 0 ? "positive" : "neutral"} detail={income ? `${currency(Math.max(0, cashFlow))} retained` : "Add income to calculate"} />
      </section>

      <section className="micro-metric-row" aria-label="Planning indicators">
        <button onClick={() => onNavigate("budgets")}><span className="metric-icon neutral">◒</span><span><small>Budget remaining</small><strong>{currency(budgets.remaining)}</strong></span><b>›</b></button>
        <button onClick={() => onNavigate("goals")}><span className="metric-icon positive">◎</span><span><small>Long-term savings</small><strong>{currency(savingsBalance)}</strong></span><b>›</b></button>
        <button onClick={() => onNavigate("accounts")}><span className="metric-icon danger">↓</span><span><small>Debt balance</small><strong>{currency(debtBalance)}</strong></span><b>›</b></button>
        <button onClick={() => onNavigate("bills")}><span className="metric-icon warning">◷</span><span><small>Upcoming bills</small><strong>{currency(upcomingBillTotal)}</strong></span><b>›</b></button>
      </section>

      <section className="dashboard-grid">
        <article className="card cashflow-card span-8">
          <CardHeader title="Income vs expenses" detail={`Monthly cash flow · ${monthLabel()}`} action={<button className="text-button" onClick={() => onNavigate("reports")}>View report ›</button>} />
          <div className="chart-summary">
            <div><span>Income</span><strong>{currency(income)}</strong></div>
            <div><span>Expenses</span><strong>{currency(expenses)}</strong></div>
            <div className="chart-legend"><span><i className="legend-income" /> Income</span><span><i className="legend-expense" /> Expenses</span></div>
          </div>
          {hasMonthlyActivity ? (
            <>
              <div className="bar-chart" role="img" aria-label={`Weekly comparison. Total income ${currency(income)}, total expenses ${currency(expenses)}.`}>
                <div className="chart-y-axis"><span>{currency(chartMax, "AUD", true)}</span><span>{currency(chartMax * .66, "AUD", true)}</span><span>{currency(chartMax * .33, "AUD", true)}</span><span>$0</span></div>
                {weeks.map((week) => (
                  <div className="bar-group" key={week.week}>
                    <div className="bars">
                      <span className="income-bar" style={{ height: `${(week.income / chartMax) * 100}%` }} title={`${week.week} income ${currency(week.income)}`} />
                      <span className="expense-bar" style={{ height: `${(week.expenses / chartMax) * 100}%` }} title={`${week.week} expenses ${currency(week.expenses)}`} />
                    </div>
                    <small>{week.week}</small>
                  </div>
                ))}
              </div>
              <div className="chart-insight"><span className="insight-spark">✦</span><p><strong>{cashFlow >= 0 ? `${currency(cashFlow)} remains after completed expenses.` : `Completed expenses exceed income by ${currency(Math.abs(cashFlow))}.`}</strong><br />This view only uses records saved for {monthLabel()}.</p><button onClick={onAssistant}>Explore</button></div>
            </>
          ) : (
            <EmptyState glyph="↕" title="No activity this month" detail="Add income or an expense to start your monthly cash-flow chart." action={<button className="primary-button" onClick={() => onEdit({ kind: "transaction", mode: "create" })}>Add transaction</button>} />
          )}
        </article>

        <article className="card spending-card span-4">
          <CardHeader title="Spending by category" detail="Completed expenses" action={<button className="icon-mini" aria-label="More category options">•••</button>} />
          {topCategories.length ? (
            <>
              <div className="donut-wrap">
                <div className="donut" style={{ background: `conic-gradient(${donutStops})` }}>
                  <span><small>Total spent</small><strong>{currency(expenses, "AUD", true)}</strong></span>
                </div>
              </div>
              <div className="category-legend">
                {topCategories.map((item) => (
                  <button key={item.category?.id ?? "other"} onClick={() => onNavigate("transactions")}>
                    <span><i style={{ background: item.category?.color }} />{item.category?.name ?? "Other"}</span>
                    <strong>{currency(item.amount)}</strong>
                    <small>{((item.amount / spendingTotal) * 100).toFixed(0)}%</small>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <EmptyState glyph="◒" title="No spending yet" detail={`Completed expenses for ${monthLabel()} will appear here.`} />
          )}
        </article>

        <article className="card span-5">
          <CardHeader title="Budget pulse" detail={`${currency(budgets.remaining)} remaining across active budgets`} action={<button className="text-button" onClick={() => onNavigate("budgets")}>Manage ›</button>} />
          {data.budgets.length ? (
            <div className="budget-overview-list">
              {data.budgets.slice(0, 5).map((budget) => {
                const spent = spendingForBudget(data, budget);
                const percent = budget.monthlyLimit ? (spent / budget.monthlyLimit) * 100 : 0;
                const status = percent > 100 ? "Over" : percent > 80 ? "Watch" : "On track";
                return (
                  <button key={budget.id} onClick={() => onEdit({ kind: "budget", mode: "edit", id: budget.id })}>
                    <span className="budget-icon" style={{ background: `${data.categories.find((item) => item.id === budget.categoryId)?.color}20`, color: data.categories.find((item) => item.id === budget.categoryId)?.color }}>{data.categories.find((item) => item.id === budget.categoryId)?.icon}</span>
                    <span className="budget-row-main"><span><strong>{budget.name}</strong><small className={status === "Over" ? "danger-text" : ""}>{status}</small></span><ProgressBar value={spent} max={budget.monthlyLimit} label={`${budget.name}: ${currency(spent)} of ${currency(budget.monthlyLimit)}`} color={percent > 100 ? "#e76881" : percent > 80 ? "#e2a84b" : "#28a989"} /></span>
                    <span className="budget-values"><strong>{currency(spent)}</strong><small>of {currency(budget.monthlyLimit)}</small></span>
                  </button>
                );
              })}
            </div>
          ) : (
            <EmptyState glyph="◒" title="No budgets yet" detail="Create a category budget to start tracking planned versus actual spending." action={<button className="primary-button" onClick={() => onEdit({ kind: "budget", mode: "create" })}>Create budget</button>} />
          )}
        </article>

        <article className="card span-7">
          <CardHeader title="Purpose-built accounts" detail="Every dollar has a job" action={<button className="text-button" onClick={() => onNavigate("accounts")}>All accounts ›</button>} />
          <div className="account-strip">
            {data.accounts.filter((account) => !account.archived).map((account) => (
              <button key={account.id} className="mini-account-card" onClick={() => onEdit({ kind: "account", mode: "view", id: account.id })}>
                <span className="account-logo" style={{ background: account.color }}>{account.icon}</span>
                <span><strong>{account.name.split("·")[0]}</strong><small>{account.name.split("·")[1]}</small></span>
                <b>{currency(account.balance)}</b>
                <i style={{ background: account.color }} />
              </button>
            ))}
          </div>
        </article>

        <article className="card span-4">
          <CardHeader title="Upcoming bills" detail={`${upcoming.length} due soon`} action={<button className="text-button" onClick={() => onNavigate("bills")}>Calendar ›</button>} />
          {upcoming.length ? <div className="upcoming-list">
            {upcoming.map((bill) => (
              <button key={bill.id} onClick={() => onEdit({ kind: "bill", mode: "edit", id: bill.id })}>
                <span className="bill-date"><strong>{new Date(`${bill.dueDate}T12:00:00`).getDate()}</strong><small>{new Date(`${bill.dueDate}T12:00:00`).toLocaleString("en-AU", { month: "short" })}</small></span>
                <span><strong>{bill.name}</strong><small>{accountName(data, bill.accountId)}</small></span>
                <b>{currency(bill.amount)}</b>
              </button>
            ))}
          </div> : <EmptyState glyph="◷" title="No upcoming bills" detail="Add a bill to keep due dates and payment reminders together." action={<button className="primary-button" onClick={() => onEdit({ kind: "bill", mode: "create" })}>Add bill</button>} />}
        </article>

        <article className="card span-4">
          <CardHeader title="Savings goals" detail="Building your future" action={<button className="text-button" onClick={() => onNavigate("goals")}>View goals ›</button>} />
          {data.goals.length ? <div className="goal-overview-list">
            {data.goals.slice(0, 3).map((goal) => {
              const percent = Math.min(100, (goal.currentAmount / goal.targetAmount) * 100);
              return (
                <button key={goal.id} onClick={() => onEdit({ kind: "goal", mode: "edit", id: goal.id })}>
                  <span className="goal-ring" style={{ "--goal": `${percent * 3.6}deg`, "--goal-color": goal.color } as React.CSSProperties}><b>{percent.toFixed(0)}%</b></span>
                  <span><strong>{goal.name}</strong><small>{currency(goal.currentAmount)} of {currency(goal.targetAmount)}</small></span>
                  <b>›</b>
                </button>
              );
            })}
          </div> : <EmptyState glyph="◎" title="No savings goals" detail="Create a target to track contributions and an estimated finish date." action={<button className="primary-button" onClick={() => onEdit({ kind: "goal", mode: "create" })}>Create goal</button>} />}
        </article>

        <article className="card span-4 ai-card">
          <span className="ai-orb">✦</span>
          <div>
            <span className="eyebrow">CashFlow insight</span>
            <h3>{topGoal ? `${topGoal.name} is ${Math.round((topGoal.currentAmount / topGoal.targetAmount) * 100)}% funded.` : data.budgets.length ? `${currency(Math.max(0, budgets.remaining))} remains across active budgets.` : "Add a budget or goal for tailored insights."}</h3>
            <p>{topGoal ? `${currency(Math.max(0, topGoal.targetAmount - topGoal.currentAmount))} remains to reach the target.` : "Insights are calculated only from records saved in this workspace."}</p>
          </div>
          <button className="ai-action" onClick={onAssistant}>See the plan <span>↗</span></button>
        </article>

        <article className="card span-12 recent-card">
          <CardHeader title="Recent transactions" detail="Latest activity across every account" action={<button className="text-button" onClick={() => onNavigate("transactions")}>View all transactions ›</button>} />
          {recent.length ? <TransactionTable rows={recent} data={data} compact onEdit={(id) => onEdit({ kind: "transaction", mode: "edit", id })} /> : <EmptyState glyph="↕" title="No transactions yet" detail="Record your first income or expense to begin the activity history." action={<button className="primary-button" onClick={() => onEdit({ kind: "transaction", mode: "create" })}>Add transaction</button>} />}
        </article>
      </section>
    </div>
  );
}

function MetricCard({
  glyph,
  label,
  value,
  trend,
  tone,
  detail,
}: {
  glyph: string;
  label: string;
  value: string;
  trend: string;
  tone: string;
  detail: string;
}) {
  return (
    <article className="metric-card">
      <span className={`metric-icon ${tone}`}>{glyph}</span>
      <span className="metric-label">{label}</span>
      <strong>{value}</strong>
      <div><span className={`metric-trend ${tone}`}>{trend}</span><small>{detail}</small></div>
    </article>
  );
}

function CardHeader({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card-header">
      <div><h2>{title}</h2>{detail ? <p>{detail}</p> : null}</div>
      {action}
    </div>
  );
}

function TransactionsView({
  data,
  searchRef,
  onEdit,
  onDelete,
  onDuplicate,
  onBulkDelete,
  onBulkUpdate,
}: {
  data: FinanceData;
  searchRef: { current: HTMLInputElement | null };
  onEdit: (state: EditorState) => void;
  onDelete: (transaction: Transaction) => void;
  onDuplicate: (id: string) => void;
  onBulkDelete: (ids: string[]) => Promise<void>;
  onBulkUpdate: (ids: string[], changes: Record<string, unknown>) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [account, setAccount] = useState("all");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [paymentMethod, setPaymentMethod] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "highest" | "lowest">("newest");
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 8;

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return sortedTransactions(
      data.transactions.filter((transaction) => {
        const haystack = [
          transaction.title,
          transaction.description,
          transaction.merchant,
          transaction.notes,
          transaction.tags.join(" "),
        ].join(" ").toLowerCase();
        return (
          (!text || haystack.includes(text)) &&
          (account === "all" || transaction.accountId === account) &&
          (category === "all" || transaction.categoryId === category) &&
          (status === "all" || transaction.status === status) &&
          (type === "all" || transaction.type === type) &&
          (paymentMethod === "all" || transaction.paymentMethod === paymentMethod) &&
          (!dateFrom || transaction.date >= dateFrom) &&
          (!dateTo || transaction.date <= dateTo) &&
          (!minAmount || transaction.amount >= Number(minAmount)) &&
          (!maxAmount || transaction.amount <= Number(maxAmount))
        );
      }),
      sort,
    );
  }, [account, category, data.transactions, dateFrom, dateTo, maxAmount, minAmount, paymentMethod, query, sort, status, type]);

  useEffect(() => {
    const task = window.setTimeout(() => setPage(1), 0);
    return () => window.clearTimeout(task);
  }, [account, category, dateFrom, dateTo, maxAmount, minAmount, paymentMethod, query, sort, status, type]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const selectedOnPage = rows.length > 0 && rows.every((row) => selected.includes(row.id));
  const clearFilters = () => {
    setAccount("all"); setCategory("all"); setStatus("all"); setType("all"); setPaymentMethod("all");
    setDateFrom(""); setDateTo(""); setMinAmount(""); setMaxAmount("");
  };

  return (
    <div className="page-stack">
      <PageHeading
        title="Transactions"
        detail={`${data.transactions.length} records across ${data.accounts.filter((item) => !item.archived).length} active accounts`}
        actions={
          <>
            <button className="secondary-button" onClick={() => downloadTransactionsCsv(data)}>⇩ Export</button>
            <button className="primary-button" onClick={() => onEdit({ kind: "transaction", mode: "create" })}>＋ Add transaction</button>
          </>
        }
      />

      <section className="stat-strip">
        <div><span>This month</span><strong>{data.transactions.filter((item) => item.date.startsWith(currentMonthKey())).length}</strong><small>transactions</small></div>
        <div><span>Income</span><strong className="positive-text">{currency(monthlyIncome(data))}</strong><small>completed</small></div>
        <div><span>Expenses</span><strong>{currency(monthlyExpenses(data))}</strong><small>completed</small></div>
        <div><span>Pending</span><strong>{data.transactions.filter((item) => item.status === "pending").length}</strong><small>to review</small></div>
      </section>

      <section className="card table-card">
        <div className="toolbar">
          <label className="search-field">
            <span className="sr-only">Search transactions</span>
            <span aria-hidden="true">⌕</span>
            <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, merchant, tag or note…" />
            <kbd>/</kbd>
          </label>
          <select aria-label="Filter by account" value={account} onChange={(event) => setAccount(event.target.value)}>
            <option value="all">All accounts</option>
            {data.accounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <select aria-label="Filter by category" value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="all">All categories</option>
            {data.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">Any status</option><option value="completed">Completed</option><option value="pending">Pending</option><option value="cancelled">Cancelled</option>
          </select>
          <button className="filter-toggle" onClick={() => document.getElementById("advanced-filters")?.classList.toggle("open")}>☷ Filters</button>
          <select className="sort-select" aria-label="Sort transactions" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
            <option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="highest">Highest amount</option><option value="lowest">Lowest amount</option>
          </select>
        </div>
        <div id="advanced-filters" className="advanced-filters">
          <label>Type<select value={type} onChange={(event) => setType(event.target.value)}><option value="all">Income & expense</option><option value="income">Income</option><option value="expense">Expense</option></select></label>
          <label>Payment<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="all">Any method</option>{[...new Set(data.transactions.map((item) => item.paymentMethod))].sort().map((method) => <option key={method} value={method}>{method}</option>)}</select></label>
          <label>From<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
          <label>To<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
          <label>Minimum<input type="number" min="0" step=".01" value={minAmount} onChange={(event) => setMinAmount(event.target.value)} placeholder="$0" /></label>
          <label>Maximum<input type="number" min="0" step=".01" value={maxAmount} onChange={(event) => setMaxAmount(event.target.value)} placeholder="Any" /></label>
          <button className="text-button" onClick={clearFilters}>Clear filters</button>
        </div>
        {selected.length ? (
          <div className="bulk-bar">
            <strong>{selected.length} selected</strong>
            <button onClick={() => setSelected([])}>Clear</button>
            <button onClick={() => setBulkEditOpen(true)}>✎ Bulk edit</button>
            <button className="danger-button subtle" onClick={() => void onBulkDelete(selected).then(() => setSelected([]))}>⌫ Delete selected</button>
          </div>
        ) : null}
        {rows.length ? (
          <TransactionTable
            rows={rows}
            data={data}
            selected={selected}
            allSelected={selectedOnPage}
            onToggleAll={() =>
              setSelected((current) =>
                selectedOnPage
                  ? current.filter((id) => !rows.some((row) => row.id === id))
                  : [...new Set([...current, ...rows.map((row) => row.id)])],
              )
            }
            onToggle={(id) =>
              setSelected((current) =>
                current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
              )
            }
            onView={(id) => onEdit({ kind: "transaction", mode: "view", id })}
            onEdit={(id) => onEdit({ kind: "transaction", mode: "edit", id })}
            onDuplicate={onDuplicate}
            onDelete={(id) => {
              const transaction = data.transactions.find((item) => item.id === id);
              if (transaction) onDelete(transaction);
            }}
          />
        ) : (
          <EmptyState
            glyph={data.transactions.length ? "⌕" : "↕"}
            title={data.transactions.length ? "No transactions match these filters" : "No transactions yet"}
            detail={data.transactions.length ? "Clear one or more filters to broaden the results." : "Record your first income or expense. It will be saved to the backend and reflected across the dashboard."}
            action={data.transactions.length ? <button className="secondary-button" onClick={clearFilters}>Clear filters</button> : <button className="primary-button" onClick={() => onEdit({ kind: "transaction", mode: "create" })}>Add transaction</button>}
          />
        )}
        <div className="pagination">
          <span>Showing {filtered.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, filtered.length)} of {filtered.length}</span>
          <div><button disabled={page === 1} onClick={() => setPage((value) => value - 1)}>‹</button>{Array.from({ length: pages }, (_, index) => index + 1).slice(Math.max(0, page - 3), page + 2).map((number) => <button className={number === page ? "active" : ""} key={number} onClick={() => setPage(number)}>{number}</button>)}<button disabled={page === pages} onClick={() => setPage((value) => value + 1)}>›</button></div>
        </div>
      </section>
      {bulkEditOpen ? (
        <BulkEditDialog
          count={selected.length}
          data={data}
          onCancel={() => setBulkEditOpen(false)}
          onSave={async (changes) => {
            await onBulkUpdate(selected, changes);
            setSelected([]);
            setBulkEditOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function TransactionTable({
  rows,
  data,
  compact = false,
  selected = [],
  allSelected = false,
  onToggleAll,
  onToggle,
  onView,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  rows: Transaction[];
  data: FinanceData;
  compact?: boolean;
  selected?: string[];
  allSelected?: boolean;
  onToggleAll?: () => void;
  onToggle?: (id: string) => void;
  onView?: (id: string) => void;
  onEdit?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  return (
    <div className="table-scroll">
      <table className={`data-table transaction-table ${compact ? "compact" : ""}`}>
        <thead><tr>
          {!compact ? <th className="check-cell"><input type="checkbox" aria-label="Select all transactions on this page" checked={allSelected} onChange={onToggleAll} /></th> : null}
          <th>Date</th><th>Transaction</th><th>Category</th><th>Account</th><th>Method</th><th>Status</th><th className="amount-cell">Amount</th><th><span className="sr-only">Actions</span></th>
        </tr></thead>
        <tbody>
          {rows.map((transaction) => {
            const category = data.categories.find((item) => item.id === transaction.categoryId);
            const account = data.accounts.find((item) => item.id === transaction.accountId);
            return (
              <tr key={transaction.id}>
                {!compact ? <td className="check-cell"><input type="checkbox" aria-label={`Select ${transaction.title}`} checked={selected.includes(transaction.id)} onChange={() => onToggle?.(transaction.id)} /></td> : null}
                <td data-label="Date"><strong>{shortDate(transaction.date)}</strong><small>{transaction.time}</small></td>
                <td data-label="Transaction"><span className="merchant-avatar" style={{ background: `${category?.color ?? "#8f98a7"}18`, color: category?.color }}>{transaction.merchant.slice(0, 1) || transaction.title.slice(0, 1)}</span><span><button className="row-title" onClick={() => onView?.(transaction.id) ?? onEdit?.(transaction.id)}>{transaction.title}</button><small>{transaction.merchant || transaction.description}</small></span></td>
                <td data-label="Category"><span className="category-chip"><i style={{ background: category?.color }} />{category?.name ?? "Other"}</span></td>
                <td data-label="Account"><span className="account-cell"><i style={{ background: account?.color }}>{account?.icon}</i><span>{account?.name.split("·")[0]}</span></span></td>
                <td data-label="Method">{transaction.paymentMethod}</td>
                <td data-label="Status"><StatusPill tone={transaction.status === "completed" ? "success" : transaction.status === "pending" ? "warning" : "danger"}>{transaction.status}</StatusPill></td>
                <td data-label="Amount" className={`amount-cell ${transaction.type === "income" ? "positive-text" : ""}`}>{transaction.type === "income" ? "+" : "−"}{currency(transaction.amount)}</td>
                <td><ActionMenu label={`Actions for ${transaction.title}`} actions={[
                  ["View details", () => (onView ?? onEdit)?.(transaction.id)],
                  ["Edit", () => onEdit?.(transaction.id)],
                  ["Duplicate", () => onDuplicate?.(transaction.id)],
                  ["Delete", () => onDelete?.(transaction.id), "danger"],
                ]} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ActionMenu({
  label,
  actions,
}: {
  label: string;
  actions: [string, () => void, string?][];
}) {
  return (
    <details className="action-menu">
      <summary aria-label={label}>•••</summary>
      <div>
        {actions.filter((action) => typeof action[1] === "function").map(([name, action, tone]) => (
          <button key={name} className={tone ?? ""} onClick={(event) => {
            action();
            (event.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open");
          }}>{name}</button>
        ))}
      </div>
    </details>
  );
}

function AccountsView({
  data,
  onEdit,
  onDelete,
  onDuplicate,
  onArchive,
  onDeleteTransfer,
}: {
  data: FinanceData;
  onEdit: (state: EditorState) => void;
  onDelete: (account: Account) => void;
  onDuplicate: (id: string) => void;
  onArchive: (account: Account) => void;
  onDeleteTransfer: (transfer: Transfer) => void;
}) {
  const [showArchived, setShowArchived] = useState(false);
  const accounts = data.accounts.filter((account) => showArchived || !account.archived);
  const active = data.accounts.filter((account) => !account.archived);

  return (
    <div className="page-stack">
      <PageHeading
        title="Accounts"
        detail="Organise your money by purpose and keep every balance in sync."
        actions={
          <>
            <button className="secondary-button" onClick={() => onEdit({ kind: "transfer", mode: "create" })}>↔ Transfer money</button>
            <button className="primary-button" onClick={() => onEdit({ kind: "account", mode: "create" })}>＋ Add account</button>
          </>
        }
      />
      <section className="account-summary">
        <div><span>Total available</span><strong>{currency(totalBalance(data))}</strong><small>Across {active.length} active accounts</small></div>
        <div className="allocation-chart" aria-label="Account balance allocation">
          {active.map((account) => <span key={account.id} style={{ width: `${Math.max(2, (account.balance / Math.max(1, totalBalance(data))) * 100)}%`, background: account.color }} />)}
        </div>
        <button className={showArchived ? "secondary-button active" : "secondary-button"} onClick={() => setShowArchived((value) => !value)}>{showArchived ? "Hide archived" : `Archived (${data.accounts.filter((item) => item.archived).length})`}</button>
      </section>

      <section className="accounts-grid">
        {accounts.map((account) => {
          const totals = accountMonthTotals(data, account.id);
          const health = account.balance < 0 ? "Critical" : account.balance < 400 ? "Watch" : "Healthy";
          const recent = sortedTransactions(data.transactions.filter((item) => item.accountId === account.id), "newest").slice(0, 2);
          return (
            <article className={`account-card ${account.archived ? "archived" : ""}`} key={account.id} style={{ "--account-color": account.color } as React.CSSProperties}>
              <div className="account-card-top">
                <span className="account-logo large" style={{ background: account.color }}>{account.icon}</span>
                <span><small>{account.bankName}</small><h2>{account.name}</h2><em>{account.rule}</em></span>
                <ActionMenu label={`Actions for ${account.name}`} actions={[
                  ["View details", () => onEdit({ kind: "account", mode: "view", id: account.id })],
                  ["Edit account", () => onEdit({ kind: "account", mode: "edit", id: account.id })],
                  ["Duplicate", () => onDuplicate(account.id)],
                  [account.archived ? "Restore account" : "Archive account", () => onArchive(account)],
                  ["Delete", () => onDelete(account), "danger"],
                ]} />
              </div>
              <div className="account-balance">
                <span>Current balance</span><strong>{currency(account.balance, account.currency)}</strong>
                <div><span>Available <b>{currency(Math.max(0, account.balance), account.currency)}</b></span><StatusPill tone={health === "Healthy" ? "success" : health === "Watch" ? "warning" : "danger"}>{health}</StatusPill></div>
              </div>
              <div className="account-month-stats">
                <span><small>Income this month</small><strong className="positive-text">+{currency(totals.income)}</strong></span>
                <span><small>Expenses this month</small><strong>−{currency(totals.expenses)}</strong></span>
              </div>
              <div className="account-recent">
                <span className="section-mini-label">Recent activity</span>
                {recent.length ? recent.map((transaction) => (
                  <button key={transaction.id} onClick={() => onEdit({ kind: "transaction", mode: "edit", id: transaction.id })}>
                    <span><strong>{transaction.title}</strong><small>{shortDate(transaction.date)}</small></span>
                    <b className={transaction.type === "income" ? "positive-text" : ""}>{transaction.type === "income" ? "+" : "−"}{currency(transaction.amount)}</b>
                  </button>
                )) : <small>No recent activity</small>}
              </div>
              <div className="account-card-actions">
                <button onClick={() => onEdit({ kind: "transaction", mode: "create" })}>＋ Transaction</button>
                <button onClick={() => onEdit({ kind: "transfer", mode: "create" })}>↔ Transfer</button>
                <button onClick={() => onEdit({ kind: "account", mode: "view", id: account.id })}>Details ›</button>
              </div>
            </article>
          );
        })}
        <button className="add-account-card" onClick={() => onEdit({ kind: "account", mode: "create" })}>
          <span>＋</span><strong>Add another account</strong><small>Bank, credit card, loan, cash or savings</small>
        </button>
      </section>

      <section className="card table-card">
        <CardHeader title="Transfer history" detail="Internal movements never count as income or expenses" action={<button className="primary-button small" onClick={() => onEdit({ kind: "transfer", mode: "create" })}>New transfer</button>} />
        {data.transfers.length ? (
          <div className="table-scroll"><table className="data-table"><thead><tr><th>Date</th><th>From</th><th>To</th><th>Notes</th><th>Status</th><th className="amount-cell">Amount</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
            {data.transfers.map((transfer) => <tr key={transfer.id}><td data-label="Date">{longDate(transfer.date)}</td><td data-label="From">{accountName(data, transfer.fromAccountId)}</td><td data-label="To">{accountName(data, transfer.toAccountId)}</td><td data-label="Notes">{transfer.notes || "Internal transfer"}</td><td data-label="Status"><StatusPill tone={transfer.status === "completed" ? "success" : "warning"}>{transfer.status}</StatusPill></td><td data-label="Amount" className="amount-cell">{currency(transfer.amount)}</td><td><ActionMenu label={`Actions for ${transfer.notes || "transfer"}`} actions={[
              ["View details", () => onEdit({ kind: "transfer", mode: "view", id: transfer.id })],
              ["Edit transfer", () => onEdit({ kind: "transfer", mode: "edit", id: transfer.id })],
              ["Duplicate", () => onEdit({ kind: "transfer", mode: "duplicate", id: transfer.id })],
              ["Delete", () => onDeleteTransfer(transfer), "danger"],
            ]} /></td></tr>)}
          </tbody></table></div>
        ) : <EmptyState glyph="↔" title="No transfers yet" detail="Move money between your accounts without affecting cash flow." />}
      </section>
    </div>
  );
}

function BudgetsView({
  data,
  onEdit,
  onDelete,
  onDuplicate,
  onReset,
}: {
  data: FinanceData;
  onEdit: (state: EditorState) => void;
  onDelete: (budget: Budget) => void;
  onDuplicate: (id: string) => void;
  onReset: (budget: Budget) => void;
}) {
  const summary = budgetSummary(data);
  const overspent = data.budgets.filter((budget) => spendingForBudget(data, budget) > budget.monthlyLimit);

  return (
    <div className="page-stack">
      <PageHeading
        title="Budgets"
        detail="Turn your monthly plan into clear daily decisions."
        actions={<button className="primary-button" onClick={() => onEdit({ kind: "budget", mode: "create" })}>＋ Create budget</button>}
      />
      <section className="plan-summary-grid">
        <article className="plan-hero">
          <div><span>Budget remaining</span><strong className={summary.remaining < 0 ? "danger-text" : ""}>{currency(summary.remaining)}</strong><small>of {currency(summary.limit)} planned for {monthLabel()}</small></div>
          <div className="large-progress"><ProgressBar value={summary.spent} max={summary.limit} color={summary.spent > summary.limit ? "#e76881" : "#28a989"} label={`Overall budgets: ${currency(summary.spent)} of ${currency(summary.limit)}`} /><span><b>{currency(summary.spent)} spent</b><small>{Math.round((summary.spent / Math.max(1, summary.limit)) * 100)}% used</small></span></div>
        </article>
        <article><span className="metric-icon positive">✓</span><div><small>On track</small><strong>{data.budgets.length - overspent.length}</strong><span>budgets</span></div></article>
        <article><span className="metric-icon danger">!</span><div><small>Overspent</small><strong>{overspent.length}</strong><span>needs action</span></div></article>
      </section>

      {overspent.length ? (
        <div className="alert-banner">
          <span>!</span><div><strong>{overspent[0].name} is {currency(spendingForBudget(data, overspent[0]) - overspent[0].monthlyLimit)} over budget.</strong><p>Review recent transactions or adjust the monthly limit to keep your plan realistic.</p></div>
          <button onClick={() => onEdit({ kind: "budget", mode: "edit", id: overspent[0].id })}>Review budget</button>
        </div>
      ) : null}

      {data.budgets.length ? <section className="budget-grid">
        {data.budgets.map((budget) => {
          const spent = spendingForBudget(data, budget);
          const remaining = budget.monthlyLimit - spent;
          const percent = (spent / Math.max(1, budget.monthlyLimit)) * 100;
          const category = data.categories.find((item) => item.id === budget.categoryId);
          const forecast = spent / Math.max(1, new Date().getDate()) * daysInCurrentMonth();
          const tone = percent > 100 ? "danger" : percent > 80 ? "warning" : "success";
          return (
            <article className="budget-card" key={budget.id}>
              <div className="budget-card-head">
                <span className="budget-icon large" style={{ background: `${category?.color}18`, color: category?.color }}>{category?.icon}</span>
                <span><h2>{budget.name}</h2><small>{category?.name} · Monthly</small></span>
                <ActionMenu label={`Actions for ${budget.name}`} actions={[
                  ["View details", () => onEdit({ kind: "budget", mode: "view", id: budget.id })],
                  ["Edit budget", () => onEdit({ kind: "budget", mode: "edit", id: budget.id })],
                  ["Duplicate", () => onDuplicate(budget.id)],
                  ["Reset cycle to day 1", () => onReset(budget)],
                  ["Delete", () => onDelete(budget), "danger"],
                ]} />
              </div>
              <div className="budget-amounts"><span><small>Spent</small><strong>{currency(spent)}</strong></span><span><small>{remaining >= 0 ? "Remaining" : "Over by"}</small><strong className={remaining < 0 ? "danger-text" : ""}>{currency(Math.abs(remaining))}</strong></span></div>
              <ProgressBar value={spent} max={budget.monthlyLimit} color={tone === "danger" ? "#e76881" : tone === "warning" ? "#e2a84b" : category?.color} label={`${budget.name}: ${currency(spent)} of ${currency(budget.monthlyLimit)}`} />
              <div className="budget-progress-labels"><span>{Math.round(percent)}% used</span><span>Limit {currency(budget.monthlyLimit)}</span></div>
              <div className="budget-thresholds"><span>Daily <b>{currency(budget.dailyLimit)}</b></span><span>Weekly <b>{currency(budget.weeklyLimit)}</b></span><span>Forecast <b className={forecast > budget.monthlyLimit ? "danger-text" : ""}>{currency(forecast)}</b></span></div>
              <div className="budget-card-footer"><StatusPill tone={tone}>{percent > 100 ? "Overspent" : percent > 80 ? "Watch closely" : "On track"}</StatusPill><button onClick={() => onEdit({ kind: "budget", mode: "edit", id: budget.id })}>Edit</button></div>
            </article>
          );
        })}
        <button className="add-account-card budget-add" onClick={() => onEdit({ kind: "budget", mode: "create" })}><span>＋</span><strong>Create a category budget</strong><small>Set monthly, weekly and daily guardrails</small></button>
      </section> : <section className="card"><EmptyState glyph="◒" title="No budgets yet" detail="Create a category budget to compare planned and actual spending each month." action={<button className="primary-button" onClick={() => onEdit({ kind: "budget", mode: "create" })}>Create budget</button>} /></section>}
    </div>
  );
}

function GoalsView({
  data,
  onEdit,
  onDelete,
  onDuplicate,
}: {
  data: FinanceData;
  onEdit: (state: EditorState) => void;
  onDelete: (goal: Goal) => void;
  onDuplicate: (id: string) => void;
}) {
  const totalTarget = data.goals.reduce((sum, goal) => sum + goal.targetAmount, 0);
  const totalSaved = data.goals.reduce((sum, goal) => sum + goal.currentAmount, 0);
  return (
    <div className="page-stack">
      <PageHeading title="Savings goals" detail="Give future plans a target, contribution rhythm and finish line." actions={<button className="primary-button" onClick={() => onEdit({ kind: "goal", mode: "create" })}>＋ New goal</button>} />
      <section className="goal-summary">
        <span className="goal-summary-mark">◎</span>
        <div><span>Total saved toward goals</span><strong>{currency(totalSaved)}</strong><small>of {currency(totalTarget)} across {data.goals.length} goals</small></div>
        <div className="large-progress"><ProgressBar value={totalSaved} max={totalTarget} color="#6f74e8" label={`All goals: ${currency(totalSaved)} of ${currency(totalTarget)}`} /><span><b>{((totalSaved / Math.max(1, totalTarget)) * 100).toFixed(1)}% complete</b><small>{currency(data.goals.reduce((sum, goal) => sum + goal.monthlyContribution, 0))}/month planned</small></span></div>
      </section>
      {data.goals.length ? <section className="goals-grid">
        {data.goals.map((goal) => {
          const percent = Math.min(100, (goal.currentAmount / goal.targetAmount) * 100);
          const months = goalMonthsRemaining(goal.targetAmount, goal.currentAmount, goal.monthlyContribution);
          const estimated = months === null ? "No contribution set" : months === 0 ? "Goal reached" : `${months} months at current pace`;
          return (
            <article className="goal-card" key={goal.id} style={{ "--goal-color": goal.color } as React.CSSProperties}>
              <div className="goal-card-top"><span className="goal-illustration">◎</span><ActionMenu label={`Actions for ${goal.name}`} actions={[
                ["View details", () => onEdit({ kind: "goal", mode: "view", id: goal.id })],
                ["Edit goal", () => onEdit({ kind: "goal", mode: "edit", id: goal.id })],
                ["Duplicate", () => onDuplicate(goal.id)],
                ["Delete", () => onDelete(goal), "danger"],
              ]} /></div>
              <div><span className="eyebrow">Savings goal</span><h2>{goal.name}</h2><p>{goal.notes || "A meaningful target for your future."}</p></div>
              <div className="goal-main-progress"><span><strong>{currency(goal.currentAmount)}</strong><small>saved of {currency(goal.targetAmount)}</small></span><b>{percent.toFixed(0)}%</b></div>
              <ProgressBar value={goal.currentAmount} max={goal.targetAmount} color={goal.color} label={`${goal.name}: ${currency(goal.currentAmount)} of ${currency(goal.targetAmount)}`} />
              <div className="goal-meta"><span><small>Deadline</small><strong>{longDate(goal.deadline)}</strong></span><span><small>Monthly</small><strong>{currency(goal.monthlyContribution)}</strong></span></div>
              <div className="goal-estimate"><span>⌁</span><p><strong>{estimated}</strong><br /><small>{currency(Math.max(0, goal.targetAmount - goal.currentAmount))} still to save</small></p></div>
              <div className="goal-actions"><button className="primary-button" onClick={() => onEdit({ kind: "goal", mode: "edit", id: goal.id })}>＋ Add contribution</button><button className="secondary-button" onClick={() => onEdit({ kind: "goal", mode: "edit", id: goal.id })}>Edit</button></div>
            </article>
          );
        })}
        <button className="add-account-card" onClick={() => onEdit({ kind: "goal", mode: "create" })}><span>＋</span><strong>Dream up a new goal</strong><small>Emergency fund, travel, home, car or anything else</small></button>
      </section> : <section className="card"><EmptyState glyph="◎" title="No savings goals yet" detail="Create a target, deadline and monthly contribution to start tracking progress." action={<button className="primary-button" onClick={() => onEdit({ kind: "goal", mode: "create" })}>Create goal</button>} /></section>}
    </div>
  );
}

function BillsView({
  data,
  onEdit,
  onDelete,
  onDuplicate,
  onPay,
}: {
  data: FinanceData;
  onEdit: (state: EditorState) => void;
  onDelete: (bill: Bill) => void;
  onDuplicate: (id: string) => void;
  onPay: (bill: Bill) => void;
}) {
  const [tab, setTab] = useState<"all" | Bill["status"]>("all");
  const [query, setQuery] = useState("");
  const bills = data.bills
    .filter((bill) => tab === "all" || bill.status === tab)
    .filter((bill) => bill.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const dueCutoff = new Date();
  dueCutoff.setDate(dueCutoff.getDate() + 14);
  const dueSoon = data.bills.filter(
    (bill) =>
      bill.status === "upcoming" &&
      bill.dueDate >= localDate() &&
      bill.dueDate <= localDate(dueCutoff),
  );
  const upcomingTotal = dueSoon.reduce((sum, bill) => sum + bill.amount, 0);

  return (
    <div className="page-stack">
      <PageHeading title="Bills manager" detail="Stay ahead of every payment, reminder and recurring commitment." actions={<button className="primary-button" onClick={() => onEdit({ kind: "bill", mode: "create" })}>＋ Add bill</button>} />
      <section className="bill-summary-grid">
        <article><span className="metric-icon warning">◷</span><div><small>Due in 14 days</small><strong>{currency(upcomingTotal)}</strong><span>{dueSoon.length} bills</span></div></article>
        <article><span className="metric-icon danger">!</span><div><small>Overdue</small><strong>{currency(data.bills.filter((bill) => bill.status === "overdue").reduce((sum, bill) => sum + bill.amount, 0))}</strong><span>{data.bills.filter((bill) => bill.status === "overdue").length} needs action</span></div></article>
        <article><span className="metric-icon positive">✓</span><div><small>Paid this month</small><strong>{data.bills.filter((bill) => bill.status === "paid").length}</strong><span>scheduled bills</span></div></article>
        <article><span className="metric-icon neutral">↻</span><div><small>On autopay</small><strong>{data.bills.filter((bill) => bill.autopay).length}</strong><span>protected payments</span></div></article>
      </section>
      <section className="card table-card">
        <div className="module-tabs">
          {(["all", "upcoming", "overdue", "paid"] as const).map((value) => <button key={value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}>{value[0].toUpperCase() + value.slice(1)} <span>{value === "all" ? data.bills.length : data.bills.filter((bill) => bill.status === value).length}</span></button>)}
          <label className="search-field compact"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search bills…" /><span className="sr-only">Search bills</span></label>
        </div>
        {bills.length ? (
          <div className="table-scroll"><table className="data-table bills-table"><thead><tr><th>Bill</th><th>Due date</th><th>Account</th><th>Frequency</th><th>Reminder</th><th>Status</th><th className="amount-cell">Amount</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
            {bills.map((bill) => {
              const category = data.categories.find((item) => item.id === bill.categoryId);
              return <tr key={bill.id}>
                <td data-label="Bill"><span className="merchant-avatar" style={{ background: `${category?.color}18`, color: category?.color }}>{category?.icon}</span><span><button className="row-title" onClick={() => onEdit({ kind: "bill", mode: "view", id: bill.id })}>{bill.name}</button><small>{category?.name} {bill.autopay ? "· Autopay" : ""}</small></span></td>
                <td data-label="Due date"><strong>{longDate(bill.dueDate)}</strong><small>{bill.status === "overdue" ? "Past due" : "Upcoming"}</small></td>
                <td data-label="Account">{accountName(data, bill.accountId)}</td>
                <td data-label="Frequency">{bill.frequency}</td>
                <td data-label="Reminder">{bill.reminderDays} days before</td>
                <td data-label="Status"><StatusPill tone={bill.status === "paid" ? "success" : bill.status === "overdue" ? "danger" : "warning"}>{bill.status}</StatusPill></td>
                <td data-label="Amount" className="amount-cell">{currency(bill.amount)}</td>
                <td><div className="inline-actions">{bill.status !== "paid" ? <button className="mark-paid" onClick={() => onPay(bill)}>Mark paid</button> : null}<ActionMenu label={`Actions for ${bill.name}`} actions={[
                  ["View details", () => onEdit({ kind: "bill", mode: "view", id: bill.id })],
                  ["Edit bill", () => onEdit({ kind: "bill", mode: "edit", id: bill.id })],
                  ["Duplicate", () => onDuplicate(bill.id)],
                  ["Delete", () => onDelete(bill), "danger"],
                ]} /></div></td>
              </tr>;
            })}
          </tbody></table></div>
        ) : <EmptyState glyph="◷" title={data.bills.length ? "No bills match this view" : "No bills yet"} detail={data.bills.length ? "Change the status filter or search phrase." : "Schedule your first bill to track due dates and reminders."} action={data.bills.length ? undefined : <button className="primary-button" onClick={() => onEdit({ kind: "bill", mode: "create" })}>Add bill</button>} />}
      </section>
    </div>
  );
}

function ReportsView({ data, onToast }: { data: FinanceData; onToast: (toast: Toast) => void }) {
  const [range, setRange] = useState<"week" | "month" | "quarter" | "year">("month");
  const now = new Date();
  const today = localDate(now);
  const quarter = Math.floor(now.getMonth() / 3) + 1;
  const slug = monthLabel(now).toLowerCase().replace(/\s+/g, "-");
  const rangeDetails = {
    week: {
      start: currentWeekStart(now),
      title: "Weekly financial summary",
      detail: `${longDate(currentWeekStart(now))} – ${longDate(today)}`,
      exportLabel: `week-ending-${today}`,
    },
    month: {
      start: currentMonthStart(now),
      title: `${monthLabel(now)} financial summary`,
      detail: `${longDate(currentMonthStart(now))} – ${longDate(today)}`,
      exportLabel: slug,
    },
    quarter: {
      start: currentQuarterStart(now),
      title: `Q${quarter} ${now.getFullYear()} financial summary`,
      detail: `${longDate(currentQuarterStart(now))} – ${longDate(today)}`,
      exportLabel: `q${quarter}-${now.getFullYear()}`,
    },
    year: {
      start: currentYearStart(now),
      title: `${now.getFullYear()} financial summary`,
      detail: `${longDate(currentYearStart(now))} – ${longDate(today)}`,
      exportLabel: `year-to-date-${now.getFullYear()}`,
    },
  }[range];
  const periodTransactions = data.transactions.filter(
    (transaction) =>
      transaction.status === "completed" &&
      transaction.date >= rangeDetails.start &&
      transaction.date <= today,
  );
  const income = periodTransactions
    .filter((transaction) => transaction.type === "income")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const expenses = periodTransactions
    .filter((transaction) => transaction.type === "expense")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const balance = totalBalance(data);
  const categoryTotals = periodTransactions
    .filter((transaction) => transaction.type === "expense")
    .reduce<Map<string, number>>((totals, transaction) => {
      totals.set(
        transaction.categoryId,
        (totals.get(transaction.categoryId) ?? 0) + transaction.amount,
      );
      return totals;
    }, new Map());
  const categories = [...categoryTotals.entries()]
    .map(([categoryId, amount]) => ({
      category: data.categories.find((item) => item.id === categoryId),
      amount,
    }))
    .sort((left, right) => right.amount - left.amount);
  const rate = income > 0 ? Math.max(0, ((income - expenses) / income) * 100) : 0;
  const activityPoints = [...periodTransactions]
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-12);
  const activityMax = Math.max(1, ...activityPoints.map((item) => item.amount));

  return (
    <div className="page-stack reports-page">
      <PageHeading
        title="Reports"
        detail="A clear, exportable view of progress, patterns and financial decisions."
        actions={
          <div className="export-group">
            <button className="secondary-button" onClick={() => { downloadTransactionsCsv(data, periodTransactions, rangeDetails.exportLabel); onToast({ title: "CSV downloaded", tone: "success" }); }}>CSV</button>
            <button className="secondary-button" onClick={() => { downloadExcel(data, periodTransactions, rangeDetails); onToast({ title: "Excel report downloaded", tone: "success" }); }}>Excel</button>
            <button className="primary-button" onClick={() => window.print()}>⇩ Print / Save PDF</button>
          </div>
        }
      />
      <div className="report-controls">
        <div className="module-tabs">{(["week", "month", "quarter", "year"] as const).map((value) => <button key={value} className={range === value ? "active" : ""} onClick={() => setRange(value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}</div>
        <button className="month-picker">◷ {monthLabel(now)}</button>
      </div>
      <section className="report-title-card">
        <span><small>CashFlow OS · Personal finances</small><h1>{rangeDetails.title}</h1><p>{rangeDetails.detail} · All active accounts · AUD</p></span>
        <StatusPill tone={!periodTransactions.length ? "neutral" : income - expenses >= 0 ? "success" : "danger"}>{!periodTransactions.length ? "No activity" : income - expenses >= 0 ? "Positive cash flow" : "Negative cash flow"}</StatusPill>
      </section>
      <section className="metric-grid report-metrics">
        <MetricCard glyph="▰" label="Closing balance" value={currency(balance)} trend={`${data.accounts.filter((item) => !item.archived).length}`} tone="positive" detail="active accounts" />
        <MetricCard glyph="↗" label="Total income" value={currency(income)} trend={`${periodTransactions.filter((item) => item.type === "income").length}`} tone="positive" detail="income records" />
        <MetricCard glyph="↙" label="Total expenses" value={currency(expenses)} trend={`${periodTransactions.filter((item) => item.type === "expense").length}`} tone={expenses > income ? "danger" : "positive"} detail="expense records" />
        <MetricCard glyph="⌁" label="Net cash flow" value={currency(income - expenses)} trend={`${rate.toFixed(1)}%`} tone={income - expenses >= 0 ? "positive" : "danger"} detail="savings rate" />
      </section>
      <section className="dashboard-grid">
        <article className="card span-8 report-chart-card">
          <CardHeader title="Transaction activity" detail="Latest completed records in this period" />
          {activityPoints.length ? <><div className="report-line-chart" role="img" aria-label={`Transaction activity for ${rangeDetails.detail}`}>
            {activityPoints.map((item) => <span key={item.id}><i style={{ height: `${Math.max(3, (item.amount / activityMax) * 100)}%`, background: item.type === "income" ? "#28a989" : "#6f74e8" }} /><small>{shortDate(item.date)}</small></span>)}
          </div>
          <div className="report-callout"><span>{income - expenses >= 0 ? "↗" : "↘"}</span><p><strong>Cash flow is {currency(Math.abs(income - expenses))} {income - expenses >= 0 ? "positive" : "negative"}.</strong><br />{periodTransactions.length} completed records are included in this view.</p></div></> : <EmptyState glyph="⌁" title="No report activity" detail="Completed transactions in the selected period will appear here." />}
        </article>
        <article className="card span-4">
          <CardHeader title="Category performance" detail="Largest monthly expenses" />
          {categories.length ? <div className="report-category-list">{categories.slice(0, 6).map((item) => <div key={item.category?.id}><span><i style={{ background: item.category?.color }} />{item.category?.name}</span><ProgressBar value={item.amount} max={categories[0]?.amount ?? 1} color={item.category?.color} label={`${item.category?.name}: ${currency(item.amount)}`} /><strong>{currency(item.amount)}</strong></div>)}</div> : <EmptyState glyph="◒" title="No expense categories" detail="Completed expenses in this period will be grouped here." />}
        </article>
        <article className="card span-6">
          <CardHeader title="Budget performance" detail="Planned vs actual" />
          {data.budgets.length ? <div className="report-budget-table">{data.budgets.map((budget) => {
            const spent = spendingForBudget(data, budget);
            return <div key={budget.id}><span>{budget.name}</span><strong>{currency(spent)} / {currency(budget.monthlyLimit)}</strong><StatusPill tone={spent > budget.monthlyLimit ? "danger" : "success"}>{spent > budget.monthlyLimit ? "Over" : "On track"}</StatusPill></div>;
          })}</div> : <EmptyState glyph="◒" title="No budgets to report" detail="Create a budget to compare planned and actual spending." />}
        </article>
        <article className="card span-6">
          <CardHeader title="Account balance history" detail="Current position by purpose" />
          <div className="balance-history">{data.accounts.filter((item) => !item.archived).map((account) => <div key={account.id}><span className="account-logo" style={{ background: account.color }}>{account.icon}</span><span><strong>{account.name}</strong><small>{account.bankName}</small></span><div><i style={{ width: `${Math.max(6, (account.balance / Math.max(...data.accounts.map((item) => item.balance), 1)) * 100)}%`, background: account.color }} /></div><b>{currency(account.balance)}</b></div>)}</div>
        </article>
      </section>
      <footer className="report-footer"><span>CashFlow OS</span><p>Generated {reportDate(now)} · Private financial workspace</p><span>Page 1 of 1</span></footer>
    </div>
  );
}

function EditorDrawer({
  state,
  data,
  onClose,
  onSave,
}: {
  state: NonNullable<EditorState>;
  data: FinanceData;
  onClose: () => void;
  onSave: (kind: ResourceKind, item: any, editingId?: string) => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const readOnly = state.mode === "view";
  const source = (data[RESOURCE_LIST[state.kind]] as any[]).find(
    (item) => item.id === state.id,
  );
  const duplicate = state.mode === "duplicate";
  const title = `${state.mode === "create" ? "Add" : state.mode === "edit" ? "Edit" : state.mode === "duplicate" ? "Duplicate" : "View"} ${state.kind}`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly) return;
    setSubmitting(true);
    setFormError(null);
    const form = new FormData(event.currentTarget);
    let receiptName = duplicate ? undefined : source?.receiptName;
    let receiptKey = duplicate ? undefined : source?.receiptKey;
    let receiptUrl = duplicate ? undefined : source?.receiptUrl;
    let receiptContentType = duplicate ? undefined : source?.receiptContentType;
    let receiptSize = duplicate ? undefined : source?.receiptSize;

    const receipt = form.get("receipt");
    if (state.kind === "transaction" && receipt instanceof File && receipt.size > 0) {
      setUploading(true);
      try {
        const upload = new FormData();
        upload.set("file", receipt);
        const response = await fetch("/api/finance/receipts", { method: "POST", body: upload });
        if (!response.ok) {
          const failure = await response.json().catch(() => null) as {
            error?: { message?: string } | string;
          } | null;
          const message =
            typeof failure?.error === "string"
              ? failure.error
              : failure?.error?.message;
          throw new Error(message ?? "Receipt upload failed.");
        }
        const payload = await response.json() as {
          item?: any;
          receipt?: any;
          [key: string]: any;
        };
        const saved = payload.item ?? payload.receipt ?? payload;
        receiptName = saved.filename ?? saved.name ?? receipt.name;
        receiptKey = saved.key;
        receiptUrl = saved.key
          ? `/api/finance/receipts/${encodeURIComponent(saved.key)}`
          : saved.url ?? saved.receiptUrl;
        receiptContentType = saved.contentType ?? receipt.type;
        receiptSize =
          typeof saved.size === "number" ? saved.size : receipt.size;
      } catch (error) {
        setFormError(
          error instanceof Error
            ? error.message
            : "The receipt could not be uploaded.",
        );
        setSubmitting(false);
        return;
      } finally {
        setUploading(false);
      }
    }

    let item: any;
    if (state.kind === "transaction") {
      item = {
        title: String(form.get("title") ?? ""),
        description: String(form.get("description") ?? ""),
        amount: toNumber(form.get("amount")),
        type: String(form.get("type") ?? "expense"),
        categoryId: String(form.get("categoryId") ?? ""),
        accountId: String(form.get("accountId") ?? ""),
        date: String(form.get("date") ?? localDate()),
        time: String(form.get("time") ?? "12:00"),
        merchant: String(form.get("merchant") ?? ""),
        paymentMethod: String(form.get("paymentMethod") ?? "Debit card"),
        tags: String(form.get("tags") ?? "").split(",").map((tag) => tag.trim()).filter(Boolean),
        notes: String(form.get("notes") ?? ""),
        receiptName,
        receiptKey,
        receiptUrl,
        receiptContentType,
        receiptSize,
        location: String(form.get("location") ?? ""),
        recurring: form.get("recurring") === "on",
        status: String(form.get("status") ?? "completed"),
      };
    } else if (state.kind === "account") {
      item = {
        name: String(form.get("name") ?? ""),
        bankName: String(form.get("bankName") ?? ""),
        type: String(form.get("accountType") ?? "Transaction"),
        balance: toNumber(form.get("balance")),
        openingBalance: toNumber(form.get("openingBalance")),
        currency: String(form.get("currency") ?? "AUD"),
        color: String(form.get("color") ?? "#6f74e8"),
        icon: String(form.get("icon") ?? "A"),
        notes: String(form.get("notes") ?? ""),
        archived: Boolean(source?.archived),
        purpose: source?.purpose,
        rule: String(form.get("rule") ?? ""),
      };
    } else if (state.kind === "transfer") {
      item = {
        fromAccountId: String(form.get("fromAccountId") ?? ""),
        toAccountId: String(form.get("toAccountId") ?? ""),
        amount: toNumber(form.get("amount")),
        date: String(form.get("date") ?? localDate()),
        notes: String(form.get("notes") ?? ""),
        status: String(form.get("status") ?? "completed"),
      };
    } else if (state.kind === "budget") {
      item = {
        name: String(form.get("name") ?? ""),
        categoryId: String(form.get("categoryId") ?? ""),
        monthlyLimit: toNumber(form.get("monthlyLimit")),
        weeklyLimit: toNumber(form.get("weeklyLimit")),
        dailyLimit: toNumber(form.get("dailyLimit")),
        accountId: source?.accountId ?? null,
        resetDay: toNumber(form.get("resetDay"), source?.resetDay ?? 1),
        status: String(form.get("status") ?? "active"),
      };
    } else if (state.kind === "goal") {
      item = {
        name: String(form.get("name") ?? ""),
        targetAmount: toNumber(form.get("targetAmount")),
        currentAmount: toNumber(form.get("currentAmount")),
        deadline: String(form.get("deadline") ?? ""),
        monthlyContribution: toNumber(form.get("monthlyContribution")),
        notes: String(form.get("notes") ?? ""),
        color: String(form.get("color") ?? "#6f74e8"),
        status: source?.status ?? "active",
      };
    } else {
      item = {
        name: String(form.get("name") ?? ""),
        amount: toNumber(form.get("amount")),
        dueDate: String(form.get("dueDate") ?? ""),
        accountId: String(form.get("accountId") ?? ""),
        categoryId: String(form.get("categoryId") ?? ""),
        reminderDays: toNumber(form.get("reminderDays"), 3),
        frequency: String(form.get("frequency") ?? "monthly"),
        status: String(form.get("status") ?? "upcoming"),
        autopay: form.get("autopay") === "on",
        notes: String(form.get("notes") ?? ""),
      };
    }

    try {
      await onSave(state.kind, item, state.mode === "edit" ? state.id : undefined);
    } finally {
      setSubmitting(false);
    }
  }

  const initial = duplicate && source
    ? {
        ...source,
        ...(state.kind === "transaction"
          ? {
              receiptName: undefined,
              receiptKey: undefined,
              receiptUrl: undefined,
              receiptContentType: undefined,
              receiptSize: undefined,
            }
          : {}),
      }
    : source;

  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="editor-drawer" role="dialog" aria-modal="true" aria-labelledby="editor-title">
        <div className="drawer-header">
          <div><span className="eyebrow">{readOnly ? "Record details" : "Changes update your dashboard instantly"}</span><h2 id="editor-title">{title[0].toUpperCase() + title.slice(1)}</h2></div>
          <button className="close-button" onClick={onClose} aria-label="Close editor">×</button>
        </div>
        <form onSubmit={submit}>
          <fieldset disabled={readOnly || submitting}>
            {state.kind === "transaction" ? <TransactionFields initial={initial} data={data} duplicate={duplicate} /> : null}
            {state.kind === "account" ? <AccountFields initial={initial} duplicate={duplicate} defaultCurrency={data.preferences.defaultCurrency} /> : null}
            {state.kind === "transfer" ? <TransferFields data={data} initial={initial} /> : null}
            {state.kind === "budget" ? <BudgetFields initial={initial} data={data} duplicate={duplicate} /> : null}
            {state.kind === "goal" ? <GoalFields initial={initial} duplicate={duplicate} /> : null}
            {state.kind === "bill" ? <BillFields initial={initial} data={data} duplicate={duplicate} /> : null}
          </fieldset>
          {formError ? <div className="form-error drawer-form-error" role="alert">{formError}</div> : null}
          <div className="drawer-footer">
            <button type="button" className="secondary-button" onClick={onClose}>{readOnly ? "Close" : "Cancel"}</button>
            {readOnly ? null : <button type="submit" className="primary-button" disabled={submitting || uploading}>{uploading ? "Uploading receipt…" : submitting ? "Saving…" : state.mode === "edit" ? "Save changes" : state.mode === "duplicate" ? "Create copy" : `Create ${state.kind}`}</button>}
          </div>
        </form>
      </section>
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return <label className={`form-field ${className}`}><span>{label}{required ? <b aria-hidden="true"> *</b> : null}</span>{children}{hint ? <small>{hint}</small> : null}</label>;
}

function FormSection({ title, detail, children }: { title: string; detail?: string; children: ReactNode }) {
  return <section className="form-section"><div className="form-section-title"><h3>{title}</h3>{detail ? <p>{detail}</p> : null}</div><div className="form-grid">{children}</div></section>;
}

function TransactionFields({ initial, data, duplicate }: { initial: any; data: FinanceData; duplicate: boolean }) {
  const defaults = initial ?? {};
  const [transactionType, setTransactionType] = useState<"income" | "expense">(defaults.type === "income" ? "income" : "expense");
  const compatibleCategories = data.categories.filter((item) => item.kind === transactionType || item.kind === "both");
  const compatibleAccounts = data.accounts.filter((account) => {
    if (account.archived) return false;
    if (transactionType === "income") {
      return !["daily", "bills", "international"].includes(account.purpose ?? "custom");
    }
    return !["salary", "savings"].includes(account.purpose ?? "custom");
  });
  const [categoryId, setCategoryId] = useState(
    compatibleCategories.some((item) => item.id === defaults.categoryId)
      ? defaults.categoryId
      : compatibleCategories[0]?.id ?? "",
  );
  const [accountId, setAccountId] = useState(
    compatibleAccounts.some((item) => item.id === defaults.accountId)
      ? defaults.accountId
      : compatibleAccounts[0]?.id ?? "",
  );
  function changeTransactionType(nextType: "income" | "expense") {
    const nextCategories = data.categories.filter(
      (item) => item.kind === nextType || item.kind === "both",
    );
    const nextAccounts = data.accounts.filter((account) => {
      if (account.archived) return false;
      if (nextType === "income") {
        return !["daily", "bills", "international"].includes(account.purpose ?? "custom");
      }
      return !["salary", "savings"].includes(account.purpose ?? "custom");
    });
    setTransactionType(nextType);
    if (!nextCategories.some((item) => item.id === categoryId)) {
      setCategoryId(nextCategories[0]?.id ?? "");
    }
    if (!nextAccounts.some((item) => item.id === accountId)) {
      setAccountId(nextAccounts[0]?.id ?? "");
    }
  }
  return (
    <div className="drawer-body">
      <div className="transaction-type-switch">
        <label><input type="radio" name="type" value="expense" checked={transactionType === "expense"} onChange={() => changeTransactionType("expense")} /><span>↙ Expense</span></label>
        <label><input type="radio" name="type" value="income" checked={transactionType === "income"} onChange={() => changeTransactionType("income")} /><span>↗ Income</span></label>
      </div>
      <FormSection title="Transaction details" detail="The core information used across balances, budgets and reports.">
        <Field label="Amount" required className="amount-input"><span className="currency-prefix">$</span><input name="amount" type="number" min=".01" step=".01" defaultValue={defaults.amount ?? ""} placeholder="0.00" required /></Field>
        <Field label="Status" required><select name="status" defaultValue={defaults.status ?? "completed"}><option value="completed">Completed</option><option value="pending">Pending</option><option value="cancelled">Cancelled</option></select></Field>
        <Field label="Title" required className="span-2"><input name="title" defaultValue={duplicate ? `${defaults.title ?? ""} copy` : defaults.title} placeholder="e.g. Woolworths groceries" required maxLength={120} /></Field>
        <Field label="Description" className="span-2"><input name="description" defaultValue={defaults.description} placeholder="Optional context" maxLength={240} /></Field>
        <Field label="Account" hint={transactionType === "income" ? "Income goes to salary or custom accounts." : "Protected salary and savings accounts are excluded."} required><select name="accountId" value={accountId} onChange={(event) => setAccountId(event.target.value)} required>{compatibleAccounts.map((item) => <option key={item.id} value={item.id}>{item.name} · {currency(item.balance)}</option>)}</select></Field>
        <Field label="Category" required><select name="categoryId" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} required>{compatibleCategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Date" required><input name="date" type="date" defaultValue={defaults.date ?? localDate()} required /></Field>
        <Field label="Time" required><input name="time" type="time" defaultValue={defaults.time ?? "12:00"} required /></Field>
      </FormSection>
      <FormSection title="Merchant & payment" detail="Useful for search, rules and spending insights.">
        <Field label="Merchant"><input name="merchant" defaultValue={defaults.merchant} placeholder="Merchant or payer" /></Field>
        <Field label="Payment method"><select name="paymentMethod" defaultValue={defaults.paymentMethod ?? "Debit card"}><option>Debit card</option><option>Credit card</option><option>Apple Pay</option><option>Google Pay</option><option>Bank transfer</option><option>Direct debit</option><option>Cash</option><option>Other</option></select></Field>
        <Field label="Tags" hint="Separate tags with commas" className="span-2"><input name="tags" defaultValue={defaults.tags?.join(", ")} placeholder="essential, home, recurring" /></Field>
        <Field label="Location"><input name="location" defaultValue={defaults.location} placeholder="Optional suburb or place" /></Field>
        <Field label="Receipt" hint={defaults.receiptName ? `Current: ${defaults.receiptName}` : "PDF or image up to 8 MB"}><input name="receipt" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif,application/pdf,image/png,image/jpeg,image/webp,image/heic,image/heif" /></Field>
        <Field label="Notes" className="span-2"><textarea name="notes" defaultValue={defaults.notes} placeholder="Add private notes…" rows={3} /></Field>
        <label className="check-option span-2"><input type="checkbox" name="recurring" defaultChecked={Boolean(defaults.recurring)} /><span><strong>Recurring transaction</strong><small>Use this as a repeat pattern for future entries.</small></span></label>
      </FormSection>
    </div>
  );
}

function AccountFields({
  initial,
  duplicate,
  defaultCurrency,
}: {
  initial: any;
  duplicate: boolean;
  defaultCurrency: string;
}) {
  const defaults = initial ?? {};
  return (
    <div className="drawer-body">
      <FormSection title="Account identity" detail="Name the account by purpose so the system is easy to follow.">
        <Field label="Account name" required className="span-2"><input name="name" defaultValue={duplicate ? `${defaults.name ?? ""} copy` : defaults.name} placeholder="e.g. B · Everyday" required /></Field>
        <Field label="Bank or institution" required><input name="bankName" defaultValue={defaults.bankName} placeholder="Bank name" required /></Field>
        <Field label="Account type" required><select name="accountType" defaultValue={defaults.type ?? "Transaction"}><option>Salary</option><option>Transaction</option><option>Bills</option><option>Savings</option><option>International</option><option>Credit card</option><option>Loan</option><option>Investment</option><option>Cash</option></select></Field>
        <Field label="Current balance" required className="amount-input"><span className="currency-prefix">$</span><input name="balance" type="number" step=".01" defaultValue={defaults.balance ?? 0} required /></Field>
        <Field label="Opening balance" required className="amount-input"><span className="currency-prefix">$</span><input name="openingBalance" type="number" step=".01" defaultValue={defaults.openingBalance ?? defaults.balance ?? 0} required /></Field>
        <Field label="Currency"><select name="currency" defaultValue={defaults.currency ?? defaultCurrency}><option>AUD</option><option>USD</option><option>NZD</option><option>EUR</option><option>GBP</option><option>JPY</option></select></Field>
        <Field label="Account rule"><input name="rule" defaultValue={defaults.rule} placeholder="e.g. Daily spending only" /></Field>
      </FormSection>
      <FormSection title="Appearance & notes">
        <Field label="Colour"><input name="color" type="color" defaultValue={defaults.color ?? "#6f74e8"} /></Field>
        <Field label="Icon / initials"><input name="icon" defaultValue={defaults.icon ?? "A"} maxLength={3} /></Field>
        <Field label="Notes" className="span-2"><textarea name="notes" defaultValue={defaults.notes} rows={4} placeholder="What is this account for?" /></Field>
      </FormSection>
    </div>
  );
}

function TransferFields({ data, initial }: { data: FinanceData; initial: any }) {
  const availableAccounts = data.accounts.filter((item) => !item.archived);
  const [from, setFrom] = useState(
    initial?.fromAccountId ?? availableAccounts[0]?.id ?? "",
  );
  const [to, setTo] = useState(
    initial?.toAccountId ??
      availableAccounts.find((item) => item.id !== (initial?.fromAccountId ?? availableAccounts[0]?.id))?.id ??
      "",
  );
  const [amount, setAmount] = useState(
    initial?.amount === undefined ? "" : String(initial.amount),
  );
  const fromAccount = data.accounts.find((item) => item.id === from);
  const toAccount = data.accounts.find((item) => item.id === to);
  const numeric = Number(amount) || 0;

  return (
    <div className="drawer-body">
      <div className="transfer-preview">
        <span><i style={{ background: fromAccount?.color }}>{fromAccount?.icon}</i><small>From</small><strong>{fromAccount?.name}</strong><b>{currency((fromAccount?.balance ?? 0) - numeric)}</b><em>after transfer</em></span>
        <span className="transfer-arrow">→</span>
        <span><i style={{ background: toAccount?.color }}>{toAccount?.icon}</i><small>To</small><strong>{toAccount?.name}</strong><b>{currency((toAccount?.balance ?? 0) + numeric)}</b><em>after transfer</em></span>
      </div>
      <FormSection title="Move money" detail="Both balances update atomically. Transfers do not affect income or expenses.">
        <Field label="From account" required><select name="fromAccountId" value={from} onChange={(event) => {
          const nextFrom = event.target.value;
          setFrom(nextFrom);
          if (nextFrom === to) {
            setTo(availableAccounts.find((item) => item.id !== nextFrom)?.id ?? "");
          }
        }} required>{availableAccounts.map((item) => <option key={item.id} value={item.id}>{item.name} · {currency(item.balance)}</option>)}</select></Field>
        <Field label="To account" required><select name="toAccountId" value={to} onChange={(event) => setTo(event.target.value)} required>{availableAccounts.filter((item) => item.id !== from).map((item) => <option key={item.id} value={item.id}>{item.name} · {currency(item.balance)}</option>)}</select></Field>
        <Field label="Amount" required className="amount-input span-2"><span className="currency-prefix">$</span><input name="amount" type="number" min=".01" max={fromAccount?.balance ?? undefined} step=".01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" required /></Field>
        <Field label="Date" required><input name="date" type="date" defaultValue={initial?.date ?? localDate()} required /></Field>
        <Field label="Status"><select name="status" defaultValue={initial?.status ?? "completed"}><option value="completed">Completed</option><option value="pending">Pending</option><option value="cancelled">Cancelled</option></select></Field>
        <Field label="Notes" className="span-2"><textarea name="notes" defaultValue={initial?.notes} rows={3} placeholder="Reason for this transfer" /></Field>
      </FormSection>
      {from === to ? <div className="form-error">Choose two different accounts.</div> : null}
    </div>
  );
}

function BudgetFields({ initial, data, duplicate }: { initial: any; data: FinanceData; duplicate: boolean }) {
  const defaults = initial ?? {};
  return (
    <div className="drawer-body">
      <FormSection title="Budget limits" detail="Monthly, weekly and daily guide rails keep decisions practical.">
        <Field label="Budget name" required className="span-2"><input name="name" defaultValue={duplicate ? `${defaults.name ?? ""} copy` : defaults.name} placeholder="e.g. Groceries" required /></Field>
        <Field label="Category" required><select name="categoryId" defaultValue={defaults.categoryId ?? data.categories.find((item) => item.kind === "expense")?.id}>{data.categories.filter((item) => item.kind !== "income").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Status"><select name="status" defaultValue={defaults.status ?? "active"}><option value="active">Active</option><option value="paused">Paused</option></select></Field>
        <Field label="Monthly limit" required className="amount-input"><span className="currency-prefix">$</span><input name="monthlyLimit" type="number" min="1" step=".01" defaultValue={defaults.monthlyLimit ?? ""} required /></Field>
        <Field label="Weekly limit" required className="amount-input"><span className="currency-prefix">$</span><input name="weeklyLimit" type="number" min="1" step=".01" defaultValue={defaults.weeklyLimit ?? ""} required /></Field>
        <Field label="Daily guide" required className="amount-input"><span className="currency-prefix">$</span><input name="dailyLimit" type="number" min="1" step=".01" defaultValue={defaults.dailyLimit ?? ""} required /></Field>
        <Field label="Monthly reset day" required><input name="resetDay" type="number" min="1" max="28" step="1" defaultValue={defaults.resetDay ?? 1} required /></Field>
      </FormSection>
      <div className="helper-card"><span>✦</span><p><strong>Smart allocation tip</strong><br />Keep flexible category budgets below 35% of take-home income so essentials and savings remain protected.</p></div>
    </div>
  );
}

function GoalFields({ initial, duplicate }: { initial: any; duplicate: boolean }) {
  const defaults = initial ?? {};
  return (
    <div className="drawer-body">
      <FormSection title="Goal plan" detail="Define the finish line and the contribution that gets you there.">
        <Field label="Goal name" required className="span-2"><input name="name" defaultValue={duplicate ? `${defaults.name ?? ""} copy` : defaults.name} placeholder="e.g. Japan trip" required /></Field>
        <Field label="Target amount" required className="amount-input"><span className="currency-prefix">$</span><input name="targetAmount" type="number" min="1" step=".01" defaultValue={defaults.targetAmount ?? ""} required /></Field>
        <Field label="Current amount" required className="amount-input"><span className="currency-prefix">$</span><input name="currentAmount" type="number" min="0" step=".01" defaultValue={defaults.currentAmount ?? 0} required /></Field>
        <Field label="Deadline" required><input name="deadline" type="date" defaultValue={defaults.deadline ?? defaultGoalDeadline()} required /></Field>
        <Field label="Monthly contribution" required className="amount-input"><span className="currency-prefix">$</span><input name="monthlyContribution" type="number" min="0" step=".01" defaultValue={defaults.monthlyContribution ?? 0} required /></Field>
        <Field label="Colour"><input name="color" type="color" defaultValue={defaults.color ?? "#6f74e8"} /></Field>
        <Field label="Notes" className="span-2"><textarea name="notes" defaultValue={defaults.notes} rows={4} placeholder="Why does this goal matter?" /></Field>
      </FormSection>
    </div>
  );
}

function BillFields({ initial, data, duplicate }: { initial: any; data: FinanceData; duplicate: boolean }) {
  const defaults = initial ?? {};
  return (
    <div className="drawer-body">
      <FormSection title="Bill schedule" detail="Set the payment source, recurrence and reminder window.">
        <Field label="Bill name" required className="span-2"><input name="name" defaultValue={duplicate ? `${defaults.name ?? ""} copy` : defaults.name} placeholder="e.g. Internet" required /></Field>
        <Field label="Amount" required className="amount-input"><span className="currency-prefix">$</span><input name="amount" type="number" min=".01" step=".01" defaultValue={defaults.amount ?? ""} required /></Field>
        <Field label="Due date" required><input name="dueDate" type="date" defaultValue={defaults.dueDate ?? localDate()} required /></Field>
        <Field label="Payment account" required><select name="accountId" defaultValue={defaults.accountId ?? data.accounts.find((item) => item.type === "Bills")?.id}>{data.accounts.filter((item) => !item.archived).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Category" required><select name="categoryId" defaultValue={defaults.categoryId ?? data.categories.find((item) => item.kind === "expense")?.id}>{data.categories.filter((item) => item.kind !== "income").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Frequency"><select name="frequency" defaultValue={defaults.frequency ?? "monthly"}><option value="once">Once</option><option value="weekly">Weekly</option><option value="fortnightly">Fortnightly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option></select></Field>
        <Field label="Reminder"><select name="reminderDays" defaultValue={defaults.reminderDays ?? 3}><option value="1">1 day before</option><option value="3">3 days before</option><option value="5">5 days before</option><option value="7">7 days before</option><option value="14">14 days before</option></select></Field>
        <Field label="Status"><select name="status" defaultValue={defaults.status ?? "upcoming"}><option value="upcoming">Upcoming</option><option value="overdue">Overdue</option><option value="paid">Paid</option></select></Field>
        <label className="check-option span-2"><input type="checkbox" name="autopay" defaultChecked={Boolean(defaults.autopay)} /><span><strong>Auto-pay enabled</strong><small>The bill is automatically debited from the selected account.</small></span></label>
        <Field label="Notes" className="span-2"><textarea name="notes" defaultValue={defaults.notes} rows={3} placeholder="Optional payment notes" /></Field>
      </FormSection>
    </div>
  );
}

function CommandPalette({
  onClose,
  onNavigate,
  onCreate,
  onAssistant,
}: {
  onClose: () => void;
  onNavigate: (module: ModuleId) => void;
  onCreate: (kind: ResourceKind) => void;
  onAssistant: () => void;
}) {
  const [query, setQuery] = useState("");
  const commands: { label: string; detail: string; glyph: string; run: () => void }[] = [
    { label: "Add a transaction", detail: "Create income or expense", glyph: "＋", run: () => onCreate("transaction") },
    { label: "Transfer between accounts", detail: "Move money without affecting cash flow", glyph: "↔", run: () => onCreate("transfer") },
    { label: "Create a budget", detail: "Set a category spending limit", glyph: "◒", run: () => onCreate("budget") },
    { label: "Add a savings goal", detail: "Plan a new target", glyph: "◎", run: () => onCreate("goal") },
    { label: "Schedule a bill", detail: "Add a payment and reminder", glyph: "◷", run: () => onCreate("bill") },
    { label: "Ask CashFlow Assistant", detail: "Explore your financial patterns", glyph: "✦", run: onAssistant },
    ...NAV_ITEMS.map((item) => ({ label: `Go to ${item.label}`, detail: "Navigate workspace", glyph: item.glyph, run: () => onNavigate(item.id) })),
  ];
  const filtered = commands.filter((command) => `${command.label} ${command.detail}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="command-palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <label><span aria-hidden="true">⌕</span><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search actions, pages and records…" /><kbd>Esc</kbd></label>
        <div className="command-list">
          <span className="nav-label">{query ? "Results" : "Quick actions"}</span>
          {filtered.length ? filtered.map((command) => <button key={command.label} onClick={command.run}><Glyph>{command.glyph}</Glyph><span><strong>{command.label}</strong><small>{command.detail}</small></span><b>↵</b></button>) : <EmptyState glyph="⌕" title="No matching action" detail="Try another phrase." />}
        </div>
        <footer><span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span><span><kbd>↵</kbd> Select</span><span><kbd>Esc</kbd> Close</span></footer>
      </section>
    </div>
  );
}

function AssistantPanel({ data, onClose }: { data: FinanceData; onClose: () => void }) {
  const categories = categorySpending(data);
  const [answer, setAnswer] = useState<{ question: string; body: string } | null>(null);
  const available = Math.max(0, monthlyIncome(data) - monthlyExpenses(data));
  const hasTransactions = data.transactions.length > 0;
  const prompts = [
    {
      question: "Where did I spend most this month?",
      body: `${categories[0]?.category?.name ?? "Your top category"} is your largest category at ${currency(categories[0]?.amount ?? 0)}, followed by ${categories[1]?.category?.name ?? "other spending"}.`,
    },
    {
      question: "How much can I save?",
      body: `Your current month leaves ${currency(available)} after completed expenses. Keeping a ${currency(500)} buffer would make ${currency(Math.max(0, available - 500))} available for goals.`,
    },
    {
      question: "Can I afford a $2,499 purchase?",
      body: available >= 2999
        ? `Yes, from this month’s free cash flow—after preserving a $500 buffer. It would reduce your remaining monthly surplus to ${currency(available - 2499)}.`
        : `Not comfortably from this month’s free cash flow. Saving ${currency(Math.max(0, 2499 - available))} more would avoid touching protected accounts.`,
    },
    {
      question: "Forecast next month's expenses",
      body: `At your current recurring pace, next month is tracking near ${currency(monthlyExpenses(data) * 1.03)}. Rent and utilities represent the largest committed share.`,
    },
    {
      question: "Improve my budgets",
      body: `${data.budgets.filter((budget) => spendingForBudget(data, budget) > budget.monthlyLimit).length} budget needs attention. Move unused room from low-spend categories before raising your total flexible spending cap.`,
    },
  ];
  return (
    <div className="drawer-backdrop assistant-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="assistant-panel" role="dialog" aria-modal="true" aria-labelledby="assistant-title">
        <div className="assistant-header"><span className="ai-orb">✦</span><div><span className="eyebrow">Private workspace intelligence</span><h2 id="assistant-title">CashFlow Assistant</h2></div><button className="close-button" onClick={onClose} aria-label="Close assistant">×</button></div>
        <div className="assistant-body">
          <div className="assistant-intro"><span>✦</span><p><strong>Hello.</strong><br />I can explain patterns in the records shown in this workspace. I don’t move money or provide financial advice.</p></div>
          {hasTransactions ? <><span className="section-mini-label">Suggested questions</span>
          <div className="prompt-list">{prompts.map((prompt) => <button key={prompt.question} onClick={() => setAnswer(prompt)}>{prompt.question}<span>›</span></button>)}</div>
          {answer ? <div className="assistant-answer" aria-live="polite"><span className="ai-orb small">✦</span><div><strong>{answer.question}</strong><p>{answer.body}</p><small>Based on completed {monthLabel()} transactions, active budgets and current balances.</small></div></div> : null}
          <div className="assistant-insight-stack">
            <div><span className="positive-text">↗</span><p><strong>{savingsRate(data).toFixed(1)}% savings rate</strong><small>Healthy month-to-date position</small></p></div>
            <div><span className="warning-text">!</span><p><strong>{data.bills.filter((bill) => bill.status !== "paid").length} bills ahead</strong><small>{currency(data.bills.filter((bill) => bill.status !== "paid").reduce((sum, bill) => sum + bill.amount, 0))} scheduled</small></p></div>
          </div></> : <EmptyState glyph="✦" title="Add financial activity first" detail="The assistant will use your saved transactions, budgets, bills and balances without substituting sample data." />}
        </div>
        <div className="assistant-input"><input aria-label="Ask a financial question" placeholder="Ask about your finances…" /><button aria-label="Send question">↑</button></div>
      </aside>
    </div>
  );
}

function NotificationsPanel({ data, onClose }: { data: FinanceData; onClose: () => void }) {
  const cashFlow = monthlyIncome(data) - monthlyExpenses(data);
  const alerts = [
    ...data.bills.filter((bill) => bill.status === "overdue").map((bill) => ({ glyph: "!", tone: "danger", title: `${bill.name} is overdue`, detail: `${currency(bill.amount)} was due ${shortDate(bill.dueDate)}.` })),
    ...data.budgets.filter((budget) => spendingForBudget(data, budget) > budget.monthlyLimit).map((budget) => ({ glyph: "◒", tone: "warning", title: `${budget.name} budget exceeded`, detail: `${currency(spendingForBudget(data, budget) - budget.monthlyLimit)} over the monthly limit.` })),
    ...data.goals.filter((goal) => goal.currentAmount / goal.targetAmount > .9).map((goal) => ({ glyph: "◎", tone: "success", title: `${goal.name} is nearly complete`, detail: `${currency(goal.targetAmount - goal.currentAmount)} left to reach the target.` })),
    ...(monthlyIncome(data) > 0 && cashFlow > 0
      ? [{ glyph: "↗", tone: "success", title: "Positive cash-flow month", detail: `Income is ${currency(cashFlow)} ahead of expenses.` }]
      : []),
  ];
  return (
    <div className="popover-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="notification-panel" role="dialog" aria-modal="true" aria-labelledby="notifications-title">
        <div className="panel-header"><div><h2 id="notifications-title">Notifications</h2><p>{alerts.length} financial updates</p></div><button className="close-button" onClick={onClose} aria-label="Close notifications">×</button></div>
        <button className="mark-read">Mark all as read</button>
        <div className="notification-list">{alerts.length ? alerts.map((alert, index) => <div key={`${alert.title}-${index}`}><span className={`metric-icon ${alert.tone}`}>{alert.glyph}</span><p><strong>{alert.title}</strong><small>{alert.detail}</small><em>{index < 2 ? "Today" : "This week"}</em></p><i /></div>) : <EmptyState glyph="✓" title="You’re all caught up" detail="Bill, budget and goal alerts will appear here." />}</div>
      </aside>
    </div>
  );
}

function SettingsPanel({
  userName,
  onTheme,
  onSave,
  onClose,
  onSavePreferences,
  preferences,
}: {
  userName: string;
  onTheme: (theme: "light" | "dark") => void;
  onSave: (preferences: FinancePreferences) => Promise<boolean>;
  onClose: () => void;
  onSavePreferences: (preferences: Preferences) => Promise<void>;
  preferences: Preferences;
}) {
  const [draft, setDraft] = useState(preferences);
  const [saving, setSaving] = useState(false);
  const update = <K extends keyof Preferences>(key: K, value: Preferences[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const save = () => { setSaving(true); void onSavePreferences(draft).catch(() => setSaving(false)); };
  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="drawer-header"><div><span className="eyebrow">Workspace preferences</span><h2 id="settings-title">Settings</h2></div><button className="close-button" onClick={onClose} aria-label="Close settings">×</button></div>
        <div className="settings-body">
          <section className="profile-card"><span>WA</span><div><strong>{userName}</strong><small>Private CashFlow OS workspace</small></div><StatusPill tone="success">Secure</StatusPill></section>
          <FormSection title="Regional settings">
            <Field label="Currency"><select value={draft.defaultCurrency} onChange={(e) => update("defaultCurrency", e.target.value)}><option value="AUD">AUD · Australian dollar</option><option value="USD">USD · US dollar</option><option value="NZD">NZD · New Zealand dollar</option><option value="EUR">EUR · Euro</option><option value="GBP">GBP · British pound</option><option value="JPY">JPY · Japanese yen</option></select></Field>
            <Field label="Timezone"><select value={draft.timezone} onChange={(e) => update("timezone", e.target.value)}><option>Australia/Melbourne</option><option>Australia/Sydney</option><option>Australia/Perth</option><option>UTC</option></select></Field>
            <Field label="Language"><select value={draft.language} onChange={(e) => update("language", e.target.value)}><option value="en-AU">English (Australia)</option><option value="en-US">English (United States)</option></select></Field>
          </FormSection>
          <FormSection title="Appearance">
            <div className="theme-picker span-2"><button className={draft.theme === "light" ? "active" : ""} onClick={() => { update("theme", "light"); onTheme("light"); }}><span>☀</span><strong>Light</strong><small>Bright and focused</small></button><button className={draft.theme === "dark" ? "active" : ""} onClick={() => { update("theme", "dark"); onTheme("dark"); }}><span>☾</span><strong>Dark</strong><small>Low-light comfort</small></button></div>
          </FormSection>
          <FormSection title="Notifications">
            <label className="check-option span-2"><input type="checkbox" checked={draft.billReminders} onChange={(e) => update("billReminders", e.target.checked)} /><span><strong>Bill reminders</strong><small>Upcoming and overdue payments</small></span></label>
            <label className="check-option span-2"><input type="checkbox" checked={draft.budgetAlerts} onChange={(e) => update("budgetAlerts", e.target.checked)} /><span><strong>Budget alerts</strong><small>80% and overspending thresholds</small></span></label>
            <label className="check-option span-2"><input type="checkbox" checked={draft.largeTransactionAlerts} onChange={(e) => update("largeTransactionAlerts", e.target.checked)} /><span><strong>Large transaction alerts</strong><small>Unusual account movements</small></span></label>
          </FormSection>
          <div className="security-settings"><span>⌾</span><div><strong>Private deployment protection</strong><p>Access is restricted to your account. Financial records are isolated by owner and encrypted in transit.</p></div></div>
        </div>
        <div className="drawer-footer"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save preferences"}</button></div>
      </aside>
    </div>
  );
}

function ConfirmDialog({
  title,
  detail,
  onCancel,
  onConfirm,
}: {
  title: string;
  detail: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-detail">
        <span className="confirm-icon">!</span><h2 id="confirm-title">{title}</h2><p id="confirm-detail">{detail}</p>
        <div><button className="secondary-button" onClick={onCancel}>Cancel</button><button className="danger-button" onClick={onConfirm}>Delete permanently</button></div>
      </section>
    </div>
  );
}

function BulkEditDialog({
  count,
  data,
  onCancel,
  onSave,
}: {
  count: number;
  data: FinanceData;
  onCancel: () => void;
  onSave: (changes: Record<string, unknown>) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <section className="bulk-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="bulk-edit-title">
        <div className="panel-header"><div><span className="eyebrow">{count} transactions selected</span><h2 id="bulk-edit-title">Bulk edit</h2></div><button className="close-button" onClick={onCancel} aria-label="Close bulk editor">×</button></div>
        <form onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const changes: Record<string, unknown> = {};
          const categoryId = String(form.get("categoryId") ?? "");
          const status = String(form.get("status") ?? "");
          const paymentMethod = String(form.get("paymentMethod") ?? "");
          if (categoryId) changes.categoryId = categoryId;
          if (status) changes.status = status;
          if (paymentMethod) changes.paymentMethod = paymentMethod;
          if (!Object.keys(changes).length) return;
          setSaving(true);
          void onSave(changes).finally(() => setSaving(false));
        }}>
          <div className="bulk-edit-body">
            <p>Only fields you choose below will change. Amounts, dates and accounts remain untouched.</p>
            <Field label="Category"><select name="categoryId" defaultValue=""><option value="">Keep current categories</option>{data.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
            <Field label="Status"><select name="status" defaultValue=""><option value="">Keep current statuses</option><option value="completed">Completed</option><option value="pending">Pending</option><option value="cancelled">Cancelled</option></select></Field>
            <Field label="Payment method"><select name="paymentMethod" defaultValue=""><option value="">Keep current methods</option><option>Debit card</option><option>Credit card</option><option>Apple Pay</option><option>Bank transfer</option><option>Direct debit</option><option>Cash</option></select></Field>
          </div>
          <div className="drawer-footer"><button type="button" className="secondary-button" onClick={onCancel}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? "Updating…" : `Update ${count} transactions`}</button></div>
        </form>
      </section>
    </div>
  );
}

function ToastMessage({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  return (
    <div className={`toast ${toast.tone ?? "info"}`} role="status" aria-live="polite">
      <span>{toast.tone === "success" ? "✓" : toast.tone === "danger" ? "!" : "i"}</span>
      <p><strong>{toast.title}</strong>{toast.detail ? <small>{toast.detail}</small> : null}</p>
      <button onClick={onClose} aria-label="Dismiss notification">×</button>
    </div>
  );
}

function downloadFile(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value: string | number) {
  const text = String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

function downloadTransactionsCsv(
  data: FinanceData,
  transactions = data.transactions,
  exportLabel = currentMonthKey(),
) {
  const headers = ["Date", "Time", "Title", "Description", "Type", "Amount AUD", "Category", "Account", "Merchant", "Payment method", "Status", "Tags", "Notes"];
  const rows = sortedTransactions(transactions, "newest").map((transaction) => [
    transaction.date,
    transaction.time,
    transaction.title,
    transaction.description,
    transaction.type,
    transaction.amount.toFixed(2),
    categoryName(data, transaction.categoryId),
    accountName(data, transaction.accountId),
    transaction.merchant,
    transaction.paymentMethod,
    transaction.status,
    transaction.tags.join("; "),
    transaction.notes,
  ]);
  downloadFile(`cashflow-os-transactions-${exportLabel}.csv`, [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n"), "text/csv;charset=utf-8");
}

function htmlCell(value: string | number) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function downloadExcel(
  data: FinanceData,
  transactions = data.transactions,
  report = {
    title: `${monthLabel()} financial summary`,
    detail: `${longDate(currentMonthStart())} – ${longDate(localDate())}`,
    exportLabel: currentMonthKey(),
  },
) {
  const completed = transactions.filter((transaction) => transaction.status === "completed");
  const income = completed.filter((transaction) => transaction.type === "income").reduce((sum, transaction) => sum + transaction.amount, 0);
  const expenses = completed.filter((transaction) => transaction.type === "expense").reduce((sum, transaction) => sum + transaction.amount, 0);
  const rows = sortedTransactions(transactions, "newest").map((transaction) => `<tr><td>${htmlCell(transaction.date)}</td><td>${htmlCell(transaction.title)}</td><td>${htmlCell(categoryName(data, transaction.categoryId))}</td><td>${htmlCell(accountName(data, transaction.accountId))}</td><td>${htmlCell(transaction.type)}</td><td>${htmlCell(transaction.amount.toFixed(2))}</td><td>${htmlCell(transaction.status)}</td></tr>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial}table{border-collapse:collapse}th,td{border:1px solid #ccc;padding:8px}th{background:#eef2f5}</style></head><body><h1>CashFlow OS · ${htmlCell(report.title)}</h1><p>${htmlCell(report.detail)} · Total balance: ${htmlCell(currency(totalBalance(data)))} · Income: ${htmlCell(currency(income))} · Expenses: ${htmlCell(currency(expenses))}</p><table><thead><tr><th>Date</th><th>Transaction</th><th>Category</th><th>Account</th><th>Type</th><th>Amount AUD</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
  downloadFile(`cashflow-os-report-${report.exportLabel}.xls`, html, "application/vnd.ms-excel;charset=utf-8");
}
