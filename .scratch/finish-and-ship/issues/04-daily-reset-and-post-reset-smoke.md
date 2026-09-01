# 04: The daily reset, and a smoke test against the live instance

**What to build:** A scheduled workflow that truncates and re-seeds the production database once a day, then runs the Playwright smoke spec against the production URL to prove the instance came back up correctly.

ADR-0010 specified this as an authenticated HTTP endpoint called by a scheduled workflow, and required that endpoint to hold a secret, refuse ordinary sessions, and be treated as the single most dangerous route in the application. It does not need to exist. The workflow can run `npm run db:seed` directly against the production connection string, exactly as CI already does against the `ci` branch every push. That deletes a route, a secret comparison and the entire attack surface, and changes nothing else. **This amends ADR-0010** (see ticket 17); the reasoning in that ADR for truncate-and-reseed over a Neon branch reset or selective deletion is unaffected and stands.

The smoke run afterwards is the point of ADR-0009 applied to deployment. The reset is the one mechanism that destroys the demo silently — a seed that half-fails leaves the URL up and the data wrong, and nothing would report it. Because the seed is deterministic from a fixed generator seed, the recorded assertions in `e2e/smoke.spec.ts` hold against production exactly as they hold against `ci`. Only the smoke spec runs: the write specs would leave the demo in a state the reset did not produce.

**Blocked by:** 03 (migrations reach production with the deploy that needs them).

**Status:** open (one box outstanding: the manual run)

- [x] A scheduled workflow runs `npm run db:seed` against the production branch once a day
- [x] It can also be triggered manually (`workflow_dispatch`) for a reset on demand
- [x] Immediately after seeding, `e2e/smoke.spec.ts` runs against the production URL and the workflow fails if it fails
- [x] The write specs are not run against production
- [x] No HTTP reset endpoint is added, and ADR-0010 is amended to say why
- [ ] A manual run is performed and observed end to end before the ticket closes

## Comments

**2026-09-01** - Built. `.github/workflows/daily-reset.yml` runs on
`cron: "0 3 * * *"` and `workflow_dispatch`: `npm run db:migrate` then
`npm run db:seed` against `PRODUCTION_DATABASE_URL`, then `e2e/smoke.spec.ts`
against the live URL. No HTTP endpoint; the reasoning is amended into ADR-0010,
whose original body and consequence are left intact and superseded there
(ADR-0009's amendment convention).

The migrate step is for the manual case. Migrations otherwise reach production
only on push to `main` (ticket 03), and a `workflow_dispatch` run can come from
any ref, so the seed would otherwise load into whatever schema happened to be
live. It is a no-op on the scheduled run.

Both this job and `migrate-production` in `e2e.yml` now share the
`neon-production` concurrency group - the seed truncates the branch the
migration writes to, and a 03:00 cron can collide with a push.

`playwright.config.ts` takes a `PLAYWRIGHT_BASE_URL`: when set, `baseURL` points
at the deployed instance, no `webServer` is started, and the `write` project is
dropped from the config entirely. Keeping the write specs off production is a
property of the config, not of the workflow's argv, so no invocation against a
live URL can mutate the demo.

Verified: the smoke spec was run locally against
https://stockpile-peach.vercel.app with the final config - 18 passed, 0 failed -
which proves the recorded assertions hold against the deployed instance and that
the remote path (no dev server, read-only) works.

Outstanding, and blocking the last box: `PRODUCTION_DATABASE_URL` is still not
set as a repository secret (`gh secret list` shows only `DATABASE_URL`), carried
over from ticket 03. Until it is, the migrate and seed steps run with an empty
connection string and fail. Once it is set, dispatch the workflow manually and
watch it end to end - note that doing so truncates the live demo.
