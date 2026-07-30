import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { activity, categories } from "@/db/schema";
import {
  ApiInputError,
  financeRoute,
  newId,
  nowIso,
  readJsonObject,
} from "../../_shared";
import { categoryPatchInput } from "../_input";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  return financeRoute(request, async (user) => {
    const [item] = await getDb()
      .select()
      .from(categories)
      .where(and(eq(categories.id, id), eq(categories.userId, user.id)))
      .limit(1);

    if (!item) throw new ApiInputError("Category not found.", 404);
    return Response.json({ item });
  });
}

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  return financeRoute(request, async (user) => {
    const payload = await readJsonObject(request);
    const changes = categoryPatchInput(payload);
    const db = getDb();
    const [item] = await db
      .update(categories)
      .set({ ...changes, updatedAt: nowIso() })
      .where(and(eq(categories.id, id), eq(categories.userId, user.id)))
      .returning();

    if (!item) throw new ApiInputError("Category not found.", 404);
    await db.insert(activity).values({
      id: newId(),
      userId: user.id,
      entityType: "category",
      entityId: item.id,
      action: "updated",
      summary: `Updated category ${item.name}`,
    });

    return Response.json({ item });
  });
}

export async function DELETE(request: Request, context: Context) {
  const { id } = await context.params;
  return financeRoute(request, async (user) => {
    const db = getDb();
    const [existing] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.id, id), eq(categories.userId, user.id)))
      .limit(1);

    if (!existing) throw new ApiInputError("Category not found.", 404);
    if (existing.isSystem) {
      throw new ApiInputError(
        "Built-in categories are required by the finance workspace and cannot be deleted.",
        409,
      );
    }

    const [item] = await db
      .delete(categories)
      .where(and(eq(categories.id, id), eq(categories.userId, user.id)))
      .returning();

    if (!item) throw new ApiInputError("Category not found.", 404);
    await db.insert(activity).values({
      id: newId(),
      userId: user.id,
      entityType: "category",
      entityId: item.id,
      action: "deleted",
      summary: `Deleted category ${item.name}`,
    });

    return Response.json({ item });
  });
}
