# 02: Inventory schema, seed, and reads from Postgres

**What to build:** The first vertical slice through the whole stack. Products, Categories, Warehouses, Locations and Stock Rows exist as tables, a seed script loads them from the generated dataset, and every inventory screen renders from Postgres instead of memory.

To a user nothing changes. Products, stock levels, movements, adjustments, categories and stock counts show exactly what they showed before, and the phase 1 Playwright suite proves it — now running against a freshly seeded Neon branch.

The seed script is a first-class artifact, not throwaway migration code. It is deterministic from the existing fixed generator seed, so the recorded Playwright assertions stay valid. It is safe to re-run against a populated database by truncating first. CI runs it on every test run, and ADR-0010's daily demo reset is this same script called again. Build it to be run repeatedly by other things.

Reference data gets real foreign keys. That is a benefit of ADR-0003's single-database decision and should be used rather than left to application code. No table carries a tenant column, per ADR-0001.

Repository function signatures do not change. Phase 1 made them correct; only the bodies move. Where a phase 1 function was shaped to serve one screen, it should now be one query rather than several.

**Blocked by:** 01 (Database connection and CI harness).

**Status:** resolved

- [x] Schema covers Products, Categories, Warehouses, Locations and Stock Rows, with foreign keys between them
- [x] A seed script loads the generated dataset into Postgres and is deterministic from the existing fixed seed
- [x] The seed script is safe to re-run against a populated database
- [x] CI seeds the Neon branch before running the suite
- [x] Inventory repository function bodies query Postgres; their signatures are unchanged
- [x] Screen-shaped repository functions issue one query rather than several
- [x] No tenant column exists on any table
- [x] The Playwright suite passes unmodified against the seeded database

## Comments

`lib/db/schema.ts` adds `categories`, `warehouses`, `locations`, `products`
and `stock_rows`, with real foreign keys between them (ADR-0003's single
database). Column shapes mirror `lib/types.ts`; dates are stored as ISO
strings, not `timestamp`, so a round trip through Postgres changes no
rendered value. `stock_rows.seq` is an identity column so `ORDER BY seq`
reproduces the generator's iteration order, which recorded assertions
depend on. No table carries a tenant column (ADR-0001).

`lib/db/seed.ts` loads the generated dataset (`lib/data/store.ts`,
deterministic from a fixed seed) in FK order. It truncates first
(`RESTART IDENTITY CASCADE`), so it is safe to re-run and reaches the same
state every time — the same script ADR-0010's daily demo reset calls.
Row-count checks fail loud if an insert dropped rows. `npm run db:seed`.

`lib/repo/inventory.ts` and `reference.ts` bodies now query Postgres;
signatures are unchanged from phase 1. The three screen-shaped functions —
`productRows`, `stockLevelRows`, `warehouseRollups` — are each a single
joined query, with integer quantities summed in SQL and the money
arithmetic left in JS. The primitive lookups share one batched `load()`
per request via React `cache`.

CI (`.github/workflows/e2e.yml`) applies migrations and runs `db:seed`
before the Playwright step. All 29 phase-1 tests pass unmodified against
the seeded database.
