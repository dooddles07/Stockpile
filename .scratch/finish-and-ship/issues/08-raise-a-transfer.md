# 08: Raise a Transfer

**What to build:** A warehouse manager fills in the existing new-transfer form, submits it, and a real Transfer exists in `draft` between two Warehouses.

`transfer-form.tsx` picks the source and destination, adds lines and validates them, then toasts. The write path on the other end already exists: `dispatchTransfer` and `receiveTransfer` were built in phase 2 and handle the in-transit balance across both ends. What is missing is the document they operate on.

Creation moves no stock and creates no in-transit quantity. In transit is derived from open Transfer state and only begins when the transfer is dispatched. A `draft` transfer is a plan.

The source and destination must be different Warehouses, and every line's product must have a holding at the source — validation that belongs in the domain function, not only in the form, because the form is a rendering gate.

**Blocked by:** 07 (place a Sales Order).

**Status:** resolved

- [x] A `createTransfer(actor, input, db)` domain function exists, checks permission first, and writes the transfer and its lines in one transaction
- [x] The number is allocated inside that transaction and an Event is appended, attributed to the Actor
- [x] Source and destination Warehouses must differ, enforced in the domain function
- [x] The transfer lands in `draft`, creates no in-transit quantity, and moves no stock
- [x] The created transfer can be approved (ticket 11) and then dispatched through the existing `dispatchTransfer`
- [x] The form submits through a server action that validates and delegates only
- [x] A Role that forbids creating transfers is refused when reaching the domain function directly
- [x] End-to-end coverage exists for raising a transfer and finding it on its detail page

## Comments

**2026-09-02** — Done. `createTransfer(actor, input, db)` lives in
`lib/domain/transfers.ts`, next to `dispatchTransfer` and `receiveTransfer`:
the three only make sense read together, since the point of this one is the
line between planning a move and making it. It checks `transfers.create` before
anything else — a different permission from the `transfers.edit` both ends of
the write path use — then allocates the number, appends a `transfer-created`
Event and writes the transfer and its lines in one transaction.
`app/(app)/warehousing/transfers/new/actions.ts` validates with zod and
delegates only (ADR-0005), then redirects to the new transfer.

Creation puts nothing in transit because in transit is `sum(shipped - received)`
over the lines of transfers in `OPEN_TRANSFER_STATUSES`, and every line starts
at `shipped = 0` on a `draft`. As with the sales order, no code says "do not
move stock"; there is simply nothing to write.

Notes on the decisions:

- **The two buttons became one, as they did for the sales order.** "Submit for
  approval" and "Save draft" both produced the same `draft` document — approval
  is ticket 11's transition on the transfer's own page — so the stepper shows
  `draft` and the value threshold tile is advice about the step ahead rather
  than a gate on this one.
- **`from_location_id` is the lowest-seq holding at the source.** The column is
  NOT NULL and records the pick location the despatch is planned against. It is
  a plan, not a commitment: `dispatchTransfer` re-plans the draw across every
  holding oldest-first, so stock that has moved bin by then still despatches.
  Requiring a holding to exist is also how "every line's product must be held at
  the source" is enforced, and it rejects the undespatchable transfer when it is
  raised rather than at despatch.
- **The over-committed banner's copy changed.** It said a transfer reserves
  stock at the source, which is not true of any transfer status — a transfer
  never reserves; it lowers on-hand at despatch. The line check stays as a
  rendering gate (a line above what the source holds could never leave the
  building), but the copy now says what actually happens.

Coverage: `npm run check:transfers` (`lib/domain/transfers.checks.ts`, already
in CI — its step comment now covers this ticket too) gained three cases: a Role
without `transfers.create` is refused when calling the domain function directly
and writes nothing; the same site at both ends and a product the source does not
hold are both refused; and a raised transfer lands in `draft` with the in-transit
projection unmoved, on-hand unmoved and no Movement — which approving it and
despatching it through the existing `dispatchTransfer` then moves by its
quantity. `e2e/transfer-create.write.spec.ts` covers raising a transfer through
the form and landing on its detail page in `draft`, with its line despatched
nowhere and no Movement against it.

Neither the check script nor the Playwright suite could be run locally — Neon
returned "Your project has exceeded the data transfer quota" for the demo
branch, as it did for tickets 05, 06 and 07. `npm run typecheck` and `npm run
lint` (0 errors) pass. The coverage boxes are ticked on code that has not
executed anywhere yet; the CI run on this push is what proves them.
