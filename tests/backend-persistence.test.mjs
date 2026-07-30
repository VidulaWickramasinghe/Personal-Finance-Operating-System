import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("production uses the Cloudflare worker build that packages storage metadata", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );

  assert.match(packageJson.scripts.build, /vinext build/);
  assert.match(packageJson.scripts.start, /vinext start/);
  assert.match(packageJson.scripts.dev, /npm run dev:prepare/);
  assert.match(packageJson.scripts.dev, /vite/);
  assert.equal(
    packageJson.scripts["dev:prepare"],
    "wrangler d1 migrations apply DB --local --config wrangler.local.jsonc",
  );
});

test("local development config binds D1 to the checked-in migrations", async () => {
  const wrangler = JSON.parse(
    await readFile(new URL("../wrangler.local.jsonc", import.meta.url), "utf8"),
  );
  const [database] = wrangler.d1_databases;

  assert.equal(database.binding, "DB");
  assert.equal(database.migrations_dir, "drizzle");
  assert.equal(wrangler.r2_buckets[0].binding, "RECEIPTS");
});

test("finance requests repair an empty or partially migrated D1 schema", async () => {
  const [finance, health, migrations] = await Promise.all([
    readFile(new URL("../db/finance.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/api/finance/health/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../db/migrations.ts", import.meta.url), "utf8"),
  ]);

  assert.match(finance, /await ensureFinanceSchema\(\)/);
  assert.match(health, /await ensureFinanceSchema\(\)/);
  assert.match(health, /FROM sqlite_master/);
  assert.match(health, /Cache-Control.*no-store/);
  assert.match(migrations, /0000_short_loki\.sql\?raw/);
  assert.match(migrations, /0001_broad_big_bertha\.sql\?raw/);
  assert.match(migrations, /0002_wonderful_meggan\.sql\?raw/);
  assert.match(migrations, /CREATE TABLE IF NOT EXISTS/);
  assert.match(migrations, /PRAGMA table_info/);
  assert.match(migrations, /\.prepare\(statement\)\.run\(\)/);
  assert.doesNotMatch(migrations, /\.exec\(/);
});

test("production worker manifest uses Sites bindings, not local Wrangler paths", async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL("../dist/server/wrangler.json", import.meta.url),
      "utf8",
    ),
  );

  assert.equal(manifest.name, "cashflow-os");
  assert.equal(manifest.topLevelName, "cashflow-os");
  assert.equal(manifest.d1_databases[0]?.binding, "DB");
  assert.equal(manifest.r2_buckets[0]?.binding, "RECEIPTS");
  assert.equal("configPath" in manifest, false);
  assert.equal("userConfigPath" in manifest, false);
  assert.doesNotMatch(JSON.stringify(manifest), /cashflow-os-local/);
});

test("finance records are loaded from and saved to backend APIs", async () => {
  const app = await readFile(
    new URL("../app/cashflow-app.tsx", import.meta.url),
    "utf8",
  );

  assert.match(app, /fetch\("\/api\/finance", \{ cache: "no-store" \}\)/);
  assert.match(app, /method: editingId \? "PATCH" : "POST"/);
  assert.match(app, /await loadData\(true\)/);
  assert.match(app, /\/api\/finance\/preferences/);
  assert.match(app, /receiptContentType/);
  assert.match(app, /receiptSize/);
  assert.doesNotMatch(app, /const optimistic/);
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
