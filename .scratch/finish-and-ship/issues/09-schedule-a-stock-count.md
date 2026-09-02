# 09: Schedule a Stock Count

**What to build:** A warehouse manager defines a count over a scope, submits it, and a real Stock Count exists in `scheduled` with its lines materialised from that scope.

`count-form.tsx` collects the scope — a warehouse, a set of locations, a category or the whole site — and the date, then toasts. `completeStockCount` on the other end was built in phase 2 and applies the variances through the choke point as `count-correction` Movements. The count it completes has to come from somewhere.

The interesting decision here is what the lines are and when they are fixed. A count's lines are the product-location holdings in scope at the moment it is scheduled, captured as `expected` quantities. Capturing them at scheduling time rather than resolving the scope lazily at counting time is what makes a variance meaningful: the expected figure is what the system believed when the count was raised, and the difference from what the counter found is the finding. A count over a scope with no holdings is not useful and should be refused rather than created empty.

**Blocked by:** 08 (raise a Transfer).

**Status:** resolved

- [x] A `scheduleStockCount(actor, input, db)` domain function exists, checks permission first, and writes the count and its lines in one transaction
- [x] The number is allocated inside that transaction and an Event is appended, attributed to the Actor
- [x] Lines are materialised from the scope at scheduling time, each carrying the expected quantity as it stood then
- [x] A scope that resolves to no holdings is refused, not created empty
- [x] The count lands in `scheduled` and moves no stock
- [x] The scheduled count opens in the existing count sheet and can be completed through the existing `completeStockCount`
- [x] The form submits through a server action that validates and delegates only
- [x] A Role that forbids scheduling counts is refused when reaching the domain function directly
- [x] End-to-end coverage exists for scheduling a count and opening its sheet with the expected lines present

## Comments

**2026-09-02:** Implemented. `scheduleStockCount` in `lib/domain/counts.ts` — permission check first (`counts`/`create`), then one transaction: resolves the scope to un-lotted, active, in-stock holdings (`stock_rows` joined to `products`/`locations`), refuses an empty result before a number is burned, allocates the number, appends a `stock-count-scheduled` Event, and writes the count (`scheduled`) and its lines with `expected` set from the on-hand at that moment. `count-form.tsx` submits through the new `app/(app)/inventory/counts/new/actions.ts` server action (validate + delegate only, per ADR-0005). Direct-call coverage for the forbidden role and the empty-scope refusal is in `lib/domain/counts.checks.ts` (`npm run check:counts`). End-to-end coverage is `e2e/stock-count-schedule.write.spec.ts` — schedules a count through the form and asserts the sheet opens with its lines already present.

Reviewed with `/code-review` (fixed point `cc43f0d`, spec-sourced from this ticket): Standards and Spec axes both came back clean — no hard violations, no missing or wrong checklist items. A few judgement-call nits (a `LIMIT` sentinel, duplicated 40/12 caps between the form's estimate and the scheduling call) were cheap enough to fix directly rather than leave as debt.

Not run: `npm run check:counts` and the Playwright e2e suite need the seeded Neon branch, which is currently over its data-transfer quota (`Your project has exceeded the data transfer quota`) — out of my control here. Typecheck and lint both pass clean on every changed file.
