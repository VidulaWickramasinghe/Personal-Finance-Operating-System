import {
  deleteTransaction,
  getTransaction,
  updateTransaction,
} from "@/db/ledger";
import {
  ApiInputError,
  financeRoute,
  readJsonObject,
} from "../../_shared";
import { transactionInput, validateTransactionReferences } from "../_input";

export const dynamic = "force-dynamic";

function readIds(payload: Record<string, unknown>) {
  if (!Array.isArray(payload.ids)) {
    throw new ApiInputError("ids must be an array.");
  }
  const ids = payload.ids
    .filter((id): id is string => typeof id === "string")
    .slice(0, 100);
  if (!ids.length) throw new ApiInputError("At least one id is required.");
  return ids;
}

export async function PATCH(request: Request) {
  return financeRoute(request, async (user) => {
    const payload = await readJsonObject(request);
    const ids = readIds(payload);
    if (
      !payload.changes ||
      typeof payload.changes !== "object" ||
      Array.isArray(payload.changes)
    ) {
      throw new ApiInputError("changes must be an object.");
    }
    const changes = payload.changes as Record<string, unknown>;
    const items = [];
    for (const id of ids) {
      const existing = await getTransaction(user.id, id);
      if (!existing) continue;
      const input = transactionInput(changes, existing);
      await validateTransactionReferences(user.id, input);
      const updated = await updateTransaction(user.id, id, input);
      if (updated) items.push(updated);
    }
    return Response.json({ items, updated: items.length });
  });
}

export async function DELETE(request: Request) {
  return financeRoute(request, async (user) => {
    const payload = await readJsonObject(request);
    const ids = readIds(payload);
    let deleted = 0;
    for (const id of ids) {
      if (await deleteTransaction(user.id, id)) deleted += 1;
    }
    return Response.json({ deleted });
  });
}
