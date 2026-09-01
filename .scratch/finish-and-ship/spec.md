# Phase 3: Finish the product and ship it

Status: ready-for-agent

## Problem Statement

After phase 2, Stockpile runs on Neon Postgres with a real event-sourced write path. A warehouse operator can receive a delivery, ship an order, dispatch and receive a transfer, complete a count, process a return and record an adjustment — every one of them a permission-checked domain function that appends immutable Events and moves a projection inside one transaction.

None of it is reachable by anyone but the developer, and half the application still lies.

Nothing is deployed. There is no Vercel project, no production database wiring, no daily reset. ADR-0010 describes a public writable demo in the present tense and no such thing exists. The landing page added in the last commit invites a visitor to raise and receive a purchase order, and states that writes are real and the instance resets daily — claims that are currently false.

No document can be created. Every write path built in phase 2 processes a document that the seed created. `po-form`, `order-form`, `transfer-form`, `count-form` and `return-form` each collect a complete, validated document and then call `toast.success`. Once the seeded documents are consumed the application is inert: there is stock to receive only because the seed said so.

No document can be approved. The status enums model approval explicitly — `po_status` runs `draft` to `submitted` to `approved` to `ordered`, `transfer_status` and `adjustment_status` carry `pending-approval`, `count_status` carries `review` then `approved` — and not one of those transitions has a domain function. The Approvals screen and the handheld approve surface both read real pending rows and both fake the decision. A document created in `draft` would have no way out of it.

Large parts of the interface are decoration. The roles editor promised by ADR-0004 as editable at runtime through the admin UI pops a toast. The import wizard parses a file, validates every row against a real schema, reports the errors correctly — and imports nothing. Seven settings pages render hardcoded default values against a settings table that does not exist. Integrations and API keys configure subsystems that were never built. Twenty-six `ActionButton`s across the application exist solely to say that something happened. Picking and packing show real work queues whose buttons do nothing, though the `advanceSalesOrder` function they need was built in phase 2.

## Solution

Ship it first, then finish it.

The deployment comes before any feature work. A Neon `dev` branch splits local development from the public demo, a Vercel project goes live against the primary branch, migrations run from CI on every push to `main`, and a scheduled workflow re-seeds the demo daily and smoke-tests it afterwards. Every subsequent ticket then lands on a live URL, and the riskiest unknowns — pooled connections from a serverless function, migration ordering against a deploy, the reset mechanism itself — are found on a small diff instead of on the last day.

Then the write paths that phase 2 left out. Five creation flows — purchase order, sales order, transfer, stock count, return — each landing a document in its initial state through the existing event choke point, with numbers allocated from a Postgres sequence rather than the seed's counters. One approval mechanism, shared across the four document types whose enums call for it, wired to the two surfaces that already display the queue. Picking, packing, notifications and the handheld scanner wired to functions that already exist. The roles permission matrix made writable, as ADR-0004 said it was. The import wizard made to write what it validates, with opening stock routed through the choke point as a count correction rather than written to `stock_rows` directly.

And then the deletions. Integrations, API keys, the automation rule builder, five of the seven settings pages, the tasks screen and every `ActionButton` with nothing behind it are removed, along with the tables that only they read. A screen that cannot do what it offers is worse than a missing screen: it teaches a visitor that the whole thing is a mockup. What survives is smaller and entirely real.

At the end of this phase, a visitor arriving from a portfolio link can raise a purchase order, approve it, receive it, watch on-hand rise, follow the movement in the ledger with an actor's name against it, switch to the Auditor role and be refused — on a live URL, against a real database, resetting itself every night.

## User Stories

### Deployment

1. As a visitor, I want to reach Stockpile at a public URL, so that a portfolio link leads to a running product rather than a repository.
2. As a visitor, I want the changes I make to be real, so that I am evaluating a system rather than a prototype.
3. As a visitor, I want the instance to be in a sensible state when I arrive, so that yesterday's visitors have not left it unusable.
4. As the maintainer, I want local development to run against a database that is not the public demo, so that seeding locally cannot wipe what a visitor is looking at.
5. As the maintainer, I want a schema change to reach production with the deploy that needs it, so that the demo cannot run new code against an old schema.
6. As the maintainer, I want the daily reset verified immediately after it runs, so that the one mechanism that silently destroys the demo is the one thing that is checked.
7. As the maintainer, I want the deployment to cost nothing recurring, per ADR-0007.

### Creating documents

8. As a purchasing officer, I want to raise a Purchase Order against a Supplier, so that stock can be ordered rather than only received.
9. As a sales officer, I want to place a Sales Order for a Customer, so that demand enters the system rather than only leaving it.
10. As a warehouse manager, I want to raise a Transfer between Warehouses, so that stock movement between sites starts with a document.
11. As a warehouse manager, I want to schedule a Stock Count over a scope, so that counting is planned rather than only completed.
12. As an operator, I want to raise a Return in either direction against its source Document, so that goods coming back start with a record.
13. As an auditor, I want every created Document to carry a unique number allocated by the system, so that two documents raised at the same moment cannot share an identity.
14. As an inventory manager, I want a newly raised Purchase Order to appear in the incoming balance once it is live, so that the balance reflects everything on its way.
15. As an inventory manager, I want a newly placed Sales Order to reserve stock only when it is confirmed, so that a draft does not make stock unsellable.

### Approving documents

16. As an approver, I want to approve or reject a Purchase Order, Transfer, Adjustment or Stock Count from one queue, so that everything waiting on a decision is in one place.
17. As an approver, I want a rejection to require a reason, so that the record explains itself later.
18. As an approver, I want an approval to be attributed to me, so that the audit trail names who decided.
19. As an operator on the floor, I want to approve from the handheld surface, so that a decision does not require a desk.
20. As an auditor, I want a user whose Role forbids approving to be refused even if they reach the action directly, so that the queue is a gate rather than a display.
21. As a purchasing officer, I want an approved Purchase Order to become receivable, so that creation and receipt are one continuous flow rather than two disconnected halves.

### Finishing the surface

22. As a picker, I want to advance a Sales Order from the picking queue, so that the queue is where the work happens.
23. As a packer, I want to advance a Sales Order from the packing queue, for the same reason.
24. As any user, I want to dismiss a notification, so that the list reflects what I have dealt with.
25. As an operator, I want the handheld scanner to look up a real SKU, so that the surface is usable rather than illustrative.
26. As an administrator, I want to change a Role's permissions and have it take effect, so that ADR-0004's runtime permission editor is true.
27. As an administrator, I want to enable or disable an Automation Rule, so that automation can be controlled without a rule language existing.
28. As an inventory manager, I want to import products, suppliers, customers and opening stock from a file, so that the validation the wizard already performs leads somewhere.
29. As an inventory manager, I want an import that fails partway to import nothing, so that a bad file does not leave the catalogue half-populated.
30. As an inventory manager, I want imported opening stock to appear in the movement ledger as a correction, so that stock never arrives without an explanation.
31. As an administrator, I want to set the company name and address, so that the one genuinely global setting is real.
32. As a visitor, I want every button I can see to do what it says, so that nothing I click teaches me the product is a mockup.

## Implementation Decisions

**Deployment ships before feature work.** Tickets 01 to 04 are the deployment and are done first. The alternative — build everything, deploy once at the end — concentrates every unknown into the final day, when the diff is largest and the remaining time is smallest.

**Three Neon branches, one purpose each.** The primary branch is the public demo and is written by production and by the daily reset workflow only. The existing `ci` branch is truncated and reseeded by every CI run. A new `dev` branch is what a developer's `.env` points at. No branch serves two purposes.

**The daily reset is a workflow running `db:seed`, not an HTTP endpoint.** This amends ADR-0010, which specified an authenticated endpoint called by a scheduled workflow. The endpoint is unnecessary: the workflow can run the seed script directly against the production connection string, exactly as CI already does against `ci`. That removes a secret comparison, a route, and the most dangerous piece of public surface in the application, in exchange for nothing. ADR-0010's reasoning for truncate-and-reseed over the alternatives is unaffected and stands.

**Migrations run from CI on push to `main`,** against the production branch, using the same `db:migrate` command CI already runs against `ci`. A migration must never run at build time: `next build` is required to succeed with no `DATABASE_URL` present, and CI's build job proves it.

**Document numbers come from a Postgres sequence per document type,** allocated inside the creating transaction, with a unique index on each `number` column. The shared demo account of ADR-0010 makes simultaneous creation the normal case rather than an edge case, which rules out `max(number) + 1`. The seed must advance each sequence past the highest number it loaded, or the first document a visitor creates collides with a seeded one.

**Creation lands a Document in its initial state and appends an Event; it does not move stock.** A raised Purchase Order changes the incoming balance because incoming is derived from open Purchase Order state, not because anything wrote a Movement. A placed Sales Order reserves nothing until `confirmSalesOrder` runs. Creation flows follow the rule phase 2 established: the only code that writes stock is the choke point, and it is reached only by things that actually move quantity.

**Approval is one function with four thin wrappers.** Approve and reject differ per document type only in which table they touch, which permission they check and which status they set. The shared shape — lock the document, check the current status is the pending one, check permission, write the new status and the deciding Actor, append the Event — is written once. A rejection carries a reason; an approval does not require one.

**Approval is not a stock operation.** No Movement is appended when a document is approved. The stock consequence happens later, when the approved document is received, dispatched or applied.

**Screens without a write path are deleted, not stubbed.** Integrations, API keys, the automation rule builder, five settings pages, the tasks screen, and every `ActionButton` with no implementation. Tables read by nothing but a deleted screen are dropped from the schema and the seed in the same ticket. This is a deliberate, documented decision and gets an ADR, because a future reader will otherwise assume the screens were lost rather than removed.

**The automation rule builder goes; the rule list and detail stay.** The trigger, condition and action vocabulary is still undefined (ADR-0008, and the phase 2 out-of-scope list), so a builder can only produce rules that cannot execute. The `enabled` toggle is wired for real: it is one boolean column that `runAutomation` already honours, and it makes the screen operable without inventing a language.

**Opening stock import routes through the choke point as a `count-correction`.** The importer's own description is "use for a new site or a full recount", which is exactly the semantics of a count correction. Importing stock must not write `stock_rows` directly.

**An import file is one transaction.** Every row lands or none does, per user story 29.

**Company settings become a single-row settings table.** The other six settings pages configure values that either live elsewhere already — reorder points are per-Product and read by `healthOf`, warehouses have their own CRUD — or configure nothing at all.

**Identity stays as it is.** ADR-0004's amendment is extended rather than reversed: the cookie-held role and its representative user remain the actor source, deliberately, because a public demo behind a registration wall is a demo nobody enters. Domain functions already take a real user object and do not change.

## Testing Decisions

**The existing seams do not change.** Playwright against rendered routes stays primary (ADR-0009). Each new write path gets a `.write.spec.ts` in the same style as phase 2's, and a `.checks.ts` run as its own CI step wherever the behaviour worth proving is below the UI — a permission refusal reached directly, an atomicity guarantee, a concurrency case a browser cannot express.

**Every creation flow proves the same four things:** the document appears with an allocated number, the Event was appended and attributed, a Role that forbids creation is refused when reaching the domain function directly, and a creation that fails partway leaves nothing behind.

**Number allocation gets a concurrency check.** Two simultaneous creations of the same document type must produce two distinct numbers. This is the same class of test as phase 2's concurrent-despatch check and belongs in the same place — below the UI, in a `.checks.ts`.

**Approval is covered end to end through the Approvals queue,** for one document type in the browser and for all four in checks, plus a refusal for a Role without the permission. The approve-then-receive path — raise a Purchase Order, approve it, receive it, watch on-hand rise — is the single most valuable end-to-end test in this phase, because it is the flow the landing page invites a visitor to perform and the one that proves creation, approval and the phase 2 write path are actually connected.

**The import gets a rollback test:** a file whose last row is invalid imports nothing.

**Deletion tickets are verified by the suite continuing to pass,** plus removal of the assertions that covered the deleted screens. A deleted screen whose spec still passes was not deleted.

**The deployment is verified against the deployed instance.** The daily reset workflow runs the Playwright smoke spec against the production URL immediately after re-seeding. Because the seed is deterministic (ADR-0010), the recorded assertions hold against production exactly as they hold against `ci`. The full suite is not run against production: it writes, and it would leave the demo in a state the reset did not produce.

## Out of Scope

- **Auth.js and per-person sign-in.** Decided against for this phase; ADR-0004's amendment is extended to say so.
- **The Automation Rule trigger, condition and action vocabulary.** Unchanged from phase 2's out-of-scope list. Without it, no rule builder.
- **The external REST API, API keys and third-party integrations.** Their screens are deleted in this phase; the capability itself remains future work.
- **File attachments and Vercel Blob.**
- **Event schema versioning, archival, and projection rebuild tooling.**
- **Redesigns.** Screens that survive get working actions, not new layouts.
- **A separate production instance for real users.** ADR-0010 says the demo and a real instance must be separated if Stockpile ever acquires real users, and that ADR-0007 must be revisited first. Neither applies yet.

## Further Notes

The landing page is the acceptance criteria for this phase. It tells a visitor to raise and receive a purchase order, watch the ledger, switch to Auditor, and open the handheld surface, and it states that writes are real and the instance resets daily. Every one of those claims must be true when this phase closes, and two of them require work that is in it.

The riskiest ticket is 05, number allocation, for the same reason the choke point was the riskiest in phase 2: it is small, everything downstream depends on it, and getting it wrong produces a duplicate-key error in front of a visitor rather than a test failure.

The deletion ticket will feel like the least valuable and is close to the most. Twenty-six buttons that lie are twenty-six chances for a visitor to conclude the entire application is a mockup, and one of them is enough.
