# 13: Sales Order fulfilment

**What to build:** The full path a Sales Order takes through the warehouse. Confirming an order reserves stock; picking and packing advance it; shipping removes the stock from the building and releases the reservation.

This is the flow where the distinction between the two kinds of balance matters most. Reserved is derived from open Sales Order state — no Movement produces it — so confirming an order changes what is reserved without any Movement being appended at all. Shipping appends a sale Movement that lowers on-hand, and reserved falls because the Document advanced. An implementation that writes to reserved directly is wrong even if the numbers happen to look right.

Reserving stock that is not available must be prevented. The point of a reservation is that stock promised to one customer cannot be promised to another.

Cancelling a confirmed order releases its reservation without appending any Movement, because nothing physically moved. This is worth an explicit test: it is the case most likely to be implemented as a compensating stock write.

**Blocked by:** 09 (The choke point and the Event stream).

**Status:** ready-for-agent

- [ ] Confirming a Sales Order reserves stock and appends no Movement
- [ ] Reserving more than is available is prevented
- [ ] Picking and packing advance the Document's state
- [ ] Shipping appends a sale Movement, lowers on-hand, and releases the reservation
- [ ] Cancelling a confirmed order releases its reservation and appends no Movement
- [ ] Reserved is never written directly; it follows from open Sales Order state
- [ ] A user whose Role forbids fulfilment is refused even when reaching the action directly
- [ ] End-to-end coverage exists for the full confirm-to-ship path and for cancellation
