# 03: Purchasing and Supplier reads from Postgres

**What to build:** Purchase Orders, goods received, Suppliers and supplier Returns exist as tables, are loaded by the seed, and their screens render from Postgres.

To a user nothing changes. The Playwright suite proves it.

The incoming balance is derived from open Purchase Order state, not from the Movement ledger — no Movement type produces it. That derivation lives behind the seam already, and the queries here must feed it from Document state rather than attempting to compute it from Movements.

Purchase Order status is part of the schema, since ADR-0002 makes Documents state machines rather than rows with a loose status string. Model the states this Document actually has.

This ticket runs in parallel with 04, 05 and 06.

**Blocked by:** 02 (Inventory schema, seed, and reads from Postgres).

**Status:** resolved

- [x] Schema covers Purchase Orders and their lines, goods receipts, Suppliers and supplier Returns
- [x] Purchase Order states are modelled explicitly rather than as free text
- [x] The seed script loads this area from the generated dataset
- [x] Purchasing repository function bodies query Postgres; their signatures are unchanged
- [x] The incoming balance is derived from open Purchase Order state, not from Movements
- [x] The Playwright suite passes unmodified

## Comments

`lib/db/schema.ts` adds `suppliers` (Reference Data — plain mutable rows),
`purchase_orders` + `purchase_order_lines`, and `returns` +
`return_lines`. `po_status` and `return_status` / `return_kind` are real
Postgres enums the database rejects unknown values for, not free text
(ADR-0002: Documents are state machines). Lines are their own tables keyed
by an identity `seq` because the dataset's line ids repeat across parents;
the seed inserts in array order so `ORDER BY seq` reproduces it.

There is no `goods_receipts` table. A goods receipt in this phase is the
projection formed by a line's `fulfilled` quantity plus the order reaching
`partially-received` / `received` / `closed` — exactly what the phase-1
generator models. The receipt as a recorded Event belongs to the write
path (ticket 12).

`lib/db/seed.ts` loads suppliers, purchase orders and their lines, and
returns and their lines (both kinds — `returns` / `return_lines` are
shared) from the generated dataset, with row-count checks.

`lib/repo/documents.ts`, `reference.ts` and `returns.ts` bodies now query
Postgres; signatures are unchanged. Parent-and-lines documents are two
ordered queries stitched back together, deduped per request with React
`cache`. `incomingByProduct()` projects the incoming balance from open
Purchase Order state — `sum(quantity - fulfilled)` over lines of orders in
submitted / approved / ordered / partially-received — never from the
Movement ledger, which has no movement type that produces it (ADR-0002,
story 21). `inventory.ts` drops its in-memory supplier map and reads
through the Postgres-backed `suppliers()`.

CI is green (see ticket 01's 2026-08-29 update for the harness change);
all 29 Playwright tests pass unmodified.
