import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("builds the CashFlow OS product shell", async () => {
  const [app, layout] = await Promise.all([
    readFile(new URL("../app/cashflow-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);

  await access(new URL("../dist/server/index.js", import.meta.url));
  assert.match(layout, /CashFlow OS · Personal Money Management/i);
  assert.match(app, /CashFlow/);
  assert.match(app, /Total cash balance/i);
  assert.match(app, /Monthly income/i);
  assert.match(app, /Add transaction/i);
  assert.doesNotMatch(app, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("ships product metadata and removes the temporary starter preview", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /CashflowApp/);
  assert.match(layout, /CashFlow OS/);
  assert.match(layout, /openGraph/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
  await access(new URL("../public/og.png", import.meta.url));
});

test("packages backend bindings and D1 migrations with the deployed worker", async () => {
  const hosting = JSON.parse(
    await readFile(
      new URL("../dist/.openai/hosting.json", import.meta.url),
      "utf8",
    ),
  );

  assert.equal(hosting.d1, "DB");
  assert.equal(hosting.r2, "RECEIPTS");
  await access(
    new URL("../dist/.openai/drizzle/0000_short_loki.sql", import.meta.url),
  );
  await access(
    new URL("../dist/.openai/drizzle/0001_broad_big_bertha.sql", import.meta.url),
  );
  await access(
    new URL("../dist/.openai/drizzle/0002_wonderful_meggan.sql", import.meta.url),
  );
});
