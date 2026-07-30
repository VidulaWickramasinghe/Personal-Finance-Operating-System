import initialMigration from "../drizzle/0000_short_loki.sql?raw";
import workspaceMigration from "../drizzle/0001_broad_big_bertha.sql?raw";
import preferencesMigration from "../drizzle/0002_wonderful_meggan.sql?raw";
import { getD1Binding } from ".";

const MIGRATION_TABLE = "__cashflow_migrations";
const STATEMENT_BREAKPOINT = "--> statement-breakpoint";
const ALTER_COLUMN_PATTERN =
  /^ALTER TABLE\s+[`"]?([A-Za-z0-9_]+)[`"]?\s+ADD\s+[`"]?([A-Za-z0-9_]+)[`"]?/i;

const migrations = [
  { name: "0000_short_loki", sql: initialMigration },
  { name: "0001_broad_big_bertha", sql: workspaceMigration },
  { name: "0002_wonderful_meggan", sql: preferencesMigration },
] as const;

let financeSchemaReady: Promise<void> | null = null;

export function ensureFinanceSchema() {
  financeSchemaReady ??= applyFinanceMigrations().catch((error) => {
    financeSchemaReady = null;
    throw error;
  });
  return financeSchemaReady;
}

async function applyFinanceMigrations() {
  const d1 = getD1Binding();

  await d1
    .prepare(
      `CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
         name TEXT PRIMARY KEY NOT NULL,
         applied_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
       )`,
    )
    .run();

  const appliedRows = await d1
    .prepare(`SELECT name FROM ${MIGRATION_TABLE}`)
    .all<{ name: string }>();
  const applied = new Set(appliedRows.results.map((row) => row.name));

  for (const migration of migrations) {
    if (applied.has(migration.name)) continue;

    for (const sourceStatement of splitStatements(migration.sql)) {
      const alterColumn = sourceStatement.match(ALTER_COLUMN_PATTERN);
      if (
        alterColumn &&
        (await columnExists(d1, alterColumn[1], alterColumn[2]))
      ) {
        continue;
      }

      const statement = makeCreateStatementIdempotent(sourceStatement);
      try {
        await d1.prepare(statement).run();
      } catch (error) {
        if (!alterColumn || !isDuplicateColumnError(error)) {
          throw error;
        }
      }
    }

    await d1
      .prepare(
        `INSERT OR IGNORE INTO ${MIGRATION_TABLE} (name) VALUES (?)`,
      )
      .bind(migration.name)
      .run();
  }
}

function splitStatements(sql: string) {
  return sql
    .split(STATEMENT_BREAKPOINT)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function makeCreateStatementIdempotent(statement: string) {
  return statement
    .replace(
      /^CREATE TABLE\s+(?!IF NOT EXISTS)/i,
      "CREATE TABLE IF NOT EXISTS ",
    )
    .replace(
      /^CREATE UNIQUE INDEX\s+(?!IF NOT EXISTS)/i,
      "CREATE UNIQUE INDEX IF NOT EXISTS ",
    )
    .replace(
      /^CREATE INDEX\s+(?!IF NOT EXISTS)/i,
      "CREATE INDEX IF NOT EXISTS ",
    );
}

async function columnExists(
  d1: D1Database,
  tableName: string,
  columnName: string,
) {
  const safeTableName = tableName.replaceAll('"', '""');
  const result = await d1
    .prepare(`PRAGMA table_info("${safeTableName}")`)
    .all<{ name: string }>();
  return result.results.some((column) => column.name === columnName);
}

function isDuplicateColumnError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes("duplicate column name");
}
