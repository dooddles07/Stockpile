# 01: Playwright harness and recorded baseline

**What to build:** A Playwright end-to-end suite that runs against Stockpile as it exists today and passes. It visits every top-level route group and asserts on what a user actually sees — specific figures, the first several rows of a table in their rendered order, record counts — rather than merely that a page loaded without error. Playwright starts the application itself, so the suite runs the same way locally and in CI with no separate setup step.

This suite is the recorded definition of correct behavior for the whole phase. Every later ticket is accepted by it still passing. Its value comes entirely from having been written against known-good behavior, so it must be green before any refactoring begins.

The dataset is generated once per process from a fixed seed, which is what makes exact-value assertions stable. That seed is a dependency of this suite and is documented as such: changing the generator invalidates the recorded assertions.

There is currently one test file covering import validation that cannot run, because no test runner is configured. Bring it under the new runner or delete it. Leaving an unrunnable test in the repository is not an acceptable outcome.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Playwright is installed and configured to start the application itself for both local and CI runs
- [ ] Every top-level route group is covered: dashboard, inventory, purchasing, sales, warehousing, analytics, admin, settings, approvals, tasks, notifications, import, and the operator screens
- [ ] Assertions are on rendered values, ordering and counts — a lost sort order or a promise rendering as an object fails the suite
- [ ] No assertion depends on repository function names, module structure, or anything else the refactor will deliberately change
- [ ] The suite passes against the current code, unmodified, before any other ticket starts
- [ ] The fixed dataset seed is documented as a dependency of the suite
- [ ] The existing import validation test either runs under the new runner or is deleted
