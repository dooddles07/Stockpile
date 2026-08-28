# 02: Inventory schema, seed, and reads from Postgres

**What to build:** The first vertical slice through the whole stack. Products, Categories, Warehouses, Locations and Stock Rows exist as tables, a seed script loads them from the generated dataset, and every inventory screen renders from Postgres instead of memory.

To a user nothing changes. Products, stock levels, movements, adjustments, categories and stock counts show exactly what they showed before, and the phase 1 Playwright suite proves it — now running against a freshly seeded Neon branch.

The seed script is a first-class artifact, not throwaway migration code. It is deterministic from the existing fixed generator seed, so the recorded Playwright assertions stay valid. It is safe to re-run against a populated database by truncating first. CI runs it on every test run, and ADR-0010's daily demo reset is this same script called again. Build it to be run repeatedly by other things.

Reference data gets real foreign keys. That is a benefit of ADR-0003's single-database decision and should be used rather than left to application code. No table carries a tenant column, per ADR-0001.

Repository function signatures do not change. Phase 1 made them correct; only the bodies move. Where a phase 1 function was shaped to serve one screen, it should now be one query rather than several.

**Blocked by:** 01 (Database connection and CI harness).

**Status:** ready-for-agent

- [ ] Schema covers Products, Categories, Warehouses, Locations and Stock Rows, with foreign keys between them
- [ ] A seed script loads the generated dataset into Postgres and is deterministic from the existing fixed seed
- [ ] The seed script is safe to re-run against a populated database
- [ ] CI seeds the Neon branch before running the suite
- [ ] Inventory repository function bodies query Postgres; their signatures are unchanged
- [ ] Screen-shaped repository functions issue one query rather than several
- [ ] No tenant column exists on any table
- [ ] The Playwright suite passes unmodified against the seeded database
