# Phase 1: Establish the repository seam

Status: ready-for-agent

## Problem Statement

Stockpile renders every screen from a single in-memory dataset generated once per process from a fixed seed. Seventy-seven files across pages and components import that dataset module directly and read its object graph inline, so there is no single place where data enters the application.

This blocks the move to a real database in three ways.

First, there is no seam to swap. Replacing the dataset with Neon Postgres means editing seventy-seven call sites at once, with no working build to check against until the last one is done.

Second, every read is synchronous. Repository functions are declared as `export function` and pages read fields off the dataset object directly. Database access is asynchronous, so the conversion touches every read path in the application — and doing that in the same change as the database swap means a runtime failure, not a type error, is the thing that tells you something is wrong.

Third, nothing proves behavior is preserved. There is no test runner configured, no Playwright setup, and one orphaned test file that cannot run. Any refactor of this size is currently unverifiable.

## Solution

Split the database migration into two phases and do only the first here. Phase 1 introduces no database, adds no dependency on Neon, and changes no behavior a user can observe.

Establish the repository layer as the sole boundary through which application code reads data, and make that boundary asynchronous. When phase 1 is complete, the generated dataset is still the only source of data and the application behaves identically, but exactly one module imports it and every function that reads it returns a promise.

Because the change must be provably behavior-preserving, a Playwright smoke suite is written first, against the current application, and must pass unchanged afterwards. It is the acceptance criterion for the phase, not an afterthought.

Phase 2, specified separately, then replaces the repository function bodies with Drizzle queries against Neon Postgres. The signatures are already correct by then, and the same Playwright suite proves that swap preserved behavior too.

## User Stories

1. As a developer, I want exactly one module to import the generated dataset, so that replacing it with a database is a change to one file rather than seventy-seven.
2. As a developer, I want every repository function to be asynchronous before any database exists, so that the async conversion and the database swap fail independently rather than together.
3. As a developer, I want the async conversion to happen while the application still works, so that a mistake surfaces as a type error at build time rather than a runtime error in production.
4. As a developer, I want a Playwright smoke suite that passes before the refactor begins, so that I have a recorded definition of correct behavior rather than an opinion about it.
5. As a developer, I want that same suite to pass after the refactor, so that "no behavior changed" is a demonstrated fact rather than a claim.
6. As a developer, I want the smoke suite to survive into phase 2 unchanged, so that the database swap is verified by the same evidence and I do not write acceptance tests twice.
7. As a developer, I want the application to build and typecheck at every commit in this phase, so that I can stop and resume the work without leaving the repository broken.
8. As a developer, I want repository functions to be named and grouped by the domain concepts in the glossary, so that a reader can find the function that answers a question without knowing the dataset's internal shape.
9. As a developer, I want repository function signatures to take and return the domain types the application already declares, so that phase 2 changes only the bodies.
10. As a developer, I want pages to receive fully formed values from the repository layer, so that data shaping lives in one place instead of being re-derived per page.
11. As a developer, I want no page or component to reach into the dataset object graph, so that no screen can silently depend on a structure the database will not have.
12. As a developer, I want a lint rule or equivalent guard preventing new direct imports of the dataset module, so that the seam does not erode the first time someone is in a hurry.
13. As a developer, I want derived values such as stock health and availability computed inside the repository layer, so that two screens cannot disagree about the same number.
14. As a developer, I want repository functions that serve a single screen to be shaped for that screen, so that phase 2 can implement each as one query rather than several round trips.
15. As a developer, I want the Playwright suite to cover every top-level route group, so that a regression confined to one area of the application cannot pass unnoticed.
16. As a developer, I want the smoke suite to assert on rendered values and not only on pages loading, so that a lost sort order or an unresolved promise rendering as an object fails the suite.
17. As a developer, I want the fixed dataset seed documented as a test dependency, so that a future change to the generator is understood to invalidate the recorded assertions.
18. As a developer, I want Playwright configured to start the application itself, so that the suite runs the same way locally and in CI without a separate setup step.
19. As a developer, I want the orphaned validation test either running under the new runner or deleted, so that the repository contains no test that cannot be executed.
20. As a maintainer, I want this phase to add no vendor dependency, so that it can be completed and reviewed before any decision about Neon is acted on.
21. As a maintainer, I want the phase to be reviewable as a mechanical change, so that a reviewer can check it without re-deciding the architecture.
22. As a warehouse operator, I want every screen to show exactly what it showed before, so that a refactor I did not ask for does not change how my job works.
23. As a warehouse operator, I want stock figures on the dashboard, the stock table and a product's own page to keep agreeing with each other, so that I do not have to guess which screen is right.
24. As an inventory manager, I want reports and analytics to keep producing the same figures, so that numbers I have already acted on do not change underneath me.
25. As an administrator, I want role-based visibility to behave exactly as before, so that a refactor does not widen what anyone can see.
26. As a developer, I want permission checks left untouched in this phase, so that the change to enforce authorization in domain functions is reviewed on its own merits rather than buried in a refactor.

## Implementation Decisions

**No database in this phase.** No Neon project, no Drizzle schema, no connection string, no migration. The generated dataset remains the only source of data throughout. Anything requiring a database belongs to phase 2.

**The repository layer is the only importer of the dataset module.** After this phase, `lib/data/store` is imported by the repository modules and by nothing else. All other importers are converted to repository calls.

**Every repository function becomes asynchronous.** Functions that read data return promises, and callers await them. Pure computation that takes no dataset input — formatting, comparison, sorting predicates, health classification given explicit arguments — stays synchronous, since making it async would be noise that phase 2 does not need.

**Signatures use existing domain types.** Repository functions accept and return the types the application already declares. Phase 2 replaces bodies only. Where a function currently returns a slice of the dataset object graph, it is reshaped now to return a domain type instead, because that reshaping is the part phase 2 cannot do cheaply.

**Repository functions are screen-shaped where a screen needs it.** A function serving one screen returns everything that screen needs in one call, rather than the screen making several calls and joining the results. This is deliberate: in phase 2 each such function becomes a single query, and a screen that makes five repository calls becomes a screen that makes five round trips to Postgres.

**Derived values are computed in the repository layer.** Availability, stock health, and similar derivations move behind the seam so that two screens cannot compute the same number differently.

**The seam is guarded.** A lint rule, or an equivalent mechanical check, fails the build if a module outside the repository layer imports the dataset module. Without a guard the seam decays, and phase 2 depends on it holding.

**Permissions, authorization and roles are not touched.** Existing `can(role, module, action)` calls remain exactly as they are, including the fact that they are rendering gates rather than enforcement. Moving authorization into domain functions is a separate change under ADR-0004 and must not be entangled with this one.

**No server actions, no mutations, no domain layer.** The application remains read-only in this phase. ADR-0005 governs the write path and applies to later work.

**The change proceeds module by module, building at every step.** Convert one repository module and its callers, confirm the build and typecheck pass, commit, repeat. There is no point at which the repository is left un-buildable.

## Testing Decisions

**What makes a good test here.** The suite tests external behavior only: what a user of the application can see on a page. It asserts on rendered text, table contents, ordering and counts. It does not assert on repository function signatures, module structure, call counts, or anything else the refactor is deliberately changing — a test that fails because the code was restructured correctly is worse than no test, because it trains people to update tests until they pass.

**One seam: Playwright against rendered routes.** This is the highest available seam and matches ADR-0009. Testing at the repository module boundary was considered and rejected: it would mean writing tests for fifty-six function bodies that phase 2 replaces wholesale, and it introduces a second seam for no additional coverage of user-visible behavior.

**The suite is written first and must pass before the refactor starts.** Its value comes entirely from having been recorded against known-good behavior. A suite written afterwards documents whatever the refactor produced, including its bugs.

**Coverage.** Every top-level route group is visited: dashboard, inventory, purchasing, sales, warehousing, analytics, admin, settings, approvals, tasks, notifications, import, and the operator screens. For each, the suite asserts on concrete rendered values — a specific stock figure, the first several rows of a table in order, a record count — not merely that the page returned without error. An unresolved promise rendering as an object, or a lost sort order, must fail the suite.

**Determinism.** The dataset is generated once per process from a fixed seed, which is what makes exact-value assertions viable. That seed is a dependency of the suite: changing the generator invalidates the recorded assertions, and this is documented alongside the tests.

**Configuration.** Playwright starts the application itself via its web server configuration, so the suite runs identically locally and in CI with no separate setup step.

**Prior art.** There is none — no test runner is configured and no Playwright setup exists. The single existing test file covers import validation and cannot currently run. It is either brought under the new runner or deleted; leaving an unrunnable test in the repository is not an option.

**Phase 2 reuses this suite unchanged.** If the Drizzle swap preserves behavior, the same assertions pass against Postgres. That reuse is a reason to keep the assertions strictly about user-visible output.

## Out of Scope

- Any database work: Neon provisioning, Drizzle schema, migrations, connection handling, seeding Postgres from the generated dataset.
- Event sourcing. No events table, no projections, no append path. ADR-0002 and ADR-0003 apply to later phases.
- Mutations of any kind: server actions, domain functions, transactions, `SELECT ... FOR UPDATE` locking.
- Authentication and authorization changes. Auth.js is not introduced, and permission checks are not moved out of the rendering layer.
- Automation rule execution and the modelling of its trigger, condition and action vocabulary.
- File attachments and Vercel Blob.
- Deployment, hosting, and the unresolved Vercel Hobby commercial-use question in ADR-0007.
- Visual or UX changes of any kind. A screen that looks wrong today looks equally wrong afterwards.
- Performance optimization. Extra work caused by the seam is acceptable here; phase 2 changes the cost model entirely.

## Further Notes

The application currently has no write path at all — no server actions exist anywhere. That is why this phase is safe to do as a pure refactor: there is no mutation logic to accidentally reorder.

The dataset module exports exactly one symbol, which makes the guard against direct imports simple to express and simple to check.

The largest risk in this phase is a partially-applied async conversion: a caller that forgets to await, rendering a pending promise where a number belongs. TypeScript catches most of these, and the Playwright assertions on rendered values are specifically there to catch the rest — which is why assertions must be on values and not on page loads.

The second risk is scope creep. Every screen this work touches will reveal something worth improving. Those observations belong in separate tickets. A phase whose whole value is "provably nothing changed" loses that value the moment something changes.

Roles are currently a hardcoded array while the UI implies they are editable at runtime. This contradiction is real and is recorded in ADR-0004, but resolving it requires a database and belongs to a later phase.
