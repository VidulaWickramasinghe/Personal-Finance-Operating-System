import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, activity, budgets, categories } from "@/db/schema";
import {
  ApiInputError,
  financeRoute,
  newId,
  nowIso,
  readJsonObject,
} from "../../_shared";
import { budgetPatchInput } from "../_input";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

async function assertRelationships(
  userId: string,
  categoryId: unknown,
  accountId: unknown,
) {
  const db = getDb();
  if (typeof categoryId === "string") {
    const [category] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
      .limit(1);
    if (!category) throw new ApiInputError("Category not found.", 404);
  }

  if (typeof accountId === "string") {
    const [account] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)))
      .limit(1);
    if (!account) throw new ApiInputError("Account not found.", 404);
  }
}

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  return financeRoute(request, async (user) => {
    const [item] = await getDb()
      .select()
      .from(budgets)
      .where(and(eq(budgets.id, id), eq(budgets.userId, user.id)))
      .limit(1);

    if (!item) throw new ApiInputError("Budget not found.", 404);
    return Response.json({ item });
  });
}

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  return financeRoute(request, async (user) => {
    const payload = await readJsonObject(request);
    const changes = budgetPatchInput(payload);
    await assertRelationships(
      user.id,
      changes.categoryId,
      changes.accountId,
    );

    const db = getDb();
    const [item] = await db
      .update(budgets)
      .set({ ...changes, updatedAt: nowIso() })
      .where(and(eq(budgets.id, id), eq(budgets.userId, user.id)))
      .returning();

    if (!item) throw new ApiInputError("Budget not found.", 404);
    await db.insert(activity).values({
      id: newId(),
      userId: user.id,
      entityType: "budget",
      entityId: item.id,
      action: "updated",
      summary: `Updated budget ${item.name}`,
    });

    return Response.json({ item });
  });
}

export async function DELETE(request: Request, context: Context) {
  const { id } = await context.params;
  return financeRoute(request, async (user) => {
    const db = getDb();
    const [item] = await db
      .delete(budgets)
      .where(and(eq(budgets.id, id), eq(budgets.userId, user.id)))
      .returning();

    if (!item) throw new ApiInputError("Budget not found.", 404);
    await db.insert(activity).values({
      id: newId(),
      userId: user.id,
      entityType: "budget",
      entityId: item.id,
      action: "deleted",
      summary: `Deleted budget ${item.name}`,
    });

    return Response.json({ item });
  });
}
