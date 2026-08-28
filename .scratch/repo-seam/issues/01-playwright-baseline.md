# 01: Playwright harness and recorded baseline

**What to build:** A Playwright end-to-end suite that runs against Stockpile as it exists today and passes. It visits every top-level route group and asserts on what a user actually sees — specific figures, the first several rows of a table in their rendered order, record counts — rather than merely that a page loaded without error. Playwright starts the application itself, so the suite runs the same way locally and in CI with no separate setup step.

This suite is the recorded definition of correct behavior for the whole phase. Every later ticket is accepted by it still passing. Its value comes entirely from having been written against known-good behavior, so it must be green before any refactoring begins.

The dataset is generated once per process from a fixed seed, which is what makes exact-value assertions stable. That seed is a dependency of this suite and is documented as such: changing the generator invalidates the recorded assertions.

There is currently one test file covering import validation that cannot run, because no test runner is configured. Bring it under the new runner or delete it. Leaving an unrunnable test in the repository is not an acceptable outcome.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] Playwright is installed and configured to start the application itself for both local and CI runs
- [x] Every top-level route group is covered: dashboard, inventory, purchasing, sales, warehousing, analytics, admin, settings, approvals, tasks, notifications, import, and the operator screens
- [x] Assertions are on rendered values, ordering and counts — a lost sort order or a promise rendering as an object fails the suite
- [x] No assertion depends on repository function names, module structure, or anything else the refactor will deliberately change
- [x] The suite passes against the current code, unmodified, before any other ticket starts
- [x] The fixed dataset seed is documented as a dependency of the suite
- [x] The existing import validation test either runs under the new runner or is deleted

## Comments

Implemented in `playwright.config.ts` and `e2e/`. 29 tests, all passing cold
(fresh `webServer` start, no pre-warmed dev server) as of commit `13e019d`.
`npx tsc --noEmit` and `npm run lint` both clean.

Review (`mattpocock-skills:code-review` against `0d867fa`, ticket as spec
source) found and this ticket's work then fixed:

- Row-order assertions checked only the first row of each table; expanded to
  the first four, in order, on every tabular test.
- `/operator/scan` (the fourth operator screen) had no coverage; added.
- The `/import` test only checked static copy; replaced with a real file
  upload of a dataset SKU (`BCL-DLP-111`), asserting the wizard reports it
  as an existing record — proves the page reads `db.products`.
- Surfaced a real infrastructure bug in the process: Playwright was bound to
  `127.0.0.1`, which trips Next 16's dev-origin guard and silently drops
  client JS, so pages loaded but never hydrated. Every other assertion
  happened to only need static SSR'd text, so this went unnoticed until a
  test needed a working `onChange` handler. Fixed by pointing the suite at
  `localhost` instead (commit `255b093`).
- Minor cleanup: deduplicated the repeated `main` locator into a fixture
  (`e2e/fixtures.ts`), named the magic port number.

Commits: `6dab743`, `d4a3412`, `e2c880d`, `255b093`, `13e019d`.
