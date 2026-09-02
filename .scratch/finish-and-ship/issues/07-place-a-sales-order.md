# 07: Place a Sales Order

**What to build:** A sales officer fills in the existing new-sales-order form, submits it, and a real Sales Order exists in `draft` — reserving nothing.

`order-form.tsx` collects the customer, the lines, and recalculates availability as lines are added, then toasts. As with the purchase order, the work is in place and the write is missing.

The one thing this flow must get right is that creation does not reserve. Reserved is derived from open Document state, and `confirmSalesOrder` — built in phase 2 — is what makes that state reservable. A `draft` order is demand that has been recorded, not stock that has been promised; if creation reserved, a draft would make stock unsellable and cancelling a draft would have to unreserve it. Creation writes the order, its lines and an Event, and stops.

The form already shows availability per line. That display is advisory at creation time and must not be mistaken for a reservation.

**Blocked by:** 06 (raise a Purchase Order).

**Status:** resolved

- [x] A `createSalesOrder(actor, input, db)` domain function exists, checks permission first, and writes the order and its lines in one transaction
- [x] The number is allocated inside that transaction and an Event is appended, attributed to the Actor
- [x] The order lands in `draft` and reserves nothing — the reserved balance is unchanged after creation
- [x] Confirming the created order through the existing `confirmSalesOrder` reserves, proving creation and confirmation are correctly separated
- [x] The form submits through a server action that validates and delegates only
- [x] A Role that forbids creating sales orders is refused when reaching the domain function directly
- [x] A creation that fails partway leaves nothing behind
- [x] End-to-end coverage exists for placing an order, seeing reserved unchanged, then confirming it and seeing reserved move

## Comments

**2026-09-02** — Done. `createSalesOrder(actor, input, db)` lives in
`lib/domain/fulfilment.ts`, next to `confirmSalesOrder` rather than in a module
of its own: the two only make sense read together, since the whole point of
this flow is the line between them. It checks `sales-orders.create` before
anything else — a different permission from the `fulfillment` one every other
function in that file uses — then in one transaction allocates the number
(`allocateDocumentNumber(tx, "salesOrder")`), appends a `sales-order-created`
Event attributed to the Actor, writes the order in `draft` with its lines, and
returns the id. The form posts through `placeSalesOrder` in
`app/(app)/sales/orders/new/actions.ts`, which validates with zod and delegates
only (ADR-0005), then redirects to the new order.

Creation reserves nothing because `draft` is not in `OPEN_SO_STATUSES`, the set
the reserved projection sums. No code says "do not reserve"; there is simply
nothing to write, which is the shape ADR-0002 was chosen for.

Notes on the decisions:

- **The two buttons became one, as they did for the purchase order.** "Confirm
  order" and "Save draft" both produced the same `draft` document, since
  confirming is a transition on the order's own page. The stepper shows `draft`
  rather than the status the order would eventually reach.
- **An on-hold customer or an over-credit total no longer disables the button.**
  A draft promises nothing, so there is nothing to withhold. This does mean
  neither rule is enforced anywhere now: `confirmSalesOrder` checks the
  fulfilment permission, the draft state and availability, and nothing about the
  account. The banners are advice to a human, and the code comment and banner
  copy say so rather than implying a gate that does not exist. A real credit
  gate belongs on the confirm transition and is not in this ticket.
- **`shipToCity` is the customer's city and `currency` is USD.** The form asks
  for neither. Every seeded Sales Order is USD and nothing on a Customer says
  otherwise; a separate ship-to address is a customer-addresses feature.

Coverage: `npm run check:fulfilment` (`lib/domain/fulfilment.checks.ts`, already
in CI — its step comment now covers this ticket too) gained three cases: a Role
with `fulfillment` but without `sales-orders.create` is refused when calling the
domain function directly and writes nothing; a creation against an unknown
warehouse leaves no order, no lines and no Event; and a placed order lands in
`draft` with the reserved projection unchanged, which confirming the same order
then raises by its quantity. `e2e/sales-order.write.spec.ts` covers placing an
order through the form, landing on its detail page in `draft` with no reservation
recorded and no Movement, finding it in the list, then confirming it and seeing
the reservation appear — still with no Movement.

The end-to-end half of the reserved criterion is weaker than the check script's:
no screen renders the reserved projection (the stock screens still show the
seeded `stock_rows.reserved`), so the spec asserts on the detail timeline's
"Stock reserved at …" entry, which is derived from the order's status. The
numeric proof is `check:fulfilment`.

Neither the check script nor the Playwright suite could be run locally — Neon
returned "Your project has exceeded the data transfer quota" for the demo
branch, as it did for tickets 05 and 06. `npm run typecheck` and `npm run lint`
(0 errors) pass. The coverage boxes are ticked on code that has not executed
anywhere yet; the CI run on this push is what proves them.
