export type TransactionType = "income" | "expense";
export type TransactionStatus = "pending" | "completed" | "cancelled";
export type BillStatus = "upcoming" | "paid" | "overdue";

export type Account = {
  id: string;
  name: string;
  bankName: string;
  type: string;
  balance: number;
  openingBalance: number;
  currency: string;
  color: string;
  icon: string;
  notes: string;
  archived: boolean;
  rule: string;
  purpose?: "salary" | "daily" | "bills" | "international" | "savings" | "custom";
};

export type Category = {
  id: string;
  name: string;
  kind: "income" | "expense" | "both";
  color: string;
  icon: string;
};

export type Transaction = {
  id: string;
  title: string;
  description: string;
  amount: number;
  type: TransactionType;
  categoryId: string;
  accountId: string;
  date: string;
  time: string;
  merchant: string;
  paymentMethod: string;
  tags: string[];
  notes: string;
  receiptName?: string;
  receiptKey?: string;
  receiptUrl?: string;
  location: string;
  recurring: boolean;
  status: TransactionStatus;
  createdAt?: string;
};

export type Transfer = {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  date: string;
  notes: string;
  status: "completed" | "pending" | "cancelled";
  createdAt?: string;
};

export type Budget = {
  id: string;
  name: string;
  categoryId: string;
  accountId?: string | null;
  monthlyLimit: number;
  weeklyLimit: number;
  dailyLimit: number;
  resetDay: number;
  status: "active" | "paused";
};

export type Goal = {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  deadline: string;
  monthlyContribution: number;
  notes: string;
  color: string;
  status?: "active" | "completed" | "paused" | "archived";
};

export type Bill = {
  id: string;
  name: string;
  amount: number;
  dueDate: string;
  accountId: string;
  categoryId: string;
  reminderDays: number;
  frequency: "once" | "weekly" | "fortnightly" | "monthly" | "quarterly" | "yearly";
  status: BillStatus;
  autopay: boolean;
  notes?: string;
};

export type Activity = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  detail: string;
  createdAt: string;
};

export type FinanceData = {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  transfers: Transfer[];
  budgets: Budget[];
  goals: Goal[];
  bills: Bill[];
  activity: Activity[];
};

export type ModuleId =
  | "overview"
  | "transactions"
  | "accounts"
  | "budgets"
  | "goals"
  | "bills"
  | "reports";

export type ResourceKind =
  | "transaction"
  | "account"
  | "transfer"
  | "budget"
  | "goal"
  | "bill";

export type EditorState = {
  kind: ResourceKind;
  mode: "create" | "edit" | "duplicate" | "view";
  id?: string;
} | null;
