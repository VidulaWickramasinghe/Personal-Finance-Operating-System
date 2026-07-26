import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { activity, bills } from "@/db/schema";
import {
  financeRoute,
  newId,
  readJsonObject,
} from "../_shared";
import { billInput, validateBillReferences } from "./_input";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return financeRoute(request, async (user) => {
    const query = new URL(request.url).searchParams;
    const status = query.get("status");
    const db = getDb();
    const items = await db
      .select()
      .from(bills)
      .where(
        status
          ? and(eq(bills.userId, user.id), eq(bills.status, status))
          : eq(bills.userId, user.id),
      )
      .orderBy(asc(bills.dueDate), desc(bills.createdAt))
      .limit(200);
    return Response.json({ items });
  });
}

export async function POST(request: Request) {
  return financeRoute(request, async (user) => {
    const payload = await readJsonObject(request);
    const input = billInput(payload);
    await validateBillReferences(user.id, input);
    const id = newId();
    const db = getDb();
    const [item] = await db
      .insert(bills)
      .values({ id, userId: user.id, ...input })
      .returning();
    await db.insert(activity).values({
      id: newId(),
      userId: user.id,
      entityType: "bill",
      entityId: id,
      action: "created",
      summary: `Bill added: ${input.name}`,
      metadataJson: JSON.stringify({ amountCents: input.amountCents }),
    });
    return Response.json({ item, bill: item }, { status: 201 });
  });
}
