# 01: Database connection and CI harness

**What to build:** The infrastructure every later ticket depends on, proven to work before any data or screen depends on it. Drizzle is installed with migration tooling, a migration can be authored and applied, and the application can open a connection to Neon.

CI gains the harness the whole phase is verified through: a workflow that creates a Neon branch, applies migrations to it, points the application at it, runs the existing Playwright suite, and deletes the branch afterwards. At this point the suite still renders from the generated dataset and still passes — the harness is proven by provisioning and tearing down cleanly, not by the suite reading from Postgres yet.

Two constraints here are correctness requirements rather than preferences, and getting either wrong fails quietly rather than loudly.

The driver must support interactive transactions, because ADR-0006 locks a row and then writes within one transaction. The Neon HTTP driver is single-shot and cannot do this; use the WebSocket-pooled Neon driver or plain node-postgres. Choosing wrong will appear to work until concurrent writes corrupt stock.

The database client must be created lazily on first use, behind a plain function. Top-level module code is evaluated at build time, so a client constructed at import time crashes the build whenever the connection string is absent. Do not wrap the client in a proxy: libraries that inspect the client object break in ways that surface as hangs rather than errors.

This ticket is deliberately not user-visible. It was split out because the alternative — bundling it with the first screens — makes an infrastructure failure and a query failure indistinguishable.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Drizzle and migration tooling are installed and a migration can be authored and applied
- [ ] The driver in use supports interactive transactions; the HTTP driver is explicitly not used
- [ ] The database client initialises lazily on first use and is not wrapped in a proxy
- [ ] A production build succeeds with no connection string present
- [ ] CI creates a Neon branch, applies migrations, runs the Playwright suite, and deletes the branch
- [ ] The branch is deleted even when the suite fails
- [ ] The Playwright suite from phase 1 still passes, unchanged, against the generated dataset
