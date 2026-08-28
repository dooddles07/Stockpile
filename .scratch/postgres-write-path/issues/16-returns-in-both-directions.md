# 16: Returns in both directions

**What to build:** Goods coming back are accounted for. A customer Return brings stock back in against a Sales Order; a supplier Return sends stock back out against a Purchase Order.

Returns are last among the write flows because they reference the Documents that created the original Movements — a customer Return relates to what was shipped, a supplier Return to what was received — so both need those flows to exist first.

Returned goods are not automatically sellable. A customer Return must record the condition of what came back, and goods returned damaged move into the damaged balance rather than on-hand. Treating every return as a straight reversal of the original sale is the mistake this flow exists to avoid.

A customer Return appends a return-in Movement; a supplier Return appends a return-out Movement. Returning more than was originally shipped or received must be prevented.

**Blocked by:** 09 (The choke point and the Event stream), 12 (Goods receipt against a Purchase Order), 13 (Sales Order fulfilment).

**Status:** ready-for-agent

- [ ] A customer Return raises on-hand or the damaged balance according to the recorded condition
- [ ] A supplier Return lowers on-hand and advances the Purchase Order relationship
- [ ] Returning more than was shipped or received is prevented
- [ ] Returns reference the originating Document and are visible from it
- [ ] The resulting Movements are return-in and return-out respectively, attributed to the Actor
- [ ] A user whose Role forbids processing returns is refused even when reaching the action directly
- [ ] End-to-end coverage exists for a customer Return in good condition, a customer Return of damaged goods, and a supplier Return
