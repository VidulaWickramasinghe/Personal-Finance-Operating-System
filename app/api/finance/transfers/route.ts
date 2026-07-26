import { and, desc, eq, or } from "drizzle-orm";
import { getDb } from "@/db";
import { createTransfer } from "@/db/ledger";
import { transfers } from "@/db/schema";
import {
  financeRoute,
  newId,
  readJsonObject,
} from "../_shared";
import { transferInput, validateTransferAccounts } from "./_input";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return financeRoute(request, async (user) => {
    const query = new URL(request.url).searchParams;
    const accountId = query.get("accountId");
    const rows = await getDb()
      .select()
      .from(transfers)
      .where(
        accountId
          ? and(
              eq(transfers.userId, user.id),
              or(
                eq(transfers.fromAccountId, accountId),
                eq(transfers.toAccountId, accountId),
              ),
            )
          : eq(transfers.userId, user.id),
      )
      .orderBy(desc(transfers.transferDate))
      .limit(200);
    return Response.json({ items: rows });
  });
}

export async function POST(request: Request) {
  return financeRoute(request, async (user) => {
    const payload = await readJsonObject(request);
    const input = transferInput(payload);
    await validateTransferAccounts(user.id, input);
    const item = await createTransfer(user.id, newId(), input);
    return Response.json({ item, transfer: item }, { status: 201 });
  });
}
