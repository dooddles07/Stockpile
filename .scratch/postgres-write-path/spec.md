# Phase 2: Postgres reads and the event-sourced write path

Status: ready-for-agent

## Problem Statement

After phase 1, Stockpile has a clean asynchronous repository seam and a Playwright suite that defines correct behavior — but it is still a read-only application rendering a dataset generated in memory from a fixed seed. Nothing can be created, changed or recorded. Restarting the process restores the world exactly as it was.

For an inventory management platform that is the whole product. A warehouse operator cannot receive a delivery, ship an order, correct a miscount or transfer stock between sites. Every screen that offers an action is a screen that cannot perform it. The permission engine gates write actions that do not exist. The movement ledger displays movements no one made.

Three specific things are missing.

There is no persistence. Reference data — Products, Categories, Warehouses, Locations, Suppliers, Customers, Roles, settings — lives only in a generated object graph, so a Product cannot be added and a Supplier's terms cannot be corrected.

There is no write path. No server action, domain function, transaction or event append exists anywhere in the codebase. The application has never written anything.

There is no record of what happened. ADR-0002 decided that Stock and Documents are event-sourced precisely so that a stock correction or a twice-cancelled Purchase Order can be explained later. Today there is nothing to explain from.

## Solution

Move Stockpile onto Neon Postgres and give it a working write path, in that order, behind the seam phase 1 established.

Reads move first. A Drizzle schema describes reference data, the projection tables, and the event stream. A seed script loads the generated dataset into Postgres. Repository function bodies are replaced with queries. Their signatures do not change, because phase 1 already made them correct. To a user nothing changes at all, and the phase 1 Playwright suite proves it — now running against a freshly seeded Neon branch instead of an in-memory object.

Writes come second. Every mutation is a domain function that takes the acting user, checks permission, opens a transaction, locks the affected Stock Row, appends the Event, updates the projection, and commits. Server actions validate input and call those functions, and hold no logic of their own. When the transaction commits, matching Automation Rules are evaluated in the same request.

At the end of this phase a warehouse operator can receive a Purchase Order and watch on-hand rise, ship a Sales Order and watch reserved fall, correct a Stock Count and see the correction appear in the movement ledger with their name on it — and every one of those changes is an immutable Event the ledger can be rebuilt from.

## User Stories

### Persistence and reads

1. As a warehouse operator, I want the data I see to survive a restart, so that the system is a record rather than a demonstration.
2. As a warehouse operator, I want every screen to show exactly what it showed before the database existed, so that a migration I did not ask for does not change how my job works.
3. As a developer, I want the repository function signatures to be unchanged from phase 1, so that only the bodies move and the change stays reviewable.
4. As a developer, I want a schema that describes reference data, projections and the event stream, so that the shape of the system is stated in one place rather than inferred from a generator.
5. As a developer, I want a seed script that loads the generated dataset into Postgres, so that a fresh database reaches a known-good state in one command.
6. As a developer, I want the seed to be deterministic from the existing fixed seed, so that the Playwright assertions recorded in phase 1 stay valid.
7. As a developer, I want the seed script to be re-runnable against a populated database, so that the daily demo reset in ADR-0010 has no separate mechanism to maintain.
8. As a developer, I want migrations under version control, so that a schema change is applied the same way everywhere and can be reviewed.
9. As a developer, I want a screen's data to arrive in as few queries as the repository function allows, so that the screen-shaped functions from phase 1 pay off rather than becoming several round trips.
10. As a developer, I want the database connection to tolerate the free tier autosuspending, so that the first request after idle succeeds rather than errors.

### The write path

11. As a warehouse operator, I want to receive stock against a Purchase Order, so that what physically arrived is reflected in on-hand.
12. As a warehouse operator, I want to ship a Sales Order, so that stock leaves the system when it leaves the building.
13. As a warehouse operator, I want to transfer stock between Warehouses, so that the in-transit balance reflects goods that have left but not arrived.
14. As a warehouse operator, I want to record an Adjustment with a reason, so that a discrepancy is explained rather than silently corrected.
15. As a warehouse operator, I want to complete a Stock Count and have the correction applied, so that the system agrees with the shelf.
16. As a warehouse operator, I want to record damaged goods, so that unsellable stock stops being counted as available.
17. As a warehouse operator, I want to process a Return in either direction, so that goods coming back are accounted for.
18. As an inventory manager, I want to create and edit reference data — Products, Categories, Suppliers, Customers, Warehouses, Locations — so that the system reflects the business as it changes.
19. As an inventory manager, I want every quantity change to produce a Movement with a reason, so that no number changes without an explanation.
20. As an inventory manager, I want the reserved balance to reflect open Sales Orders, so that stock promised to a customer is not sold twice.
21. As an inventory manager, I want the incoming balance to reflect open Purchase Orders, so that I do not reorder something already on its way.
22. As an auditor, I want every change attributed to the Actor who made it, so that the audit trail names a person rather than a system.
23. As an auditor, I want the Event stream to be immutable, so that history cannot be rewritten to hide a mistake.
24. As an auditor, I want to see why a Document reached its current state, so that questions like "why was this Purchase Order cancelled twice" have answers.

### Correctness

25. As an inventory manager, I want two operators shipping the same Product at the same moment to produce a correct final balance, so that concurrent work does not corrupt stock.
26. As an inventory manager, I want a failure partway through a change to leave no trace, so that a half-applied receipt cannot exist.
27. As an inventory manager, I want the projected on-hand to always equal the sum of the replayed Movements, so that the ledger and the balance cannot drift apart.
28. As a developer, I want the Event append and the projection update to commit together, so that a projection can never disagree with the stream it is built from.
29. As a developer, I want projections to be rebuildable by replaying the Event stream, so that a projection bug is recoverable rather than terminal.
30. As a developer, I want a database driver that supports interactive transactions, so that the locking strategy in ADR-0006 actually works rather than silently degrading.
31. As an inventory manager, I want a change that would drive on-hand below zero to be rejected, so that the system cannot record physically impossible stock.

### Authorization and structure

32. As an administrator, I want permission enforced when a change is attempted, not only when a button is drawn, so that hiding a control is not the only thing standing between a user and the data.
33. As an administrator, I want a user without permission to be refused even if they reach the action directly, so that authorization does not depend on the UI.
34. As a developer, I want every domain function to take the acting user explicitly, so that no code path can perform a change on nobody's authority.
35. As a developer, I want automation to act as a named system Actor, so that changes it makes are attributable rather than anonymous.
36. As a developer, I want server actions to contain no logic beyond validation and delegation, so that a future REST layer is a thin wrapper rather than a rewrite.
37. As a developer, I want input validated at the boundary before it reaches a domain function, so that invalid data is rejected in one known place.

### Automation

38. As an inventory manager, I want a low-stock rule to fire the moment stock crosses its reorder point, so that I learn about it immediately rather than the next day.
39. As a developer, I want Automation Rules evaluated after the transaction commits, so that a rule cannot act on a change that was rolled back.
40. As a developer, I want a failing rule not to fail the operation that triggered it, so that a broken alert does not stop a shipment.

### Verification

41. As a developer, I want the phase 1 Playwright suite to pass unchanged after the read swap, so that the migration is proven not to have changed behavior.
42. As a developer, I want new end-to-end coverage of each write flow, so that the parts of the product that did not exist before are verified too.
43. As a developer, I want tests to run against a freshly seeded Neon branch, so that CI exercises the same database the deployment uses.
44. As a developer, I want each test run to start from identical data, so that exact-value assertions stay stable.
45. As a developer, I want the seed script exercised on every CI run, so that the mechanism the daily demo reset depends on cannot rot unnoticed.
46. As a developer, I want concurrent writes to the same stock covered by a test, so that the riskiest decision in the design is not the one thing nothing checks.
47. As a developer, I want the reconciliation invariant asserted somewhere runnable, so that drift is detected by a test rather than by a discrepancy report.

## Implementation Decisions

**The phase order is fixed: reads first, then writes.** The read swap is behavior-preserving and verified by an existing suite. The write path is new behavior verified by new tests. Doing them together means a failure has two possible causes; doing them in sequence means it has one. The read swap must be complete and green before any write work begins.

**Schema covers three kinds of table.** Reference data tables hold Products, Categories, Warehouses, Locations, Suppliers, Customers, Users, Roles and settings as ordinary mutable rows, per ADR-0002. Projection tables hold Stock Rows and Document states. One append-only event table holds the Event stream. Reference data gets real foreign keys; this is a benefit of ADR-0003's single-database decision and should be used.

**No tenant column anywhere**, per ADR-0001.

**The driver must support interactive transactions.** The Neon HTTP driver is single-shot and cannot run a transaction spanning a locking read and subsequent writes. Use the WebSocket-pooled Neon driver or plain node-postgres. This is a correctness requirement, not a preference — ADR-0006 depends on it, and choosing wrong degrades silently rather than failing loudly.

**Database client initialisation must be lazy.** Top-level module code is evaluated at build time, so a client constructed at import time crashes the build when the connection string is absent. Initialise on first use behind a plain function. Do not wrap the client in a proxy: libraries that inspect the client object break in ways that manifest as hangs rather than errors.

**The seed script is a first-class artifact, not a one-off.** It loads the generated dataset into Postgres, is deterministic from the existing fixed generator seed, and is safe to re-run against a populated database by truncating first. ADR-0010's daily demo reset is this script called again, and CI runs it every time. It is not throwaway migration code.

**One choke-point owns every stock change.** A single function appends the Event and updates the projection inside one transaction, and it is the only code permitted to do either. Every operation that moves quantity — receipt, shipment, transfer, adjustment, count correction, damage, return — routes through it. This is what makes ADR-0006's guarantee hold: a lock taken in one place cannot be forgotten in another.

**The write sequence is fixed.** Within the transaction: check permission, lock the affected Stock Row for update, read the current balance, append the Event, update the projection, commit. The lock precedes the read; reading before locking reintroduces the race the lock exists to prevent.

**Balances have two sources and they must not be confused.** On-hand and damaged are projected from the Event stream. Reserved, incoming and in-transit are projected from open Document state, because no Movement type produces them. A reconciliation check may compare on-hand against replayed Events; applying that check to the other three is a bug.

**Non-negative on-hand is enforced in the choke point**, inside the transaction, as a rejected operation rather than a recorded negative.

**Domain functions take the Actor first and check permission before anything else**, per ADR-0004. Automation passes a designated system Actor. The existing permission checks in pages and components remain, but only as rendering gates; no mutation relies on them.

**Roles become database rows.** The hardcoded role array contradicts the runtime permission editor, and this phase is where that is resolved.

**Server actions validate with zod and delegate**, per ADR-0005. An action that looks like a pass-through is correct and should stay that way.

**Automation runs after commit, in the same request**, per ADR-0008. A rule must never run inside the transaction, or it will act on changes that may roll back. A failing rule is recorded as a failed run and does not fail the triggering operation.

**Documents advance through explicit states.** Each Document type's state machine is stated in the schema and enforced in its domain functions rather than left implicit in UI conditionals.

## Testing Decisions

**What makes a good test here.** Tests assert on what a user can see and do: a receipt raises on-hand by the received quantity, a shipment lowers it, a user without permission is refused. They do not assert on schema shape, function names, query counts, or how many events a transaction wrote. The single exception is the reconciliation invariant, which is deliberately about internal consistency and is the one thing worth asserting below the UI — because it is exactly the failure ADR-0006 is guarding against and it is invisible from the outside until it is expensive.

**The primary seam is unchanged from phase 1: Playwright against rendered routes.** This is deliberate. The read swap needs no new tests at all — the value of the phase 1 suite is that it was recorded before any of this existed. New end-to-end flows are added only for behavior that did not previously exist, which is every write.

**Write flows to cover end to end.** Receive against a Purchase Order and confirm on-hand rose. Ship a Sales Order and confirm reserved and on-hand moved correctly. Transfer between Warehouses and confirm in-transit behaves across both ends. Record an Adjustment with a reason and find it in the movement ledger. Complete a Stock Count and confirm the correction applied. Attempt a write as a user whose Role forbids it and confirm refusal. Attempt a change that would drive on-hand negative and confirm rejection.

**Tests run against a freshly seeded Neon branch.** CI creates a branch, runs the seed, points the application at it, runs the suite, and deletes the branch. This tests against the same database the deployment uses, so no dialect or pooling gap hides until production, and it exercises the seed script on every run — the mechanism ADR-0010's daily reset depends on.

**Determinism comes from the seed.** Every run starts from identical data, which is what makes exact-value assertions possible. A change to the generator invalidates recorded assertions in both suites.

**Two checks that Playwright cannot provide, and are required anyway.** ADR-0009 recorded end-to-end tests as the strategy and named this gap explicitly. Concurrency needs a test that issues two simultaneous operations against the same Product and Location and asserts the final balance is correct — a browser cannot express this, and it verifies the single riskiest decision in the design. Reconciliation needs a check that replays the Event stream and asserts the sum equals the projected on-hand. Both are narrow, both live below the UI, and both exist because the alternative is discovering the failure as a stock discrepancy in production.

**Prior art.** The phase 1 Playwright suite is the model for the new flows: same configuration, same style of assertion on rendered values, same avoidance of implementation detail.

## Out of Scope

- **Auth.js and real login.** The acting user continues to come from the existing role mechanism. Domain functions take an Actor and enforce permission — that part of ADR-0004 is in scope — but replacing the identity source is separate work, and the write path does not need it.
- **The public demo deployment.** Sign-in for visitors, the daily reset workflow and its authenticated endpoint are ADR-0010 and belong to a deployment phase. This phase only guarantees the seed script that reset will call.
- **Automation Rule vocabulary.** The execution mechanism is in scope; the trigger, condition and action language is not. Per ADR-0008 those fields are untyped free text and the rule builder sits on a type with no semantics. Modelling that vocabulary is its own piece of work, and until it is done automation can execute rules but has no rules worth executing.
- **File attachments and Vercel Blob.**
- **The external REST API, API keys and integrations.** ADR-0005 keeps the door open by putting logic in domain functions; walking through it is later.
- **Event schema versioning and archival.** Relevant once real history accumulates against a 0.5 GB ceiling; not now.
- **Rebuilding projections as an operational tool.** The design must permit replay; building a tool to run it is separate.
- **Visual and UX changes.** Screens that offer actions get working actions, not redesigns.
- **Performance work** beyond honouring the screen-shaped repository functions phase 1 produced.

## Further Notes

This spec deliberately covers two things that fail for different reasons, and the ticket breakdown must respect that. Everything read-related is verified by a suite that already exists; everything write-related needs new coverage. If the phase runs long, the read swap is a complete and shippable outcome on its own and the write path can be sequenced behind it.

The riskiest work is the choke point. It is small, it is where the transaction, the lock, the append, the projection update and the non-negative check all meet, and every quantity change in the product routes through it. It deserves disproportionate care relative to its size.

The second risk is authorization arriving late. The application has never enforced a permission on a write, because it has never had one. Every domain function written without an Actor argument is one that has to be revisited, so the Actor parameter belongs in the first domain function written, not retrofitted after several exist.

The README currently states that Stockpile runs against a deterministic in-memory dataset rather than a database. That becomes false during this phase. Since the project is showcased through its documentation, updating it is a deliverable rather than housekeeping.

`AutomationRule` carries untyped free-text triggers, conditions and actions, and `Movement` records both a before and after quantity — a shape that assumes a stored balance the ledger annotates, which is consistent with the projection model chosen here.
