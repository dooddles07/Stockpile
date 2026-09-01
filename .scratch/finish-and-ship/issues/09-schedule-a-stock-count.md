# 09: Schedule a Stock Count

**What to build:** A warehouse manager defines a count over a scope, submits it, and a real Stock Count exists in `scheduled` with its lines materialised from that scope.

`count-form.tsx` collects the scope — a warehouse, a set of locations, a category or the whole site — and the date, then toasts. `completeStockCount` on the other end was built in phase 2 and applies the variances through the choke point as `count-correction` Movements. The count it completes has to come from somewhere.

The interesting decision here is what the lines are and when they are fixed. A count's lines are the product-location holdings in scope at the moment it is scheduled, captured as `expected` quantities. Capturing them at scheduling time rather than resolving the scope lazily at counting time is what makes a variance meaningful: the expected figure is what the system believed when the count was raised, and the difference from what the counter found is the finding. A count over a scope with no holdings is not useful and should be refused rather than created empty.

**Blocked by:** 08 (raise a Transfer).

**Status:** open

- [ ] A `scheduleStockCount(actor, input, db)` domain function exists, checks permission first, and writes the count and its lines in one transaction
- [ ] The number is allocated inside that transaction and an Event is appended, attributed to the Actor
- [ ] Lines are materialised from the scope at scheduling time, each carrying the expected quantity as it stood then
- [ ] A scope that resolves to no holdings is refused, not created empty
- [ ] The count lands in `scheduled` and moves no stock
- [ ] The scheduled count opens in the existing count sheet and can be completed through the existing `completeStockCount`
- [ ] The form submits through a server action that validates and delegates only
- [ ] A Role that forbids scheduling counts is refused when reaching the domain function directly
- [ ] End-to-end coverage exists for scheduling a count and opening its sheet with the expected lines present
