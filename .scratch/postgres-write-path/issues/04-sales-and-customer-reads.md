# 04: Sales and Customer reads from Postgres

**What to build:** Sales Orders, fulfilment state, Customers and customer Returns exist as tables, are loaded by the seed, and their screens render from Postgres.

To a user nothing changes. The Playwright suite proves it.

The reserved balance is derived from open Sales Order state, not from the Movement ledger. Queries here must feed that derivation from Document state rather than computing it from Movements.

Sales Order status is modelled explicitly, including the fulfilment progression the screens already display. Customers carry credit limits, which are reference data rather than derived values.

This ticket runs in parallel with 03, 05 and 06.

**Blocked by:** 02 (Inventory schema, seed, and reads from Postgres).

**Status:** ready-for-agent

- [ ] Schema covers Sales Orders and their lines, fulfilment state, Customers and customer Returns
- [ ] Sales Order states are modelled explicitly rather than as free text
- [ ] The seed script loads this area from the generated dataset
- [ ] Sales repository function bodies query Postgres; their signatures are unchanged
- [ ] The reserved balance is derived from open Sales Order state, not from Movements
- [ ] The Playwright suite passes unmodified
