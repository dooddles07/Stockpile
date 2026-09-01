# 03: Migrations reach production with the deploy that needs them

**What to build:** A CI step that runs `npm run db:migrate` against the production Neon branch on every push to `main`.

Migrations cannot run at build time. `next build` is required to succeed with no `DATABASE_URL` present — the `build` job in `.github/workflows/e2e.yml` exists to prove exactly that — so there is no build hook to hang them on. Running them by hand means that the first time one is forgotten, the demo runs new code against an old schema and every page 500s until someone notices.

CI already runs `db:migrate` against the `ci` branch on every push and every pull request. This is the same command with a different secret, gated to pushes on `main`, and ordered so the migration lands before the deploy that depends on it serves traffic. `drizzle-kit migrate` records which files it has applied, so re-running is a no-op and a re-deploy of unchanged code is harmless.

**Blocked by:** 02 (the Vercel project, and the first live URL).

**Status:** open

- [ ] A workflow job runs `npm run db:migrate` against the production branch on push to `main` only
- [ ] The production connection string is a repository secret, distinct from the `ci` one
- [ ] The job does not run on pull requests
- [ ] A no-op run (no new migration files) succeeds
- [ ] Ordering against the Vercel deploy is deliberate and documented in the workflow file
