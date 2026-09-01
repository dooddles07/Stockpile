# 07: Place a Sales Order

**What to build:** A sales officer fills in the existing new-sales-order form, submits it, and a real Sales Order exists in `draft` — reserving nothing.

`order-form.tsx` collects the customer, the lines, and recalculates availability as lines are added, then toasts. As with the purchase order, the work is in place and the write is missing.

The one thing this flow must get right is that creation does not reserve. Reserved is derived from open Document state, and `confirmSalesOrder` — built in phase 2 — is what makes that state reservable. A `draft` order is demand that has been recorded, not stock that has been promised; if creation reserved, a draft would make stock unsellable and cancelling a draft would have to unreserve it. Creation writes the order, its lines and an Event, and stops.

The form already shows availability per line. That display is advisory at creation time and must not be mistaken for a reservation.

**Blocked by:** 06 (raise a Purchase Order).

**Status:** open

- [ ] A `createSalesOrder(actor, input, db)` domain function exists, checks permission first, and writes the order and its lines in one transaction
- [ ] The number is allocated inside that transaction and an Event is appended, attributed to the Actor
- [ ] The order lands in `draft` and reserves nothing — the reserved balance is unchanged after creation
- [ ] Confirming the created order through the existing `confirmSalesOrder` reserves, proving creation and confirmation are correctly separated
- [ ] The form submits through a server action that validates and delegates only
- [ ] A Role that forbids creating sales orders is refused when reaching the domain function directly
- [ ] A creation that fails partway leaves nothing behind
- [ ] End-to-end coverage exists for placing an order, seeing reserved unchanged, then confirming it and seeing reserved move
