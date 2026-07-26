import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, activity } from "@/db/schema";
import {
  ApiInputError,
  financeRoute,
  newId,
  nowIso,
  readJsonObject,
} from "../../_shared";
import { accountPatchInput } from "../_input";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  return financeRoute(request, async (user) => {
    const [item] = await getDb()
      .select()
      .from(accounts)
      .where(and(eq(accounts.id, id), eq(accounts.userId, user.id)))
      .limit(1);

    if (!item) throw new ApiInputError("Account not found.", 404);
    return Response.json({ item });
  });
}

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  return financeRoute(request, async (user) => {
    const payload = await readJsonObject(request);
    const changes = accountPatchInput(payload);
    const db = getDb();
    const [item] = await db
      .update(accounts)
      .set({ ...changes, updatedAt: nowIso() })
      .where(and(eq(accounts.id, id), eq(accounts.userId, user.id)))
      .returning();

    if (!item) throw new ApiInputError("Account not found.", 404);
    await db.insert(activity).values({
      id: newId(),
      userId: user.id,
      entityType: "account",
      entityId: item.id,
      action: item.isArchived ? "archived" : "updated",
      summary: `${item.isArchived ? "Archived" : "Updated"} account ${item.name}`,
    });

    return Response.json({ item });
  });
}

export async function DELETE(request: Request, context: Context) {
  const { id } = await context.params;
  return financeRoute(request, async (user) => {
    const db = getDb();
    const [item] = await db
      .delete(accounts)
      .where(and(eq(accounts.id, id), eq(accounts.userId, user.id)))
      .returning();

    if (!item) throw new ApiInputError("Account not found.", 404);
    await db.insert(activity).values({
      id: newId(),
      userId: user.id,
      entityType: "account",
      entityId: item.id,
      action: "deleted",
      summary: `Deleted account ${item.name}`,
    });

    return Response.json({ item });
  });
}
