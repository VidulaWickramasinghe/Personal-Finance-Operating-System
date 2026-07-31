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
- Cross-device regional and notification preferences stored with the workspace
- Receipt names, types, sizes, and object keys linked to their transactions
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

GitHub Codespaces forwards only port `3000`. The other ephemeral sockets are
internal Workers runtime/debugger channels and are ignored by the checked-in
dev-container configuration. Rebuild the container once after pulling this
change. The Vite server also explicitly permits the forwarded HTTPS origin so
browser modules and hot reload do not fail CORS checks.

Generate a new D1 migration after changing `db/schema.ts`:

```bash
pnpm run db:generate
```

Sites bindings are declared in `.openai/hosting.json`. The published app uses
the authenticated workspace identity headers supplied by OpenAI Sites; local
development uses a dedicated local identity. Financial records are stored in
D1, receipts are stored in R2, and no demo accounts, transactions, budgets,
goals, bills, or balances are inserted.

Vercel builds use the standard Next.js output and a build-time Cloudflare
module shim. The UI deploys successfully there, but persistent finance APIs
still require the `DB` and `RECEIPTS` bindings supplied by OpenAI Sites or
Cloudflare Workers; the app reports that storage is unavailable rather than
substituting unsafe in-memory data.

### Vercel project settings

The repository includes an explicit `@vercel/next` builder so a deployment
cannot succeed with an empty output. In the Vercel project, set **Root
Directory** to `.` (the repository root) and disable overrides for Build
Command, Install Command, and Output Directory so `vercel.json` remains
authoritative. A successful deployment runs `pnpm install`, `next build`, and
exposes `/api/health`; an 82 ms build with no install output means the Vercel
project is still targeting the wrong Root Directory or has Skip Build enabled.

Finance data is never migrated or cleared by a Vercel build. The existing D1
and R2 data remains in the backend used by the Cloudflare deployment.
Set the Vercel environment variable `FINANCE_BACKEND_URL` to the origin of that
private Cloudflare/OpenAI Sites deployment (without a trailing slash). Next.js
then proxies every `/api/finance/*` request to the existing D1/R2 backend, so
Vercel uses the same saved records instead of creating or replacing data.
