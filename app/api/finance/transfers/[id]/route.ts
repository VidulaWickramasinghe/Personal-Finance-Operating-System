import {
  deleteTransfer,
  getTransfer,
  updateTransfer,
} from "@/db/ledger";
import {
  ApiInputError,
  financeRoute,
  readJsonObject,
} from "../../_shared";
import { transferInput, validateTransferAccounts } from "../_input";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  return financeRoute(request, async (user) => {
    const { id } = await context.params;
    const item = await getTransfer(user.id, id);
    if (!item) throw new ApiInputError("Transfer not found.", 404);
    return Response.json({ item, transfer: item });
  });
}

export async function PATCH(request: Request, context: Context) {
  return financeRoute(request, async (user) => {
    const { id } = await context.params;
    const existing = await getTransfer(user.id, id);
    if (!existing) throw new ApiInputError("Transfer not found.", 404);
    const payload = await readJsonObject(request);
    const input = transferInput(payload, existing);
    await validateTransferAccounts(user.id, input, existing);
    const item = await updateTransfer(user.id, id, input);
    return Response.json({ item, transfer: item });
  });
}

export async function DELETE(request: Request, context: Context) {
  return financeRoute(request, async (user) => {
    const { id } = await context.params;
    const item = await deleteTransfer(user.id, id);
    if (!item) throw new ApiInputError("Transfer not found.", 404);
    return Response.json({ deleted: true, item, transfer: item });
  });
}
