# 10: Contract — delete the synchronous surface and seal the seam

**What to build:** The contract half of the expand–contract sequence, and the finish line for phase 1. Every caller has moved to the async surface, so the temporary synchronous functions are deleted and the generated dataset becomes reachable only from the repository layer.

A mechanical guard then keeps it that way: a lint rule, or an equivalent check wired into the build, fails on any import of the dataset module from outside the repository layer. Without a guard the seam decays the first time someone is in a hurry, and phase 2 depends on it holding. The dataset module exports exactly one symbol, which makes the rule simple to express and simple to check.

When this ticket is done, phase 1 is complete: the application still runs entirely on the generated dataset and behaves exactly as it did at the start, but one module reads it and every read path is asynchronous. Phase 2 replaces the repository function bodies with Drizzle queries against Neon Postgres, and the same baseline suite proves that swap preserved behavior too.

**Blocked by:** 03, 04, 05, 06, 07, 08, 09 (all migration tickets).

**Status:** ready-for-agent

- [ ] Every function temporarily suffixed with `Sync` in ticket 02 is deleted
- [ ] The repository layer is the only importer of the generated dataset
- [ ] A lint rule or equivalent build check fails on any import of the dataset module from outside the repository layer
- [ ] The guard is demonstrated to fail on a deliberately added violating import, which is then removed
- [ ] No visual, behavioral or UX change of any kind
- [ ] Typecheck and build pass
- [ ] The baseline suite from ticket 01 passes unmodified
