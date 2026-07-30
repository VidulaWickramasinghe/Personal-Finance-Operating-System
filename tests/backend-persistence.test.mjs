import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("production uses the Cloudflare worker build that packages storage metadata", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );

  assert.equal(packageJson.scripts.build, "vite build");
  assert.equal(packageJson.scripts.start, "vite preview");
});

test("finance records are loaded from and saved to backend APIs", async () => {
  const app = await readFile(
    new URL("../app/cashflow-app.tsx", import.meta.url),
    "utf8",
  );

  assert.match(app, /fetch\("\/api\/finance", \{ cache: "no-store" \}\)/);
  assert.match(app, /method: editingId \? "PATCH" : "POST"/);
  assert.match(app, /await loadData\(true\)/);
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
