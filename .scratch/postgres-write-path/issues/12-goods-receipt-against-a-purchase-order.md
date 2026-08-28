# 12: Goods receipt against a Purchase Order

**What to build:** A warehouse operator receives a delivery against an open Purchase Order, enters what physically arrived, and sees on-hand rise and the incoming balance fall by the same amount.

This is the first flow where two balances move in opposite directions for one action, and where a Document advances its state as a consequence. Receiving part of an order leaves it partially received and still open; receiving the remainder closes it. Receiving more than was ordered is a real situation in a warehouse and the flow must decide explicitly whether to permit it — over-receipt permitted with the excess recorded, or rejected — rather than leaving it to whatever the arithmetic happens to do.

On-hand rises through the choke point as a purchase-receipt Movement. Incoming is not stored by that Movement: it is derived from open Purchase Order state, so it falls because the Document advanced, not because anything wrote to it. Conflating the two is the mistake this flow is most likely to make.

**Blocked by:** 09 (The choke point and the Event stream).

**Status:** ready-for-agent

- [ ] Receiving against a Purchase Order raises on-hand by the received quantity
- [ ] The incoming balance falls as a consequence of the Document advancing, not by direct write
- [ ] A partial receipt leaves the Purchase Order open and correctly reflects what remains
- [ ] Receiving the remainder closes the Purchase Order
- [ ] Over-receipt behaviour is an explicit decision, implemented and covered by a test
- [ ] The resulting Movement is a purchase-receipt attributed to the Actor
- [ ] A user whose Role forbids receiving is refused even when reaching the action directly
- [ ] End-to-end coverage exists for a partial receipt, a completing receipt and a permission refusal
