# 05: Warehousing and Transfer reads from Postgres

**What to build:** Transfers, picking, packing and receiving state exist as tables, are loaded by the seed, and their screens render from Postgres. Warehouses and Locations already exist from ticket 02; this ticket covers the activity that moves stock between them.

To a user nothing changes. The Playwright suite proves it.

The in-transit balance is derived from open Transfer state, not from the Movement ledger. A Transfer is the one Document with two ends — stock has left a source Location and not yet arrived at a destination — so the derivation must account for both, and the schema must make the two ends explicit rather than implied by a status value.

Transfer status is modelled explicitly, as with the other Documents.

This ticket runs in parallel with 03, 04 and 06.

**Blocked by:** 02 (Inventory schema, seed, and reads from Postgres).

**Status:** resolved

- [x] Schema covers Transfers and their lines, picking, packing and receiving state
- [x] A Transfer's source and destination are explicit in the schema
- [x] Transfer states are modelled explicitly rather than as free text
- [x] The seed script loads this area from the generated dataset
- [x] Warehousing repository function bodies query Postgres; their signatures are unchanged
- [x] The in-transit balance is derived from open Transfer state, not from Movements
- [x] The Playwright suite passes unmodified

## Comments

`lib/db/schema.ts` adds `transfer_status` (a real Postgres enum over the
`TransferStatus` union — `draft` through `received` plus `cancelled`, matching
`WORKFLOWS.transfer`), `transfers`, and `transfer_lines`. Both ends of the
Document are explicit columns, not implied by the status: `from_warehouse_id` /
`to_warehouse_id` on the parent (real FKs to `warehouses`) and `from_location_id`
/ `to_location_id` on each line (FKs to `locations`, the second nullable until
put-away). Lines are their own table keyed by identity `seq` because the
dataset's `TL-001` ids repeat across parents; the seed inserts in array order so
`ORDER BY seq` reproduces it. `approvals` is `jsonb`, as on Purchase Orders.
Picking and packing state is Sales-Order state, already on Postgres from ticket
04; this ticket covers the transfer half of receiving.

`lib/db/seed.ts` loads `transfers` (52) and `transfer_lines` (222) after the
sales area — they reference only warehouses, products and locations, all seeded
earlier — with truncate entries and row-count checks, so a re-seed stays
idempotent.

`documents.transfers()` now queries Postgres (two ordered queries stitched with
`groupBy`, deduped per request with React `cache`); its signature is unchanged,
and `transferRows()` still derives from it untouched. `documents.inTransitByProduct()`
projects the in-transit balance from open Transfer state — `sum(shipped -
received)` over the lines of Transfers in `in-transit` / `partially-received` —
never from the Movement ledger, which settles a transfer as paired
`transfer-out` / `transfer-in` Movements once it lands and cannot express the
gap in between (CONTEXT.md "In Transit", ADR-0002). Like ticket 03/04's
`incomingByProduct` / `reservedByProduct`, nothing reads it yet — the stock
screens still render the seeded `stock_rows.in_transit`, and this is the query
the write path (ticket 09) rebuilds it from. `inventory.warehouseRollups()`
drops its last `db.transfers` read for the Postgres-backed `transfers()`.

All 29 Playwright tests pass unmodified against the seeded database;
`npm run typecheck` and `npm run lint` are clean.
