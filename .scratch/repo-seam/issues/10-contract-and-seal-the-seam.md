# 10: Contract — delete the synchronous surface and seal the seam

**What to build:** The contract half of the expand–contract sequence, and the finish line for phase 1. Every caller has moved to the async surface, so the temporary synchronous functions are deleted and the generated dataset becomes reachable only from the repository layer.

A mechanical guard then keeps it that way: a lint rule, or an equivalent check wired into the build, fails on any import of the dataset module from outside the repository layer. Without a guard the seam decays the first time someone is in a hurry, and phase 2 depends on it holding. The dataset module exports exactly one symbol, which makes the rule simple to express and simple to check.

When this ticket is done, phase 1 is complete: the application still runs entirely on the generated dataset and behaves exactly as it did at the start, but one module reads it and every read path is asynchronous. Phase 2 replaces the repository function bodies with Drizzle queries against Neon Postgres, and the same baseline suite proves that swap preserved behavior too.

**Blocked by:** 03, 04, 05, 06, 07, 08, 09 (all migration tickets).

**Status:** resolved

- [x] Every function temporarily suffixed with `Sync` in ticket 02 is deleted
- [x] The repository layer is the only importer of the generated dataset
- [x] A lint rule or equivalent build check fails on any import of the dataset module from outside the repository layer
- [x] The guard is demonstrated to fail on a deliberately added violating import, which is then removed
- [x] No visual, behavioral or UX change of any kind
- [x] Typecheck and build pass
- [x] The baseline suite from ticket 01 passes unmodified

## Comments

Every `*Sync` repository function from ticket 02 is deleted; the clean async
name now carries the body. Cross-module synchronous helpers that
`inventory.ts` used to export (`productByIdSync` and the other seven id maps,
`summaryForSync`) are now private module-local (`productByIdMap`,
`summaryOf`), used only inside repository bodies that phase 2 replaces
wholesale. `analytics.ts`, `metrics.ts`, `returns.ts` and `search.ts` rebuild
the small id/summary indexes they need from `db` at module scope — the
pattern `inventory.ts` already used. `lib/auth/session.ts` no longer imports
`lib/data/store`; `getCurrentUser` awaits `users()` from the repository
layer, with the role-selection logic byte-for-byte unchanged (ADR-0004
untouched). `app/api/search/route.ts` and the report `[slug]` page await
their now-async repository calls; `ReportDefinition.run` returns a promise and
`summary` may.

The seam is guarded by `no-restricted-imports` in `eslint.config.mjs`, banning
any import matching `**/lib/data/store` (and the bare `./data/store` a `lib/`
sibling could write), switched off for `lib/repo/**`. Demonstrated: a
temporary `import { db } from "@/lib/data/store"` added to `lib/format.ts`
fails `eslint` with exit 1; removed, the run is clean. Relative-path and
`.ts`-suffixed variants were checked the same way.

`npx tsc --noEmit`, `npx eslint .` (0 errors), `npm run build` and
`npx playwright test` (29/29, the ticket 01 baseline, `e2e/` and
`playwright.config.ts` unmodified) all pass. Phase 1 is complete.

Review (`mattpocock-skills:code-review` against `391212e`) ran Standards and
Spec in parallel. Neither found a hard violation or an incorrect
implementation. Both independently flagged the guard as initially too narrow
(exact-specifier match only); broadened to a pattern group before commit.
Both also noted the seven module-scope index maps now re-derived across
`analytics`/`metrics`/`returns` as Duplicated Code — a judgement call left as
-is, matching the repo's existing style and the spec's allowance that "extra
work caused by the seam is acceptable here".
