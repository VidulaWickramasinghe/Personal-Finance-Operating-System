# CashFlow OS

CashFlow OS is a private, responsive personal-finance workspace for managing
accounts, transactions, transfers, category budgets, savings goals, bills, and
exportable reports.

## Product capabilities

- Full create, read, update, delete, duplicate, search, filter, sort, bulk-edit,
  archive, restore, and pagination workflows
- Atomic account balance updates for transactions, transfers, and bill payments
- Purpose-aware accounts for salary, daily spending, bills, international
  payments, and protected savings
- Budget alerts, goal projections, financial-health indicators, reports, and
  CSV, Excel-compatible, and print/PDF exports
- Owner-scoped D1 persistence and private R2 receipt storage
- Clean first-run onboarding with no fabricated balances or financial activity
- An idempotent system category catalogue for income, expenses, bills, and budgets
- Responsive light/dark interface with keyboard shortcuts and accessible
  dialogs, tables, loading states, and feedback

## Local development

Requires Node.js `>=22.13.0`.

```bash
pnpm install
pnpm run dev
pnpm run lint
pnpm run build
```

Generate a new D1 migration after changing `db/schema.ts`:

```bash
pnpm run db:generate
```

Sites bindings are declared in `.openai/hosting.json`. The published app uses
the authenticated workspace identity headers supplied by OpenAI Sites; local
development uses a dedicated local identity. Financial records are stored in
D1, receipts are stored in R2, and no demo accounts, transactions, budgets,
goals, bills, or balances are inserted.

The production command intentionally uses Vite/vinext rather than `next build`.
That build emits the Cloudflare Worker and packages `.openai/hosting.json` plus
the D1 migrations under `dist/.openai`, allowing Sites to provision the `DB`
and `RECEIPTS` bindings and apply the database schema during deployment.
