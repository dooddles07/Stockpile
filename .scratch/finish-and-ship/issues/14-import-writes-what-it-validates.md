# 14: The import wizard writes what it validates

**What to build:** The import wizard commits the rows it has already validated — products, suppliers, customers and opening stock — as one transaction per file.

`lib/import/validate.ts` is real work and it is complete: four schemas with field aliases, per-field validators, duplicate-identity detection across the file, and a delimited parser. `import-wizard.tsx` walks the user through mapping columns, shows the errors clearly, and then announces that some number of rows were imported when none were.

Three of the four kinds are reference data and route to the domain functions built in phase 2 — `createProduct`, `createSupplier`, `createCustomer` — so they inherit their permission checks and their validation for free.

The fourth is the one to get right. "Opening stock" sets on-hand quantities per SKU per location, which is a stock change, and stock changes have exactly one legal route: the choke point. It must not write `stock_rows`. Its own description says "use for a new site or a full recount", which is precisely the semantics of a count correction, so each row becomes a `count-correction` Movement setting on-hand to the counted figure, through `applyStockChange`, with `ensureStockHolding` first where the product has never sat in that location.

A file is one transaction. A file whose last row fails imports nothing, so a bad export from a supplier cannot leave the catalogue half-populated and half-correct.

**Blocked by:** 13 (the roles permission matrix, actually editable).

**Status:** resolved

- [x] All four import kinds write, through a single `importRows(actor, kind, rows, db)` domain function that checks permission first
- [x] Products, suppliers and customers route to the existing reference-data domain functions
- [x] Opening stock routes through the choke point as `count-correction` Movements and never writes `stock_rows` directly
- [x] A holding that does not exist yet is created through `ensureStockHolding` before the correction
- [x] The whole file is one transaction: a failure on any row imports nothing
- [x] The wizard reports what was actually written, not what was parsed
- [x] A Role that forbids importing is refused when reaching the domain function directly
- [x] A check proves a file whose last row is invalid leaves the database untouched
- [x] End-to-end coverage exists for importing products and for an imported opening-stock row appearing in the movement ledger as a correction

## Comments

**2026-09-03** — Built `lib/domain/import.ts`: `importRows(actor, kind, rows, db)` checks the kind's permission before opening one transaction for the whole file. Products/suppliers/customers route to `createProduct`/`createSupplier`/`createCustomer` on that `tx` (`lib/domain/reference.ts`'s `Db` type widened to accept a transaction handle, the way `stock.ts` already does). Opening stock resolves SKU/warehouse/bin, calls `ensureStockHolding`, then sets on-hand to the counted figure with a `count-correction` through `applyStockChange` — a row already at its count writes nothing, as `completeStockCount` does. A reference `conflict` or a choke-point rejection is re-framed as `ImportError` so the wizard shows the message rather than a 500. Server action `app/(app)/import/actions.ts`; the wizard now awaits it and only advances to the summary on success, reporting the server's written count. Create-only for the three reference kinds (a file repeating an on-file identifier is rejected whole) — upsert is deferred. `npm run check:import` proves the forbidden-role refusal and that a file failing on its last row (bad category, duplicate SKU, unknown stock SKU) writes nothing; `e2e/import.write.spec.ts` covers a products import and an opening-stock row landing in the ledger as a correction.
