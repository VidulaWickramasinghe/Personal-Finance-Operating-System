import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { isIsoDate, readCents } from "@/db/finance";
import type { TransactionMutation } from "@/db/ledger";
import { accounts, categories } from "@/db/schema";
import {
  ApiInputError,
  booleanValue,
  enumValue,
  optionalText,
  requiredText,
} from "../_shared";

const types = ["income", "expense"] as const;
const statuses = ["pending", "completed", "cancelled"] as const;
type PersistedTransactionMutation = Omit<
  TransactionMutation,
  "type" | "status"
> & {
  type: string;
  status: string;
};

function nullableText(
  payload: Record<string, unknown>,
  key: string,
  fallback: string | null,
) {
  const value = payload[key];
  if (value === undefined) return fallback;
  if (value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new ApiInputError(`${key} must be text or null.`);
  }
  return value.trim() || null;
}

function nullableReceiptSize(value: unknown, fallback: number | null) {
  if (value === undefined) return fallback;
  if (value === null) return null;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new ApiInputError("receiptSize must be a non-negative integer or null.");
  }
  return value;
}

export function transactionInput(
  payload: Record<string, unknown>,
  existing?: PersistedTransactionMutation,
): TransactionMutation {
  const existingType = existing
    ? enumValue(existing.type, types, "stored transaction type")
    : undefined;
  const existingStatus = existing
    ? enumValue(existing.status, statuses, "stored transaction status")
    : undefined;
  const amountCents =
    readCents(payload) ??
    (existing ? existing.amountCents : null);
  if (amountCents === null || amountCents <= 0) {
    throw new ApiInputError("amountCents must be a positive integer.");
  }

  const occurredAtValue =
    payload.occurredAt ?? payload.date ?? existing?.occurredAt;
  if (!isIsoDate(occurredAtValue)) {
    throw new ApiInputError("occurredAt must be a valid date.");
  }

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

  const tags =
    payload.tags === undefined
      ? existing?.tagsJson ?? "[]"
      : Array.isArray(payload.tags)
        ? JSON.stringify(
            payload.tags
              .filter((tag): tag is string => typeof tag === "string")
              .map((tag) => tag.trim())
              .filter(Boolean)
              .slice(0, 20),
          )
        : typeof payload.tagsJson === "string"
          ? payload.tagsJson
          : "[]";

  return {
    accountId,
    categoryId,
    title:
      payload.title === undefined && existing
        ? existing.title
        : requiredText(payload, "title", "Transaction title"),
    description:
      payload.description === undefined && existing
        ? existing.description
        : optionalText(payload, "description") ?? "",
    amountCents,
    type: enumValue(
      payload.type,
      types,
      "type",
      existingType,
    ),
    occurredAt: new Date(occurredAtValue).toISOString(),
    merchant:
      payload.merchant === undefined && existing
        ? existing.merchant
        : optionalText(payload, "merchant") ?? "",
    paymentMethod:
      payload.paymentMethod === undefined && existing
        ? existing.paymentMethod
        : optionalText(payload, "paymentMethod", "card") ?? "card",
    tagsJson: tags,
    notes:
      payload.notes === undefined && existing
        ? existing.notes
        : optionalText(payload, "notes") ?? "",
    receiptUrl:
      nullableText(payload, "receiptUrl", existing?.receiptUrl ?? null),
    receiptKey:
      nullableText(payload, "receiptKey", existing?.receiptKey ?? null),
    receiptName:
      nullableText(payload, "receiptName", existing?.receiptName ?? null),
    receiptContentType:
      nullableText(
        payload,
        "receiptContentType",
        existing?.receiptContentType ?? null,
      ),
    receiptSize: nullableReceiptSize(
      payload.receiptSize,
      existing?.receiptSize ?? null,
    ),
    location:
      payload.location === undefined && existing
        ? existing.location
        : optionalText(payload, "location", null as unknown as string),
    isRecurring:
      payload.isRecurring === undefined && existing
        ? existing.isRecurring
        : booleanValue(payload.isRecurring),
    status: enumValue(
      payload.status,
      statuses,
      "status",
      existingStatus ?? "completed",
    ),
  };
}

export async function validateTransactionReferences(
  userId: string,
  input: TransactionMutation,
) {
  const db = getDb();
  const [account] = await db
    .select({
      id: accounts.id,
      isArchived: accounts.isArchived,
      purpose: accounts.purpose,
    })
    .from(accounts)
    .where(and(eq(accounts.id, input.accountId), eq(accounts.userId, userId)))
    .limit(1);
  if (!account) throw new ApiInputError("The selected account was not found.");
  if (account.isArchived) {
    throw new ApiInputError("Archived accounts cannot receive new transactions.");
  }

  if (account.purpose === "salary" && input.type !== "income") {
    throw new ApiInputError(
      "Salary accounts accept income only. Transfer money to a spending account first.",
    );
  }
  if (
    ["daily", "bills", "international"].includes(account.purpose) &&
    input.type !== "expense"
  ) {
    throw new ApiInputError(
      "This purpose account is for expenses. Record income in the salary account, then transfer it.",
    );
  }
  if (account.purpose === "savings" && input.type === "expense") {
    throw new ApiInputError(
      "Protected savings cannot be used for direct spending. Transfer funds to a spending account first.",
    );
  }

  if (input.categoryId) {
    const [category] = await db
      .select({ id: categories.id, type: categories.type })
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
    if (category.type !== input.type) {
      throw new ApiInputError(
        `The selected category is for ${category.type} transactions.`,
      );
    }
  }
}
