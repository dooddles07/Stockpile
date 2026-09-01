# 14: The import wizard writes what it validates

**What to build:** The import wizard commits the rows it has already validated — products, suppliers, customers and opening stock — as one transaction per file.

`lib/import/validate.ts` is real work and it is complete: four schemas with field aliases, per-field validators, duplicate-identity detection across the file, and a delimited parser. `import-wizard.tsx` walks the user through mapping columns, shows the errors clearly, and then announces that some number of rows were imported when none were.

Three of the four kinds are reference data and route to the domain functions built in phase 2 — `createProduct`, `createSupplier`, `createCustomer` — so they inherit their permission checks and their validation for free.

The fourth is the one to get right. "Opening stock" sets on-hand quantities per SKU per location, which is a stock change, and stock changes have exactly one legal route: the choke point. It must not write `stock_rows`. Its own description says "use for a new site or a full recount", which is precisely the semantics of a count correction, so each row becomes a `count-correction` Movement setting on-hand to the counted figure, through `applyStockChange`, with `ensureStockHolding` first where the product has never sat in that location.

A file is one transaction. A file whose last row fails imports nothing, so a bad export from a supplier cannot leave the catalogue half-populated and half-correct.

**Blocked by:** 13 (the roles permission matrix, actually editable).

**Status:** open

- [ ] All four import kinds write, through a single `importRows(actor, kind, rows, db)` domain function that checks permission first
- [ ] Products, suppliers and customers route to the existing reference-data domain functions
- [ ] Opening stock routes through the choke point as `count-correction` Movements and never writes `stock_rows` directly
- [ ] A holding that does not exist yet is created through `ensureStockHolding` before the correction
- [ ] The whole file is one transaction: a failure on any row imports nothing
- [ ] The wizard reports what was actually written, not what was parsed
- [ ] A Role that forbids importing is refused when reaching the domain function directly
- [ ] A check proves a file whose last row is invalid leaves the database untouched
- [ ] End-to-end coverage exists for importing products and for an imported opening-stock row appearing in the movement ledger as a correction
