import initialSchema from "../drizzle/0000_short_loki.sql?raw";
import workspaceUpgrade from "../drizzle/0001_broad_big_bertha.sql?raw";
import preferencesUpgrade from "../drizzle/0002_ambitious_randall_flagg.sql?raw";
import { getD1Binding } from ".";

let initialization: Promise<void> | undefined;

/**
 * Makes the finance API self-initializing when vinext is started directly.
 * Sites still applies the packaged migrations during deployment, but local
 * previews must not depend on a separate shell command having run first.
 */
export function ensureFinanceStorage() {
  initialization ??= initializeFinanceStorage().catch((error) => {
    // A failed initialization must be retryable after a transient D1 error.
    initialization = undefined;
    throw error;
  });
  return initialization;
}

async function initializeFinanceStorage() {
  const d1 = getD1Binding();
  const usersTable = await d1
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'",
    )
    .first<{ name: string }>();

  if (!usersTable) {
    await executeMigration(d1, initialSchema);
  }

  const columns = await d1.prepare("PRAGMA table_info(users)").all<{
    name: string;
  }>();
  const names = new Set(columns.results.map((column) => column.name));
  if (!names.has("workspace_version")) {
    await executeMigration(d1, workspaceUpgrade);
  }
  if (!names.has("timezone")) {
    await executeMigration(d1, preferencesUpgrade);
  }
}

function executeMigration(d1: D1Database, migration: string) {
  const statements = migration
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean)
    .map((statement) => d1.prepare(statement));
  return d1.batch(statements);
}
