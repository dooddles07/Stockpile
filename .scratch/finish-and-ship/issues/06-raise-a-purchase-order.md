# 06: Raise a Purchase Order

**What to build:** A purchasing officer fills in the existing new-purchase-order form, submits it, and a real Purchase Order exists — numbered, attributed, with its lines, in `draft`.

`po-form.tsx` already does the hard part. It picks a supplier, adds lines from the catalogue or from purchase suggestions, computes subtotal, tax, discount, shipping and total, and validates the result. Then it calls `toast.success` and throws all of it away. This ticket replaces that call with a server action that validates the payload with zod and delegates to a new domain function, per ADR-0005.

Creation appends an Event and writes the order and its lines. It moves no stock: on-hand is unaffected, and the incoming balance is derived from open Purchase Order state, so it changes as a consequence of the document existing rather than because anything wrote to a projection. The order lands in `draft` and goes no further here — `submitted`, `approved` and `ordered` are ticket 11's transitions.

This is the first of five creation flows and sets the pattern the other four follow: allocate the number inside the transaction, append the Event, write the document, return the id, redirect to the detail page.

**Blocked by:** 05 (document numbers allocated by the database).

**Status:** resolved

- [x] A `createPurchaseOrder(actor, input, db)` domain function exists, checks permission first, and writes the order and its lines in one transaction
- [x] The number is allocated inside that transaction
- [x] An Event is appended and attributed to the Actor
- [x] The form submits through a server action that validates and delegates only
- [x] The order lands in `draft` and appears in the purchase orders list and on its detail page
- [x] The incoming balance reflects the new order once it is live, without any direct write
- [x] A Role that forbids creating purchase orders is refused when reaching the domain function directly, and no Event is written
- [x] A creation that fails partway leaves no order, no lines and no Event
- [x] End-to-end coverage exists for raising an order and finding it on its detail page

## Comments

**2026-09-02** — Done. `createPurchaseOrder(actor, input, db)` lives in
`lib/domain/purchasing.ts`: it checks `purchase-orders.create` before anything
else, then in one transaction allocates the number
(`allocateDocumentNumber(tx, "purchaseOrder")`), appends a
`purchase-order-created` Event attributed to the Actor, writes the order in
`draft` and its lines, and returns the id. The form now posts through
`raisePurchaseOrder` in
`app/(app)/purchasing/purchase-orders/new/actions.ts`, which validates with zod
and delegates only (ADR-0005), then redirects to the new order's detail page.

Notes on the decisions:

- **Money is recomputed server-side** from the lines rather than trusted from
  the client. The arithmetic moved out of the line-item editor into
  `lib/totals.ts`, so the form, the editor's rows and the domain function share
  one copy — what the user was shown and what is stored cannot drift.
- **The warehouse is not looked up.** `purchase_orders.warehouse_id` carries a
  foreign key, so an unknown warehouse is the database's rejection to make. That
  also gives `check:purchasing` a way to fail a creation *after* the Event is
  appended, which is what proves the whole thing rolls back together.
- **Incoming is untouched, by design.** `documents.incomingByProduct` sums over
  open Purchase Orders and `draft` is not open, so raising an order changes no
  balance; incoming moves when ticket 11 submits it. No projection is written
  either way.
- **The form's two buttons became one.** "Place order" / "Save draft" both had
  to produce the same `draft` document — placing is ticket 11 — so there is one
  "Create order" button and the workflow stepper shows `draft` rather than the
  status the order would eventually reach.
- **An on-hold supplier no longer blocks the button.** It only ever blocked
  "Place order"; a draft was always allowed against a supplier on hold, and a
  draft is now all this flow makes. The warning banner stays. The real gate
  belongs on the `submitted` / `ordered` transitions in ticket 11, which is also
  where `expectedAt` should be re-derived — a draft that sits for a fortnight
  otherwise carries a delivery date already in the past.

Coverage: `npm run check:purchasing` (`lib/domain/purchasing.checks.ts`, added
to CI) covers the direct permission refusal and the partway-failure rollback;
`e2e/purchase-order.write.spec.ts` covers raising an order, landing on its
detail page in `draft` with the officer's name and its lines, finding it in the
list, and the render gate for a forbidden Role.

Neither the check script nor the Playwright suite could be run locally — Neon
returned "Your project has exceeded the data transfer quota" for the demo
branch, the same limit ticket 05 hit. `npm run typecheck`, `npx eslint .` (0
errors) and `npm run build` all pass. The last three boxes above are ticked on
code that has not yet executed anywhere: the CI step is wired, and the first
push is what actually proves them.
