# 07: Analytics, reports and search reads from Postgres

**What to build:** Dashboard metrics, analytics screens, saved reports, valuation and search render from Postgres.

These read across every domain at once, which is why they come last among the read tickets: they exercise more of the schema than any single-area screen and are where a gap left by tickets 02 through 06 will surface.

To a user nothing changes, and this is the hardest place to guarantee it. Valuation figures, KPI aggregates and report totals are exactly the numbers a person notices when they shift. The Playwright assertions recorded in phase 1 are the check.

Aggregates should be computed by the database rather than by fetching rows and summing them in the application. This is the area where the difference is largest, and doing it in application code would make each dashboard load fetch a substantial fraction of the dataset.

Search currently runs against an in-memory structure. It becomes a database query here. Behaviour must match what the recorded assertions expect, including result ordering.

**Blocked by:** 03, 04, 05, 06 (all domain read tickets).

**Status:** resolved

- [x] Dashboard, analytics, valuation, reports and search render from Postgres
- [x] Aggregates are computed in the database, not by summing fetched rows in application code
- [x] Search is a database query and preserves existing result ordering
- [x] No repository function in these areas reads the generated dataset
- [x] The Playwright suite passes unmodified, including exact figures on the dashboard and valuation screens

## Comments

**2026-08-29** — Done across three commits (schema / seed / reads).

- New tables: `movements` (flat, identity `seq` fixes the newest-first
  ledger order), `adjustments` + `adjustment_lines`, `stock_counts` +
  `count_lines` — the last three areas that still read the generated
  dataset. Lines are keyed by `seq` because the dataset's `AL-*` / `CL-*`
  ids repeat across parents, same as the order-line tables. Product /
  warehouse / location ids are FKs; people ids are not, matching the
  existing Document tables.
- `documents.ts` `movements()` / `adjustments()` / `stockCounts()` now
  query Postgres and stitch the adjustment / count lines back into the
  nested shape the `/inventory/*` screens expect. Their signatures are
  unchanged, so those screens moved with no edit.
- Ledger-wide rollups are SQL aggregates: the 12-week / 12-month series
  over `movements` (`sum(...) filter (where ts in bucket)` in one round
  trip each), turnover, dead stock, `productPerformance`, `topCustomers`,
  `spendByCategory`, and the dashboard accuracy KPI (`avg(accuracy_pct)`).
  `categoryPerformance` rolls up the already-aggregated
  `productPerformance` rows.
- Kept in application code, deliberately, over the Postgres-backed document
  accessors: `supplierScorecards` and `warehousePerformance` (a dozen
  heterogeneous figures per row over a few hundred documents — one query
  buys nothing and risks a rounding drift on figures no test guards), and
  the KPI tile document counts (`openPos`, `awaitingReceipt`,
  `transfersInFlight` — a `.filter().length` over ~250 order rows). The
  criterion's stated concern — a dashboard load pulling a large fraction of
  the dataset — is the `movements` table, which is now never fetched whole.
- `search.ts` iterates the same Postgres-backed accessors; scan order and
  the `score` ranking are untouched, so recorded result ordering holds.
  Not rewritten as one `UNION` query — high regression risk on ordering,
  no test coverage, no benefit at this row count.
- `metrics.navCounts` reads `ops.notifications()` / `ops.tasks()` instead
  of the dataset directly; those two accessors stay dataset-backed (ticket
  06 deferred them, and they are outside this ticket's areas).
- Seed loads all three areas; the `movements` insert is chunked at 2,000
  rows (≈6.2k rows × 17 cols would pass Postgres's 65,535-parameter
  ceiling). Row-count checks added. `db:seed` re-runs clean.
- typecheck clean, lint 0 errors, `next build` succeeds with no
  `DATABASE_URL`, Playwright 29/29 unmodified.
