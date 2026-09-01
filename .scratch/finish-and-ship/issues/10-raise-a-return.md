# 10: Raise a Return, in both directions

**What to build:** An operator raises a Return against its source Document — a customer sending goods back, or goods going back to a supplier — and a real Return exists in `requested`.

`components/record/return-form.tsx` is shared by both the sales and purchase return screens. It picks the source order, selects the lines and quantities coming back, and toasts. `processReturn` on the other end was built in phase 2: it books a customer return to on-hand or to the damaged balance by condition, and a supplier return leaves stock. What is missing is the document it processes.

The constraint that matters is that a Return cannot take back more than its source Document moved. Phase 2 enforces that at processing time; enforcing it again at creation time is not duplication, because a return requesting an impossible quantity should be refused when it is raised rather than accepted and then rejected later by a different person. The two directions differ in which permission is checked — `sales-returns` against `purchase-returns` — and in the source document type, and in nothing else.

Creation moves no stock. Stock moves when the return is processed.

**Blocked by:** 09 (schedule a Stock Count).

**Status:** open

- [ ] A `raiseReturn(actor, input, db)` domain function handles both kinds, keyed by the return's kind, checking the matching permission first
- [ ] The number is allocated inside the transaction, using the correct prefix for the kind, and an Event is appended and attributed
- [ ] A line taking back more than the source Document moved is refused at creation
- [ ] The return lands in `requested` and moves no stock
- [ ] The created return can be processed through the existing `processReturn`
- [ ] Both return screens submit through a server action that validates and delegates only
- [ ] A Role that forbids raising returns of that kind is refused when reaching the domain function directly
- [ ] End-to-end coverage exists for raising a customer return and processing it, with on-hand moving only at processing
