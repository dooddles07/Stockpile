# 01: A Neon `dev` branch, and one purpose per environment

**What to build:** Three Neon branches with no overlap in what writes to them, and a documented convention for which connection string belongs where.

Today `.env` points local development at the primary branch of the `stockpile` Neon project — the same branch that is about to become the public demo. `npm run db:seed` truncates every table. The first time that command is run locally after the deploy exists, it wipes what a visitor is looking at. CI already got this right: it uses a dedicated persistent `ci` branch precisely so its truncate never reaches the demo data, and says so in a comment in `.github/workflows/e2e.yml`. Local development needs the same treatment.

Create a `dev` branch off primary, repoint the local `.env` at it, and record the convention somewhere a future reader will find it — primary is the demo and is written only by production and the daily reset workflow, `ci` is truncated by every CI run, `dev` is the developer's. No branch serves two purposes.

This ticket is first because every ticket after it runs `db:seed` locally.

**Blocked by:** nothing.

**Status:** blocked

- [x] A `dev` branch exists in the `stockpile` Neon project
- [ ] Local `.env` points at the `dev` branch's pooled connection string
- [ ] `npm run db:migrate && npm run db:seed` against `dev` succeeds and the app runs against it
- [x] The branch convention is documented in the README
- [ ] The full Playwright suite passes locally against `dev`

## Comments

**2026-09-01** — Blocked on the Neon account's data transfer quota, not on
anything in the repo.

The `dev` branch was created off primary (`br-noisy-lake-ax6ajth6`), but only
with `no_compute: true`. Creating its read-write endpoint fails, and so does
every query against any branch including primary:

    data transfer quota exceeded; usage:"6066057328", limit:"5500000000"
    HTTP 402: Your project has exceeded the data transfer quota.

So `dev` has no connection string yet, `.env` cannot be repointed, and neither
`db:migrate`/`db:seed` nor the Playwright suite can run against it. This blocks
every later ticket that seeds locally, and the demo itself is down while the
quota is exceeded.

Done in the meantime: the branch convention (primary = demo, `ci` = truncated
by CI, `dev` = local) is documented in the README under "Which Neon branch to
point at".

To unblock: wait for the quota to reset at the start of the next billing period
or upgrade the Neon plan, then create the pooled read-write endpoint on `dev`,
put that string in `.env`, and run `db:migrate && db:seed` plus the Playwright
suite to tick the remaining three boxes.
