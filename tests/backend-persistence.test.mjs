import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("production uses the Cloudflare worker build that packages storage metadata", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );

  assert.equal(packageJson.scripts.build, "vite build");
  assert.equal(packageJson.scripts.start, "vite preview");
  assert.match(packageJson.scripts.dev, /pnpm run dev:prepare/);
  assert.equal(
    packageJson.scripts["dev:prepare"],
    "wrangler d1 migrations apply DB --local --config wrangler.jsonc",
  );
});

test("local development config binds D1 to the checked-in migrations", async () => {
  const wrangler = JSON.parse(
    await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
  );
  const [database] = wrangler.d1_databases;

  assert.equal(database.binding, "DB");
  assert.equal(database.migrations_dir, "drizzle");
  assert.equal(wrangler.r2_buckets[0].binding, "RECEIPTS");
});

test("the finance API initializes D1 even when vinext is started directly", async () => {
  const [finance, migrations] = await Promise.all([
    readFile(new URL("../db/finance.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/migrations.ts", import.meta.url), "utf8"),
  ]);

  assert.match(finance, /await ensureFinanceStorage\(\)/);
  assert.match(migrations, /sqlite_master/);
  assert.match(migrations, /await executeMigration\(d1, initialSchema\)/);
  assert.match(migrations, /await executeMigration\(d1, workspaceUpgrade\)/);
  assert.match(migrations, /split\("--> statement-breakpoint"\)/);
});

test("finance records are loaded from and saved to backend APIs", async () => {
  const app = await readFile(
    new URL("../app/cashflow-app.tsx", import.meta.url),
    "utf8",
  );

  assert.match(app, /const controller = new AbortController\(\)/);
  assert.match(app, /signal: controller\.signal/);
  assert.match(app, /controller\.abort\(\)/);
  assert.match(app, /method: editingId \? "PATCH" : "POST"/);
  assert.match(app, /await loadData\(true\)/);
  assert.doesNotMatch(app, /const optimistic/);
});

test("forwarded Codespaces previews use the isolated local identity", async () => {
  const [finance, vite] = await Promise.all([
    readFile(new URL("../db/finance.ts", import.meta.url), "utf8"),
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
  ]);

  assert.match(finance, /url\.hostname\.endsWith\("\.app\.github\.dev"\)/);
  assert.match(vite, /allowedHosts: \["\.app\.github\.dev"\]/);
});

test("settings save handler is defined and wired into the preferences panel", async () => {
  const app = await readFile(
    new URL("../app/cashflow-app.tsx", import.meta.url),
    "utf8",
  );

  assert.match(app, /const savePreferences = useCallback\(\(\) =>/);
  assert.match(app, /onSave=\{savePreferences\}/);
  assert.match(app, /onClick=\{onSave\}>Save preferences/);
});

test("workspace initialization removes demo finance rows and keeps only required catalogue data", async () => {
  const finance = await readFile(
    new URL("../db/finance.ts", import.meta.url),
    "utf8",
  );
  const categoryRoute = await readFile(
    new URL("../app/api/finance/categories/[id]/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(finance, /CURRENT_WORKSPACE_VERSION = 2/);
  for (const table of [
    "accounts",
    "transactions",
    "transfers",
    "budgets",
    "goals",
    "bills",
  ]) {
    assert.match(finance, new RegExp(`DELETE FROM ${table}`));
  }
  assert.match(finance, /INSERT OR IGNORE INTO categories/);
  assert.match(categoryRoute, /if \(existing\.isSystem\)/);
});
