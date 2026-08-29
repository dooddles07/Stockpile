# 04: Sales and Customer reads from Postgres

**What to build:** Sales Orders, fulfilment state, Customers and customer Returns exist as tables, are loaded by the seed, and their screens render from Postgres.

To a user nothing changes. The Playwright suite proves it.

The reserved balance is derived from open Sales Order state, not from the Movement ledger. Queries here must feed that derivation from Document state rather than computing it from Movements.

Sales Order status is modelled explicitly, including the fulfilment progression the screens already display. Customers carry credit limits, which are reference data rather than derived values.

This ticket runs in parallel with 03, 05 and 06.

**Blocked by:** 02 (Inventory schema, seed, and reads from Postgres).

**Status:** resolved

- [x] Schema covers Sales Orders and their lines, fulfilment state, Customers and customer Returns
- [x] Sales Order states are modelled explicitly rather than as free text
- [x] The seed script loads this area from the generated dataset
- [x] Sales repository function bodies query Postgres; their signatures are unchanged
- [x] The reserved balance is derived from open Sales Order state, not from Movements
- [x] The Playwright suite passes unmodified

## Comments

`lib/db/schema.ts` gains `customers`, `sales_orders` and `sales_order_lines`.
Customers are Reference Data — plain mutable rows, same treatment as ticket
03's Suppliers — with `credit_limit` stored as reference data, not derived.
Sales Orders are Documents (ADR-0002), so `status` is a real `so_status`
enum over the fulfilment progression the screens show (`draft` through
`delivered`, plus `cancelled` / `backorder`), matching `WORKFLOWS.salesOrder`
in `lib/status.ts`. `payment_status` and `fulfillment_status` are enums too —
closed sets matching the unions in `lib/types.ts` — since "fulfilment state"
is in the schema's scope. Lines are their own table keyed by identity `seq`
(the `LN-001` ids repeat across parents); real FKs to `customers`,
`warehouses` and `products`.

`lib/db/seed.ts` loads the three tables from the generated dataset (28 / 430
/ 1720 rows) in FK order after the purchasing area, with row-count checks
and truncate entries so a re-seed stays idempotent.

`documents.salesOrders()` and `reference.customers()` now query Postgres,
signatures unchanged — `salesOrders()` is two ordered queries (parent by
`id`, lines by `seq`) stitched back together, deduped per request with React
`cache`. `inventory.customerById()` drops its in-memory map for a cached
`indexById` over the Postgres-backed `customers()`, mirroring how ticket 03
moved `supplierById`. `returns.ts` needed only a comment: its sales
counterparty now resolves from Postgres through the same `indexById` call.

`documents.reservedByProduct()` projects the reserved balance from open
Sales Order state — `sum(quantity - fulfilled)` over lines of orders in
`confirmed` / `reserved` / `picking` / `packing` — never from the Movement
ledger (CONTEXT.md "Reserved", ADR-0002). Reservation starts at `confirmed`
because the sales-orders screen states that rule ("Confirming an order
reserves stock against it"). Like ticket 03's `incomingByProduct`, nothing
reads it yet — the read-phase stock screens still render the seeded
`stock_rows.reserved` projection, and this is the query the write path
(ticket 09) rebuilds it from.

All 29 Playwright tests pass unmodified against the seeded database;
`npm run typecheck` is clean.
