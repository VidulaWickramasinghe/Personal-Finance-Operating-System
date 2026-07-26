import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, activity, budgets, categories } from "@/db/schema";
import {
  ApiInputError,
  financeRoute,
  newId,
  readJsonObject,
} from "../_shared";
import { budgetCreateInput } from "./_input";

export const dynamic = "force-dynamic";

async function assertRelationships(
  userId: string,
  categoryId: string,
  accountId: string | null,
) {
  const db = getDb();
  const [category] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
    .limit(1);
  if (!category) throw new ApiInputError("Category not found.", 404);

  if (accountId) {
    const [account] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)))
      .limit(1);
    if (!account) throw new ApiInputError("Account not found.", 404);
  }
}

export async function GET(request: Request) {
  return financeRoute(request, async (user) => {
    const items = await getDb()
      .select()
      .from(budgets)
      .where(eq(budgets.userId, user.id))
      .orderBy(asc(budgets.name));

    return Response.json({ items });
  });
}

export async function POST(request: Request) {
  return financeRoute(request, async (user) => {
    const payload = await readJsonObject(request);
    const values = budgetCreateInput(payload);
    await assertRelationships(user.id, values.categoryId, values.accountId);

    const db = getDb();
    const [item] = await db
      .insert(budgets)
      .values({
        id: newId(),
        userId: user.id,
        ...values,
      })
      .returning();

    await db.insert(activity).values({
      id: newId(),
      userId: user.id,
      entityType: "budget",
      entityId: item.id,
      action: "created",
      summary: `Created budget ${item.name}`,
    });

    return Response.json({ item }, { status: 201 });
  });
}
