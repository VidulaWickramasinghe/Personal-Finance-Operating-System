import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { activity, bills } from "@/db/schema";
import {
  ApiInputError,
  financeRoute,
  newId,
  readJsonObject,
} from "../../_shared";
import { billInput, validateBillReferences } from "../_input";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

async function findBill(userId: string, id: string) {
  const [item] = await getDb()
    .select()
    .from(bills)
    .where(and(eq(bills.id, id), eq(bills.userId, userId)))
    .limit(1);
  return item ?? null;
}

export async function GET(request: Request, context: Context) {
  return financeRoute(request, async (user) => {
    const { id } = await context.params;
    const item = await findBill(user.id, id);
    if (!item) throw new ApiInputError("Bill not found.", 404);
    return Response.json({ item, bill: item });
  });
}

export async function PATCH(request: Request, context: Context) {
  return financeRoute(request, async (user) => {
    const { id } = await context.params;
    const existing = await findBill(user.id, id);
    if (!existing) throw new ApiInputError("Bill not found.", 404);
    const payload = await readJsonObject(request);
    const input = billInput(payload, existing);
    await validateBillReferences(user.id, input);
    const db = getDb();
    const [item] = await db
      .update(bills)
      .set({
        ...input,
        updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
      })
      .where(and(eq(bills.id, id), eq(bills.userId, user.id)))
      .returning();
    await db.insert(activity).values({
      id: newId(),
      userId: user.id,
      entityType: "bill",
      entityId: id,
      action: "updated",
      summary: `Bill updated: ${input.name}`,
    });
    return Response.json({ item, bill: item });
  });
}

export async function DELETE(request: Request, context: Context) {
  return financeRoute(request, async (user) => {
    const { id } = await context.params;
    const existing = await findBill(user.id, id);
    if (!existing) throw new ApiInputError("Bill not found.", 404);
    const db = getDb();
    await db
      .delete(bills)
      .where(and(eq(bills.id, id), eq(bills.userId, user.id)));
    await db.insert(activity).values({
      id: newId(),
      userId: user.id,
      entityType: "bill",
      entityId: id,
      action: "deleted",
      summary: `Bill deleted: ${existing.name}`,
      metadataJson: JSON.stringify({ amountCents: existing.amountCents }),
    });
    return Response.json({ deleted: true, item: existing, bill: existing });
  });
}
