import {
  and,
  asc,
  desc,
  eq,
  gte,
  lte,
  sql,
} from "@/db/finance";
import { createTransaction } from "@/db/ledger";
import { transactions } from "@/db/schema";
import { type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import {
  ApiInputError,
  financeRoute,
  newId,
  readJsonObject,
} from "../_shared";
import { transactionInput, validateTransactionReferences } from "./_input";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return financeRoute(request, async (user) => {
    const url = new URL(request.url);
    const query = url.searchParams;
    const conditions: SQL[] = [eq(transactions.userId, user.id)];
    const q = query.get("q")?.trim();
    if (q) {
      conditions.push(
        sql`(${transactions.title} like ${`%${q}%`} or ${transactions.merchant} like ${`%${q}%`} or ${transactions.notes} like ${`%${q}%`})`,
      );
    }
    const accountId = query.get("accountId");
    if (accountId) conditions.push(eq(transactions.accountId, accountId));
    const categoryId = query.get("categoryId");
    if (categoryId) conditions.push(eq(transactions.categoryId, categoryId));
    const type = query.get("type");
    if (type === "income" || type === "expense") {
      conditions.push(eq(transactions.type, type));
    }
    const status = query.get("status");
    if (
      status === "pending" ||
      status === "completed" ||
      status === "cancelled"
    ) {
      conditions.push(eq(transactions.status, status));
    }
    const paymentMethod = query.get("paymentMethod");
    if (paymentMethod) {
      conditions.push(eq(transactions.paymentMethod, paymentMethod));
    }
    const from = query.get("from");
    if (from && !Number.isNaN(Date.parse(from))) {
      conditions.push(gte(transactions.occurredAt, new Date(from).toISOString()));
    }
    const to = query.get("to");
    if (to && !Number.isNaN(Date.parse(to))) {
      conditions.push(lte(transactions.occurredAt, new Date(to).toISOString()));
    }
    const minCents = Number(query.get("minCents"));
    if (Number.isFinite(minCents) && query.has("minCents")) {
      conditions.push(gte(transactions.amountCents, Math.round(minCents)));
    }
    const maxCents = Number(query.get("maxCents"));
    if (Number.isFinite(maxCents) && query.has("maxCents")) {
      conditions.push(lte(transactions.amountCents, Math.round(maxCents)));
    }

    const page = Math.max(1, Number(query.get("page")) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number(query.get("pageSize")) || 25),
    );
    const sort = query.get("sort") ?? "newest";
    const order =
      sort === "oldest"
        ? asc(transactions.occurredAt)
        : sort === "highest"
          ? desc(transactions.amountCents)
          : sort === "lowest"
            ? asc(transactions.amountCents)
            : desc(transactions.occurredAt);
    const db = getDb();
    const where = and(...conditions);
    const [items, countRows] = await Promise.all([
      db
        .select()
        .from(transactions)
        .where(where)
        .orderBy(order, desc(transactions.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db
        .select({ count: sql<number>`count(*)` })
        .from(transactions)
        .where(where),
    ]);
    const total = Number(countRows[0]?.count ?? 0);
    return Response.json({
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  });
}

export async function POST(request: Request) {
  return financeRoute(request, async (user) => {
    const payload = await readJsonObject(request);
    const input = transactionInput(payload);
    await validateTransactionReferences(user.id, input);
    const item = await createTransaction(user.id, newId(), input);
    if (!item) {
      throw new ApiInputError("Unable to create the transaction.", 500);
    }
    return Response.json({ item, transaction: item }, { status: 201 });
  });
}
