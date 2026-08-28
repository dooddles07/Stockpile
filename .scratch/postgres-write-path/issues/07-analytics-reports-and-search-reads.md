# 07: Analytics, reports and search reads from Postgres

**What to build:** Dashboard metrics, analytics screens, saved reports, valuation and search render from Postgres.

These read across every domain at once, which is why they come last among the read tickets: they exercise more of the schema than any single-area screen and are where a gap left by tickets 02 through 06 will surface.

To a user nothing changes, and this is the hardest place to guarantee it. Valuation figures, KPI aggregates and report totals are exactly the numbers a person notices when they shift. The Playwright assertions recorded in phase 1 are the check.

Aggregates should be computed by the database rather than by fetching rows and summing them in the application. This is the area where the difference is largest, and doing it in application code would make each dashboard load fetch a substantial fraction of the dataset.

Search currently runs against an in-memory structure. It becomes a database query here. Behaviour must match what the recorded assertions expect, including result ordering.

**Blocked by:** 03, 04, 05, 06 (all domain read tickets).

**Status:** ready-for-agent

- [ ] Dashboard, analytics, valuation, reports and search render from Postgres
- [ ] Aggregates are computed in the database, not by summing fetched rows in application code
- [ ] Search is a database query and preserves existing result ordering
- [ ] No repository function in these areas reads the generated dataset
- [ ] The Playwright suite passes unmodified, including exact figures on the dashboard and valuation screens
