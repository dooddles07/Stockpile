# 03: Migrations reach production with the deploy that needs them

**What to build:** A CI step that runs `npm run db:migrate` against the production Neon branch on every push to `main`.

Migrations cannot run at build time. `next build` is required to succeed with no `DATABASE_URL` present — the `build` job in `.github/workflows/e2e.yml` exists to prove exactly that — so there is no build hook to hang them on. Running them by hand means that the first time one is forgotten, the demo runs new code against an old schema and every page 500s until someone notices.

CI already runs `db:migrate` against the `ci` branch on every push and every pull request. This is the same command with a different secret, gated to pushes on `main`, and ordered so the migration lands before the deploy that depends on it serves traffic. `drizzle-kit migrate` records which files it has applied, so re-running is a no-op and a re-deploy of unchanged code is harmless.

**Blocked by:** 02 (the Vercel project, and the first live URL).

**Status:** resolved

- [x] A workflow job runs `npm run db:migrate` against the production branch on push to `main` only
- [x] The production connection string is a repository secret, distinct from the `ci` one
- [x] The job does not run on pull requests
- [x] A no-op run (no new migration files) succeeds
- [x] Ordering against the Vercel deploy is deliberate and documented in the workflow file

## Comments

**2026-09-01** - Done. A `migrate-production` job in `.github/workflows/e2e.yml`
runs `npm run db:migrate` against the primary Neon branch, gated by
`if: github.event_name == 'push' && github.ref == 'refs/heads/main'` so pull
requests never see it or the secret.

The job has no `needs:`. Vercel's git integration starts building the moment the
push lands and nothing in this workflow can gate it, so the migration starts in
the same instant and finishes well before the new code serves a request. Waiting
on `build` or `playwright` would invert that ordering and let the deploy go live
against the old schema. The reasoning is written into the workflow file above the
job, along with the trade: a push whose tests then fail has still migrated
production, acceptable while migrations are additive.

A `migrate-neon-production` concurrency group keeps two pushes from migrating at
once. A no-op run is free - drizzle-kit records which files it has applied.

Outstanding, and not settable from here: `PRODUCTION_DATABASE_URL` must be added
as a repository secret holding the primary Neon branch's pooled connection
string. Until it is, the job runs with an empty `DATABASE_URL` and fails. The
README's branch table now names it.
