import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { isIsoDate, readCents } from "@/db/finance";
import { accounts, categories } from "@/db/schema";
import {
  ApiInputError,
  booleanValue,
  enumValue,
  optionalText,
  requiredText,
} from "../_shared";

const frequencies = [
  "once",
  "weekly",
  "fortnightly",
  "monthly",
  "quarterly",
  "yearly",
] as const;
const statuses = ["upcoming", "paid", "overdue", "cancelled"] as const;

export type BillInput = {
  accountId: string;
  categoryId: string | null;
  name: string;
  amountCents: number;
  dueDate: string;
  reminderDays: number;
  frequency: (typeof frequencies)[number];
  status: (typeof statuses)[number];
  isAutoPay: boolean;
  notes: string;
  paidAt: string | null;
};
type PersistedBillInput = Omit<BillInput, "frequency" | "status"> & {
  frequency: string;
  status: string;
};

export function billInput(
  payload: Record<string, unknown>,
  existing?: PersistedBillInput,
): BillInput {
  const existingFrequency = existing
    ? enumValue(existing.frequency, frequencies, "stored bill frequency")
    : undefined;
  const existingStatus = existing
    ? enumValue(existing.status, statuses, "stored bill status")
    : undefined;
  const accountId =
    typeof payload.accountId === "string"
      ? payload.accountId.trim()
      : existing?.accountId;
  if (!accountId) throw new ApiInputError("accountId is required.");
  const categoryId =
    payload.categoryId === null
      ? null
      : typeof payload.categoryId === "string"
        ? payload.categoryId.trim() || null
        : existing?.categoryId ?? null;
  const amountCents =
    readCents(payload) ?? (existing ? existing.amountCents : null);
  if (amountCents === null || amountCents <= 0) {
    throw new ApiInputError("amountCents must be a positive integer.");
  }
  const dueDate = payload.dueDate ?? existing?.dueDate;
  if (!isIsoDate(dueDate)) {
    throw new ApiInputError("dueDate must be a valid date.");
  }
  const reminderValue = payload.reminderDays ?? existing?.reminderDays ?? 3;
  if (
    typeof reminderValue !== "number" ||
    !Number.isInteger(reminderValue) ||
    reminderValue < 0
  ) {
    throw new ApiInputError("reminderDays must be a non-negative integer.");
  }

  return {
    accountId,
    categoryId,
    name:
      payload.name === undefined && existing
        ? existing.name
        : requiredText(payload, "name", "Bill name"),
    amountCents,
    dueDate:
      typeof dueDate === "string" && dueDate.length <= 10
        ? new Date(dueDate).toISOString().slice(0, 10)
        : new Date(dueDate).toISOString(),
    reminderDays: reminderValue,
    frequency: enumValue(
      payload.frequency,
      frequencies,
      "frequency",
      existingFrequency ?? "monthly",
    ),
    status: enumValue(
      payload.status,
      statuses,
      "status",
      existingStatus ?? "upcoming",
    ),
    isAutoPay:
      payload.isAutoPay === undefined && existing
        ? existing.isAutoPay
        : booleanValue(payload.isAutoPay),
    notes:
      payload.notes === undefined && existing
        ? existing.notes
        : optionalText(payload, "notes") ?? "",
    paidAt:
      payload.paidAt === undefined && existing
        ? existing.paidAt
        : optionalText(payload, "paidAt", null as unknown as string),
  };
}

export async function validateBillReferences(userId: string, input: BillInput) {
  const db = getDb();
  const [account] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, input.accountId), eq(accounts.userId, userId)))
    .limit(1);
  if (!account) throw new ApiInputError("The selected account was not found.");
  if (input.categoryId) {
    const [category] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.id, input.categoryId),
          eq(categories.userId, userId),
        ),
      )
      .limit(1);
    if (!category) {
      throw new ApiInputError("The selected category was not found.");
    }
  }
}
