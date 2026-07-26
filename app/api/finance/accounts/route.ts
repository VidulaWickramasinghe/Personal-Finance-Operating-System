import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, activity } from "@/db/schema";
import {
  financeRoute,
  newId,
  readJsonObject,
} from "../_shared";
import { accountCreateInput } from "./_input";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return financeRoute(request, async (user) => {
    const items = await getDb()
      .select()
      .from(accounts)
      .where(eq(accounts.userId, user.id))
      .orderBy(asc(accounts.createdAt));

    return Response.json({ items });
  });
}

export async function POST(request: Request) {
  return financeRoute(request, async (user) => {
    const payload = await readJsonObject(request);
    const values = accountCreateInput(payload, user.defaultCurrency);
    const db = getDb();
    const [item] = await db
      .insert(accounts)
      .values({
        id: newId(),
        userId: user.id,
        ...values,
      })
      .returning();

    await db.insert(activity).values({
      id: newId(),
      userId: user.id,
      entityType: "account",
      entityId: item.id,
      action: "created",
      summary: `Created account ${item.name}`,
    });

    return Response.json({ item }, { status: 201 });
  });
}
