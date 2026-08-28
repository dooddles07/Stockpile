# Stockpile

An inventory management platform for businesses that hold stock across several sites — the full lifecycle from purchase order to shelf to shipment, with the movement ledger, approvals and audit trail that make the numbers defensible.

Built as a front-end system: every screen runs against a deterministic in-memory dataset rather than a database, so the whole product can be explored end to end without a backend.

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
- **The ledger reconciles.** Each product+site movement chain is anchored to today's on-hand, so the newest row's closing balance is the number the stock pages show, and no historic balance goes negative.
- **Every state is designed.** Loading skeletons, empty states, error boundaries, permission-denied pages and an offline banner ship for every route.
- **Accessible by default.** Status is never colour alone, focus is visible at every stop, dialogs trap and restore focus, and text meets 4.5:1 against both surface tones in light and dark.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui on Base UI · TanStack Table · Recharts · react-hook-form + Zod · nuqs · Lucide

## Running it

```bash
npm install
npm run dev      # http://localhost:3000
```

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
lib/data         seeded deterministic dataset
lib/repo         query layer between the data and the pages
```

`lib/repo` sits between the fixtures and the pages, so swapping in a real database is one file per entity rather than a rewrite of the screens.

## Data

The dataset is generated from a seeded PRNG against a fixed clock, so it is identical on every machine and every render — no hydration mismatches, and screenshots stay comparable. It holds roughly 270 products across 9 categories, 6 warehouses with ~180 bin locations, 24 suppliers, 140 purchase orders, 260 sales orders, 48 transfers, 90 adjustments, 14 counts, 38 users and over 6,000 movement ledger rows.

Writes are not persisted: submitting a form validates, reports what would happen, and returns to the record.

## Licence

MIT — see [LICENSE](LICENSE).
