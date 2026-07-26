import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { activity, goals } from "@/db/schema";
import {
  financeRoute,
  newId,
  readJsonObject,
} from "../_shared";
import { goalCreateInput } from "./_input";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return financeRoute(request, async (user) => {
    const items = await getDb()
      .select()
      .from(goals)
      .where(eq(goals.userId, user.id))
      .orderBy(asc(goals.createdAt));

    return Response.json({ items });
  });
}

export async function POST(request: Request) {
  return financeRoute(request, async (user) => {
    const payload = await readJsonObject(request);
    const values = goalCreateInput(payload);
    const db = getDb();
    const [item] = await db
      .insert(goals)
      .values({
        id: newId(),
        userId: user.id,
        ...values,
      })
      .returning();

    await db.insert(activity).values({
      id: newId(),
      userId: user.id,
      entityType: "goal",
      entityId: item.id,
      action: "created",
      summary: `Created goal ${item.name}`,
    });

    return Response.json({ item }, { status: 201 });
  });
}
