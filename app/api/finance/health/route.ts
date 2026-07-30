import { getD1Binding } from "@/db";
import { ensureFinanceSchema } from "@/db/migrations";

export const dynamic = "force-dynamic";

const REQUIRED_TABLES = [
  "accounts",
  "activity",
  "bills",
  "budgets",
  "categories",
  "goals",
  "transactions",
  "transfers",
  "user_preferences",
  "users",
] as const;

export async function GET() {
  try {
    await ensureFinanceSchema();

    const d1 = getD1Binding();
    const result = await d1
      .prepare(
        `SELECT name
         FROM sqlite_master
         WHERE type = 'table'
           AND name IN (${REQUIRED_TABLES.map(() => "?").join(", ")})`,
      )
      .bind(...REQUIRED_TABLES)
      .all<{ name: string }>();
    const existing = new Set(result.results.map((row) => row.name));
    const missing = REQUIRED_TABLES.filter((name) => !existing.has(name));

    return Response.json(
      {
        status: missing.length ? "degraded" : "ready",
        storage: "D1",
        missing,
      },
      {
        status: missing.length ? 503 : 200,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown storage error";
    console.error("Finance storage health check failed.", { message });

    return Response.json(
      {
        status: "unavailable",
        storage: "D1",
        error: message,
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
