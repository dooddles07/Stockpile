# 18: README and architecture documentation refresh

**What to build:** Documentation that describes the system as it now is. The README currently states that Stockpile "runs against a deterministic in-memory dataset rather than a database" and is "built as a front-end system" — both true when written and both false by the time this ticket starts.

This is a deliverable rather than housekeeping. Stockpile is showcased through its documentation, so the docs are part of what is being shown, and a README describing a system that no longer exists undermines the thing it is meant to demonstrate.

The README covers what changed: a real database, an event-sourced write path, and a working product rather than a navigable front end. The generated dataset keeps a mention, because it did not disappear — it became the seed, and the determinism it provides is what makes the tests and the demo reset work.

The architecture decisions are already written and do not need rewriting. What they need is to be findable: a reader arriving from a link should be able to reach the reasoning behind the design without knowing that a docs directory exists. The ADRs are the strongest artifact here and they are currently unlinked from anything a visitor will read.

Check the ADRs against what was actually built and correct any that drifted during implementation. A decision record that describes a design nobody followed is worse than none, and this is the moment to catch it while the work is fresh.

**Blocked by:** 10, 11, 12, 13, 14, 15, 16, 17 (all write flow tickets).

**Status:** resolved

- [x] The README no longer claims Stockpile runs without a database
- [x] The README describes the event-sourced write path and what a user can now do
- [x] The generated dataset is described in its current role as the seed
- [x] The architecture decision records are linked from the README
- [x] Every ADR is checked against what was built, and any that drifted is corrected
- [x] The glossary is checked for terms that changed meaning during implementation

## Comments

### 2026-08-31 — done

**README.** Intro now states the product runs on Postgres (Neon) end to end and
that the generated dataset is the seed, not a runtime store. New bullets under
"The parts worth looking at" cover the `applyStockChange` choke point (the seven
write flows, single-transaction lock/append/project, non-negative on-hand,
reconciliation) and post-commit in-process automation. The "Layout" block gains
`lib/db` and `lib/domain`, and re-describes `lib/repo` (reads) and `lib/data`
(seed source); the stale "swapping in a real database is one file per entity"
line is replaced by the read/write split and the ADR-0004/0005 rules. The "Data"
section drops "writes are not persisted" and describes persistence as event +
projection in one transaction. New "Architecture" section links `docs/adr/` and
`CONTEXT.md`. Stack line adds Drizzle + Neon Postgres + Playwright.

**ADR drift.** Two corrected:

- **0004** — added an amendment section. Authorization is built
  (roles/users as tables, runtime-editable matrix, `hydrateRoles`, actor-first
  domain functions with `can()`). Identity is not: no `next-auth`, no sessions
  table; `lib/auth/session.ts` holds the role in a cookie and
  `getCurrentUser()` returns a representative user. Recorded as the change
  needed before real sign-in.
- **0009** — added an amendment for the `lib/domain/*.checks.ts` tier
  (`npm run check:*`, `tsx` + `assert`, run in CI before Playwright) that
  closes the concurrency and reconciliation gaps this ADR had listed as open,
  plus past-the-UI enforcement checks. Noted `validate.test.ts` is gone,
  replaced by `e2e/import-validation.spec.ts`.

0001–0003, 0005–0008 verified against the code and left as written. 0010 is
deployment-only and unbuilt (no reset route or workflow yet) — not write-path
drift, left as written; README and the 0004 amendment phrase the demo reset as
planned, not live.

Two-axis code review (standards + spec) run afterwards. Fixes applied: 0009's
correction is now an appended `## Amendment` rather than a rewrite of the
original `## Consequences` (matches 0008's amendment style); 0004's opening
paragraph carries a bold "not built yet — see amendment" pointer so the
present-tense Auth.js claim can't mislead a scanning reader; the stale README
"five inventory tables" line under "Running it" now says "every table".

**Glossary.** `CONTEXT.md` reviewed term by term against the build — Event,
Projection, Actor, Stock Row's five balances, the nine movement types, and the
Automation Rule / Run entries (including "the one executable rule is hardcoded")
all match tickets 09–17. No term changed meaning; no edit needed.

`npm run typecheck` clean.
