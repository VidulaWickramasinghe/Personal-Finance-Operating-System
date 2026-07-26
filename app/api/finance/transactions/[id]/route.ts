import {
  createTransaction,
  deleteTransaction,
  getTransaction,
  updateTransaction,
} from "@/db/ledger";
import {
  ApiInputError,
  financeRoute,
  newId,
  readJsonObject,
} from "../../_shared";
import { transactionInput, validateTransactionReferences } from "../_input";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  return financeRoute(request, async (user) => {
    const { id } = await context.params;
    const item = await getTransaction(user.id, id);
    if (!item) throw new ApiInputError("Transaction not found.", 404);
    return Response.json({ item, transaction: item });
  });
}

export async function PATCH(request: Request, context: Context) {
  return financeRoute(request, async (user) => {
    const { id } = await context.params;
    const existing = await getTransaction(user.id, id);
    if (!existing) throw new ApiInputError("Transaction not found.", 404);
    const payload = await readJsonObject(request);
    const input = transactionInput(payload, existing);
    await validateTransactionReferences(user.id, input);
    const item = await updateTransaction(user.id, id, input);
    return Response.json({ item, transaction: item });
  });
}

export async function DELETE(request: Request, context: Context) {
  return financeRoute(request, async (user) => {
    const { id } = await context.params;
    const item = await deleteTransaction(user.id, id);
    if (!item) throw new ApiInputError("Transaction not found.", 404);
    return Response.json({ deleted: true, item, transaction: item });
  });
}

export async function POST(request: Request, context: Context) {
  return financeRoute(request, async (user) => {
    const { id } = await context.params;
    const existing = await getTransaction(user.id, id);
    if (!existing) throw new ApiInputError("Transaction not found.", 404);
    const payload: Record<string, unknown> = await readJsonObject(request).catch(
      () => ({}),
    );
    if (payload.action !== undefined && payload.action !== "duplicate") {
      throw new ApiInputError("Only the duplicate action is supported.");
    }
    const copy = transactionInput(
      {
        ...existing,
        title: `${existing.title} (copy)`,
        occurredAt: new Date().toISOString(),
      },
      existing,
    );
    await validateTransactionReferences(user.id, copy);
    const item = await createTransaction(user.id, newId(), copy);
    return Response.json({ item, transaction: item }, { status: 201 });
  });
}
