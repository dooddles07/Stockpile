# 18: README and architecture documentation refresh

**What to build:** Documentation that describes the system as it now is. The README currently states that Stockpile "runs against a deterministic in-memory dataset rather than a database" and is "built as a front-end system" — both true when written and both false by the time this ticket starts.

This is a deliverable rather than housekeeping. Stockpile is showcased through its documentation, so the docs are part of what is being shown, and a README describing a system that no longer exists undermines the thing it is meant to demonstrate.

The README covers what changed: a real database, an event-sourced write path, and a working product rather than a navigable front end. The generated dataset keeps a mention, because it did not disappear — it became the seed, and the determinism it provides is what makes the tests and the demo reset work.

The architecture decisions are already written and do not need rewriting. What they need is to be findable: a reader arriving from a link should be able to reach the reasoning behind the design without knowing that a docs directory exists. The ADRs are the strongest artifact here and they are currently unlinked from anything a visitor will read.

Check the ADRs against what was actually built and correct any that drifted during implementation. A decision record that describes a design nobody followed is worse than none, and this is the moment to catch it while the work is fresh.

**Blocked by:** 10, 11, 12, 13, 14, 15, 16, 17 (all write flow tickets).

**Status:** ready-for-agent

- [ ] The README no longer claims Stockpile runs without a database
- [ ] The README describes the event-sourced write path and what a user can now do
- [ ] The generated dataset is described in its current role as the seed
- [ ] The architecture decision records are linked from the README
- [ ] Every ADR is checked against what was built, and any that drifted is corrected
- [ ] The glossary is checked for terms that changed meaning during implementation
