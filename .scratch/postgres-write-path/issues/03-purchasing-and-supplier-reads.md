# 03: Purchasing and Supplier reads from Postgres

**What to build:** Purchase Orders, goods received, Suppliers and supplier Returns exist as tables, are loaded by the seed, and their screens render from Postgres.

To a user nothing changes. The Playwright suite proves it.

The incoming balance is derived from open Purchase Order state, not from the Movement ledger — no Movement type produces it. That derivation lives behind the seam already, and the queries here must feed it from Document state rather than attempting to compute it from Movements.

Purchase Order status is part of the schema, since ADR-0002 makes Documents state machines rather than rows with a loose status string. Model the states this Document actually has.

This ticket runs in parallel with 04, 05 and 06.

**Blocked by:** 02 (Inventory schema, seed, and reads from Postgres).

**Status:** ready-for-agent

- [ ] Schema covers Purchase Orders and their lines, goods receipts, Suppliers and supplier Returns
- [ ] Purchase Order states are modelled explicitly rather than as free text
- [ ] The seed script loads this area from the generated dataset
- [ ] Purchasing repository function bodies query Postgres; their signatures are unchanged
- [ ] The incoming balance is derived from open Purchase Order state, not from Movements
- [ ] The Playwright suite passes unmodified
