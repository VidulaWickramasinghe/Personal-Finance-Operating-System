import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("builds the CashFlow OS product shell", async () => {
  const [app, layout] = await Promise.all([
    readFile(new URL("../app/cashflow-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);

  await access(new URL("../.next/server/app/page.js", import.meta.url));
  assert.match(layout, /CashFlow OS · Personal Money Management/i);
  assert.match(app, /CashFlow/);
  assert.match(app, /Total cash balance/i);
  assert.match(app, /Monthly income/i);
  assert.match(app, /Add transaction/i);
  assert.doesNotMatch(app, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("supports Vercel builds and limits Codespaces port forwarding", async () => {
  const [vercel, devcontainer, vite, packageJson, nextConfig] = await Promise.all([
    readFile(new URL("../vercel.json", import.meta.url), "utf8"),
    readFile(new URL("../.devcontainer/devcontainer.json", import.meta.url), "utf8"),
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
  ]);
  assert.equal(JSON.parse(vercel).framework, "nextjs");
  assert.match(JSON.parse(vercel).installCommand, /pnpm install --frozen-lockfile/);
  assert.equal(JSON.parse(packageJson).dependencies.next, "16.2.6");
  assert.equal(JSON.parse(packageJson).packageManager, "pnpm@10.28.1");
  assert.deepEqual(JSON.parse(devcontainer).forwardPorts, [3000]);
  assert.equal(JSON.parse(devcontainer).otherPortsAttributes.onAutoForward, "ignore");
  assert.match(vite, /clientPort: 443/);
  assert.match(nextConfig, /process\.env\.VERCEL === "1"/);
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
