import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { isIsoDate, readCents } from "@/db/finance";
import type { TransferMutation } from "@/db/ledger";
import { accounts } from "@/db/schema";
import {
  ApiInputError,
  enumValue,
  optionalText,
} from "../_shared";

const statuses = ["pending", "completed", "cancelled"] as const;
type PersistedTransferMutation = Omit<TransferMutation, "status"> & {
  status: string;
};

export function transferInput(
  payload: Record<string, unknown>,
  existing?: PersistedTransferMutation,
): TransferMutation {
  const existingStatus = existing
    ? enumValue(existing.status, statuses, "stored transfer status")
    : undefined;
  const amountCents =
    readCents(payload) ?? (existing ? existing.amountCents : null);
  if (amountCents === null || amountCents <= 0) {
    throw new ApiInputError("amountCents must be a positive integer.");
  }
  const fromAccountId =
    typeof payload.fromAccountId === "string"
      ? payload.fromAccountId.trim()
      : existing?.fromAccountId;
  const toAccountId =
    typeof payload.toAccountId === "string"
      ? payload.toAccountId.trim()
      : existing?.toAccountId;
  if (!fromAccountId || !toAccountId) {
    throw new ApiInputError("fromAccountId and toAccountId are required.");
  }
  if (fromAccountId === toAccountId) {
    throw new ApiInputError("Transfer accounts must be different.");
  }
  const transferDate =
    payload.transferDate ?? payload.date ?? existing?.transferDate;
  if (!isIsoDate(transferDate)) {
    throw new ApiInputError("transferDate must be a valid date.");
  }

  return {
    fromAccountId,
    toAccountId,
    amountCents,
    transferDate: new Date(transferDate).toISOString(),
    notes:
      payload.notes === undefined && existing
        ? existing.notes
        : optionalText(payload, "notes") ?? "",
    status: enumValue(
      payload.status,
      statuses,
      "status",
      existingStatus ?? "completed",
    ),
  };
}

export async function validateTransferAccounts(
  userId: string,
  input: TransferMutation,
  existing?: PersistedTransferMutation,
) {
  const db = getDb();
  const owned = await db
    .select({
      id: accounts.id,
      currentBalanceCents: accounts.currentBalanceCents,
      isArchived: accounts.isArchived,
    })
    .from(accounts)
    .where(
      and(
        eq(accounts.userId, userId),
        inArray(accounts.id, [input.fromAccountId, input.toAccountId]),
      ),
    );
  if (owned.length !== 2) {
    throw new ApiInputError("One or both transfer accounts were not found.");
  }
  if (owned.some((account) => account.isArchived)) {
    throw new ApiInputError("Archived accounts cannot be used for transfers.");
  }

  if (input.status === "completed") {
    const source = owned.find((account) => account.id === input.fromAccountId)!;
    let availableCents = source.currentBalanceCents;
    if (existing?.status === "completed") {
      if (existing.fromAccountId === source.id) {
        availableCents += existing.amountCents;
      }
      if (existing.toAccountId === source.id) {
        availableCents -= existing.amountCents;
      }
    }
    if (availableCents < input.amountCents) {
      throw new ApiInputError("The source account has insufficient available funds.");
    }
  }
}
