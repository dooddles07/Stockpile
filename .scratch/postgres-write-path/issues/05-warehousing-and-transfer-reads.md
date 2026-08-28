# 05: Warehousing and Transfer reads from Postgres

**What to build:** Transfers, picking, packing and receiving state exist as tables, are loaded by the seed, and their screens render from Postgres. Warehouses and Locations already exist from ticket 02; this ticket covers the activity that moves stock between them.

To a user nothing changes. The Playwright suite proves it.

The in-transit balance is derived from open Transfer state, not from the Movement ledger. A Transfer is the one Document with two ends — stock has left a source Location and not yet arrived at a destination — so the derivation must account for both, and the schema must make the two ends explicit rather than implied by a status value.

Transfer status is modelled explicitly, as with the other Documents.

This ticket runs in parallel with 03, 04 and 06.

**Blocked by:** 02 (Inventory schema, seed, and reads from Postgres).

**Status:** ready-for-agent

- [ ] Schema covers Transfers and their lines, picking, packing and receiving state
- [ ] A Transfer's source and destination are explicit in the schema
- [ ] Transfer states are modelled explicitly rather than as free text
- [ ] The seed script loads this area from the generated dataset
- [ ] Warehousing repository function bodies query Postgres; their signatures are unchanged
- [ ] The in-transit balance is derived from open Transfer state, not from Movements
- [ ] The Playwright suite passes unmodified
