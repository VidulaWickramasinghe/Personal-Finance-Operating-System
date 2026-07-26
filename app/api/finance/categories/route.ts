import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { activity, categories } from "@/db/schema";
import {
  financeRoute,
  newId,
  readJsonObject,
} from "../_shared";
import { categoryCreateInput } from "./_input";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return financeRoute(request, async (user) => {
    const items = await getDb()
      .select()
      .from(categories)
      .where(eq(categories.userId, user.id))
      .orderBy(asc(categories.type), asc(categories.name));

    return Response.json({ items });
  });
}

export async function POST(request: Request) {
  return financeRoute(request, async (user) => {
    const payload = await readJsonObject(request);
    const values = categoryCreateInput(payload);
    const db = getDb();
    const [item] = await db
      .insert(categories)
      .values({
        id: newId(),
        userId: user.id,
        ...values,
      })
      .returning();

    await db.insert(activity).values({
      id: newId(),
      userId: user.id,
      entityType: "category",
      entityId: item.id,
      action: "created",
      summary: `Created category ${item.name}`,
    });

    return Response.json({ item }, { status: 201 });
  });
}
