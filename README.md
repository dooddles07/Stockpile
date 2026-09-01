# Stockpile

**Live demo: https://stockpile-peach.vercel.app**

An inventory management platform for businesses that hold stock across several sites — the full lifecycle from purchase order to shelf to shipment, with the movement ledger, approvals and audit trail that make the numbers defensible.

The data lives in Postgres (Neon) — reads and writes both hit the database. Stock changes and the documents that cause them are event-sourced: the movement ledger is an append-only fact and the balances on every screen are projections rebuilt from it. The deterministic dataset that used to render the screens at runtime is now the seed that loads that database.

## What it covers

| Area | Screens |
|---|---|
| **Overview** | Dashboard (KPIs, charts, operational widgets), approvals queue, tasks, notifications |
| **Inventory** | Products with a 7-tab record, categories, stock levels with saved views, movement ledger, adjustments, stock counts |
| **Warehousing** | Warehouses, zone→aisle→rack→bin locations, transfers, receiving, picking with walk-order sheets, packing |
| **Purchasing** | Purchase orders with approval and goods receipt, suppliers with performance scorecards, purchase returns |
| **Sales** | Sales orders, reservation → picking → packing → shipment, customers with credit limits, sales returns |
| **Analytics** | Inventory, valuation (FIFO/AVCO), sales, purchasing, warehouse performance, saved reports |
| **Administration** | Users, role permission matrix, audit log investigator, automation rule builder, integrations, settings |
| **Handheld** | A separate operator surface for lookup, scanning, receiving and approvals on a phone |

## The parts worth looking at

- **Roles are real.** Seven roles drive a `can(role, module, action)` permission engine. Switching role in the top bar changes navigation, page actions, row actions and denied states — an Auditor cannot reach a single write action anywhere in the product.
- **One table component.** Every list in the app is the same TanStack-based `<DataTable>`: sticky header, column resize and visibility, faceted filters, multi-sort, bulk selection, density, saved views, CSV export that matches what is on screen, and row virtualization past 60 rows.
- **The write path is real.** Receiving a purchase order, shipping a sales order, moving stock between warehouses, adjustments, damage, stock counts and returns in both directions all commit through one choke point (`applyStockChange`): inside a single transaction it locks the stock row, appends an event and updates the projection. On-hand can never be driven negative and never disagrees with the replayed event stream.
- **Automation runs after commit.** When an event commits, matching automation rules evaluate in-process in the same request — no scheduler — and each evaluation is recorded as an attributable run that can fail without failing the operation that triggered it.
- **The ledger reconciles.** Each product+site movement chain is anchored to today's on-hand, so the newest row's closing balance is the number the stock pages show, and no historic balance goes negative.
- **Every state is designed.** Loading skeletons, empty states, error boundaries, permission-denied pages and an offline banner ship for every route.
- **Accessible by default.** Status is never colour alone, focus is visible at every stop, dialogs trap and restore focus, and text meets 4.5:1 against both surface tones in light and dark.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui on Base UI · Drizzle ORM + Neon Postgres · TanStack Table · Recharts · react-hook-form + Zod · nuqs · Lucide · Playwright

## Running it

```bash
npm install
export DATABASE_URL=postgres://…   # a Neon connection string (pooled)
npm run db:migrate                 # apply migrations
npm run db:seed                    # load the deterministic dataset
npm run dev                        # http://localhost:3000
```

`db:seed` truncates and reloads every table; it is safe to re-run.

### Which Neon branch to point at

The `stockpile` Neon project has three branches and each serves exactly one
purpose. `db:seed` truncates every table, so pointing the wrong `DATABASE_URL`
at the wrong branch destroys someone else's data.

| Branch | Purpose | Written by |
|---|---|---|
| `main` (primary) | the public demo | the deployed app and the daily reset workflow (ADR-0010) |
| `ci` | the Playwright and check runs | every CI run, which truncates and reseeds it |
| `dev` | local development | you, from your machine |

Local `.env` holds the `dev` branch's **pooled** connection string. Never point
it at `main` — the first local `db:seed` would wipe what a demo visitor is
looking at. CI holds the `ci` string as the `DATABASE_URL` repo secret.

```bash
npm run build    # production build
npm run start    # serve the build
npm run lint
```

## Layout

```
app/(app)        desktop application shell and routes
app/(operator)   handheld operator surface
components/      shell, data-table, record, charts, states, status, ui primitives
lib/auth         roles and the permission engine
lib/db           Drizzle schema, the Neon client, and the seed script
lib/domain       the write path: the stock choke point and one function per flow
lib/repo         read query layer over Postgres, shaped for the pages
lib/data         the deterministic dataset generator — now the seed source
```

`lib/repo` reads; `lib/domain` writes. A server action validates its input with Zod and calls a domain function — no business logic lives in an action (ADR-0005). Every mutation takes the acting user as its first argument and checks permission before touching data (ADR-0004).

## Data

The dataset is generated from a seeded PRNG against a fixed clock, so it loads identically on every machine — the Playwright suite depends on that determinism, and the demo reset in ADR-0010 is this same seed run again. It holds roughly 270 products across 9 categories, 6 warehouses with ~180 bin locations, 24 suppliers, 140 purchase orders, 260 sales orders, 48 transfers, 90 adjustments, 14 counts, 38 users and over 6,000 movement ledger rows. `npm run db:seed` truncates every table and reloads it, so the database returns to that known state on demand.

Writes are persisted: a form submission commits an event and updates the projection in one transaction.

## Architecture

The design decisions and their reasoning live as numbered ADRs in [`docs/adr/`](docs/adr/) — the event-sourcing boundary, one Postgres for both the stream and its projections, stock concurrency, and the zero-recurring-cost constraint that drives most of the rest. [`CONTEXT.md`](CONTEXT.md) is the domain glossary: Movement, Stock Row, Document, Event, Projection, Actor, Automation Rule, Automation Run.

## Licence

MIT — see [LICENSE](LICENSE).
