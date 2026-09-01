# 06: Raise a Purchase Order

**What to build:** A purchasing officer fills in the existing new-purchase-order form, submits it, and a real Purchase Order exists — numbered, attributed, with its lines, in `draft`.

`po-form.tsx` already does the hard part. It picks a supplier, adds lines from the catalogue or from purchase suggestions, computes subtotal, tax, discount, shipping and total, and validates the result. Then it calls `toast.success` and throws all of it away. This ticket replaces that call with a server action that validates the payload with zod and delegates to a new domain function, per ADR-0005.

Creation appends an Event and writes the order and its lines. It moves no stock: on-hand is unaffected, and the incoming balance is derived from open Purchase Order state, so it changes as a consequence of the document existing rather than because anything wrote to a projection. The order lands in `draft` and goes no further here — `submitted`, `approved` and `ordered` are ticket 11's transitions.

This is the first of five creation flows and sets the pattern the other four follow: allocate the number inside the transaction, append the Event, write the document, return the id, redirect to the detail page.

**Blocked by:** 05 (document numbers allocated by the database).

**Status:** open

- [ ] A `createPurchaseOrder(actor, input, db)` domain function exists, checks permission first, and writes the order and its lines in one transaction
- [ ] The number is allocated inside that transaction
- [ ] An Event is appended and attributed to the Actor
- [ ] The form submits through a server action that validates and delegates only
- [ ] The order lands in `draft` and appears in the purchase orders list and on its detail page
- [ ] The incoming balance reflects the new order once it is live, without any direct write
- [ ] A Role that forbids creating purchase orders is refused when reaching the domain function directly, and no Event is written
- [ ] A creation that fails partway leaves no order, no lines and no Event
- [ ] End-to-end coverage exists for raising an order and finding it on its detail page
