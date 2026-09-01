# 08: Raise a Transfer

**What to build:** A warehouse manager fills in the existing new-transfer form, submits it, and a real Transfer exists in `draft` between two Warehouses.

`transfer-form.tsx` picks the source and destination, adds lines and validates them, then toasts. The write path on the other end already exists: `dispatchTransfer` and `receiveTransfer` were built in phase 2 and handle the in-transit balance across both ends. What is missing is the document they operate on.

Creation moves no stock and creates no in-transit quantity. In transit is derived from open Transfer state and only begins when the transfer is dispatched. A `draft` transfer is a plan.

The source and destination must be different Warehouses, and every line's product must have a holding at the source — validation that belongs in the domain function, not only in the form, because the form is a rendering gate.

**Blocked by:** 07 (place a Sales Order).

**Status:** open

- [ ] A `createTransfer(actor, input, db)` domain function exists, checks permission first, and writes the transfer and its lines in one transaction
- [ ] The number is allocated inside that transaction and an Event is appended, attributed to the Actor
- [ ] Source and destination Warehouses must differ, enforced in the domain function
- [ ] The transfer lands in `draft`, creates no in-transit quantity, and moves no stock
- [ ] The created transfer can be approved (ticket 11) and then dispatched through the existing `dispatchTransfer`
- [ ] The form submits through a server action that validates and delegates only
- [ ] A Role that forbids creating transfers is refused when reaching the domain function directly
- [ ] End-to-end coverage exists for raising a transfer and finding it on its detail page
