# 01: Database connection and CI harness

**What to build:** The infrastructure every later ticket depends on, proven to work before any data or screen depends on it. Drizzle is installed with migration tooling, a migration can be authored and applied, and the application can open a connection to Neon.

CI gains the harness the whole phase is verified through: a workflow that creates a Neon branch, applies migrations to it, points the application at it, runs the existing Playwright suite, and deletes the branch afterwards. At this point the suite still renders from the generated dataset and still passes — the harness is proven by provisioning and tearing down cleanly, not by the suite reading from Postgres yet.

Two constraints here are correctness requirements rather than preferences, and getting either wrong fails quietly rather than loudly.

The driver must support interactive transactions, because ADR-0006 locks a row and then writes within one transaction. The Neon HTTP driver is single-shot and cannot do this; use the WebSocket-pooled Neon driver or plain node-postgres. Choosing wrong will appear to work until concurrent writes corrupt stock.

The database client must be created lazily on first use, behind a plain function. Top-level module code is evaluated at build time, so a client constructed at import time crashes the build whenever the connection string is absent. Do not wrap the client in a proxy: libraries that inspect the client object break in ways that surface as hangs rather than errors.

This ticket is deliberately not user-visible. It was split out because the alternative — bundling it with the first screens — makes an infrastructure failure and a query failure indistinguishable.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] Drizzle and migration tooling are installed and a migration can be authored and applied
- [x] The driver in use supports interactive transactions; the HTTP driver is explicitly not used
- [x] The database client initialises lazily on first use and is not wrapped in a proxy
- [x] A production build succeeds with no connection string present
- [x] CI applies migrations, seeds, and runs the Playwright suite against a dedicated Neon branch — see the 2026-08-29 update below: branch-per-run was replaced with a persistent `ci` branch
- [x] ~~The branch is deleted even when the suite fails~~ — no longer applicable; the `ci` branch is persistent (2026-08-29 update)
- [x] The Playwright suite from phase 1 still passes, unchanged, against the generated dataset

## Comments

`drizzle-orm` + `drizzle-kit` installed alongside `@neondatabase/serverless`
and `ws`. `npm run db:generate` authors migrations from `lib/db/schema.ts`;
`npm run db:migrate` applies them. `drizzle/0000_init.sql` is the first,
authored offline and committed — one table, the append-only `events` stream
from ADR-0003, which later tickets build around rather than reshape.

`lib/db/client.ts` exports `getDb()`: `drizzle-orm/neon-serverless` over a
WebSocket `Pool`, never `neon-http` (ADR-0003/0006 need interactive
transactions). The `Pool` is constructed on first call behind a plain
`let db` module variable — no top-level construction, no proxy. It throws
`"DATABASE_URL is not set"` when the variable is absent rather than at
import. Nothing imports it yet, so `next build` with no connection string
present succeeds; a dedicated CI `build` job keeps that true.

`.github/workflows/e2e.yml`: the `playwright` job creates a Neon branch
(`neondatabase/create-branch-action@v6`), applies migrations to it,
runs the unchanged Playwright suite, and deletes the branch in an
`if: always()` step (`delete-branch-action@v3`, `branch:` accepts the id).
The suite still renders from the generated dataset — the harness is proven
by clean provision and teardown, not by the suite reading Postgres yet. All
29 phase-1 tests pass unmodified.

### Update (2026-08-29) — branch-per-run replaced

The branch-per-run harness never ran green on GitHub: `create-branch-action`
needs a `NEON_API_KEY` secret that was never set, so every run failed at
"Create Neon branch" (`Input required and not supplied: api_key`) and again
in teardown on the empty branch id.

`e2e.yml` now drops both Neon actions. The `playwright` job runs
`db:migrate`, `db:seed` and the suite against a dedicated, persistent Neon
branch named `ci` on the same project, kept separate from `main` so the
seed's truncate never touches the demo data (ADR-0010). It needs one secret,
`DATABASE_URL` — the `ci` branch's pooled connection string — and nothing
else. `db:migrate` is idempotent (drizzle records applied files) and
`db:seed` truncates and reloads, so a long-lived branch still gives every
run the same known-good state. A `concurrency` group serializes the job
because the branch is shared.

Green as of run 33226015699: `build` + `playwright` both pass, 29 tests
against the seeded `ci` branch.
