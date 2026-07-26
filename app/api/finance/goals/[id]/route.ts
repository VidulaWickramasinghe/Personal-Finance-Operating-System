import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { activity, goals } from "@/db/schema";
import {
  ApiInputError,
  financeRoute,
  newId,
  nowIso,
  readJsonObject,
} from "../../_shared";
import { goalPatchInput } from "../_input";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  return financeRoute(request, async (user) => {
    const [item] = await getDb()
      .select()
      .from(goals)
      .where(and(eq(goals.id, id), eq(goals.userId, user.id)))
      .limit(1);

    if (!item) throw new ApiInputError("Goal not found.", 404);
    return Response.json({ item });
  });
}

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  return financeRoute(request, async (user) => {
    const payload = await readJsonObject(request);
    const changes = goalPatchInput(payload);
    const db = getDb();
    const [item] = await db
      .update(goals)
      .set({ ...changes, updatedAt: nowIso() })
      .where(and(eq(goals.id, id), eq(goals.userId, user.id)))
      .returning();

    if (!item) throw new ApiInputError("Goal not found.", 404);
    await db.insert(activity).values({
      id: newId(),
      userId: user.id,
      entityType: "goal",
      entityId: item.id,
      action: "updated",
      summary: `Updated goal ${item.name}`,
    });

    return Response.json({ item });
  });
}

export async function DELETE(request: Request, context: Context) {
  const { id } = await context.params;
  return financeRoute(request, async (user) => {
    const db = getDb();
    const [item] = await db
      .delete(goals)
      .where(and(eq(goals.id, id), eq(goals.userId, user.id)))
      .returning();

    if (!item) throw new ApiInputError("Goal not found.", 404);
    await db.insert(activity).values({
      id: newId(),
      userId: user.id,
      entityType: "goal",
      entityId: item.id,
      action: "deleted",
      summary: `Deleted goal ${item.name}`,
    });

    return Response.json({ item });
  });
}
