# 12: Goods receipt against a Purchase Order

**What to build:** A warehouse operator receives a delivery against an open Purchase Order, enters what physically arrived, and sees on-hand rise and the incoming balance fall by the same amount.

This is the first flow where two balances move in opposite directions for one action, and where a Document advances its state as a consequence. Receiving part of an order leaves it partially received and still open; receiving the remainder closes it. Receiving more than was ordered is a real situation in a warehouse and the flow must decide explicitly whether to permit it — over-receipt permitted with the excess recorded, or rejected — rather than leaving it to whatever the arithmetic happens to do.

On-hand rises through the choke point as a purchase-receipt Movement. Incoming is not stored by that Movement: it is derived from open Purchase Order state, so it falls because the Document advanced, not because anything wrote to it. Conflating the two is the mistake this flow is most likely to make.

**Blocked by:** 09 (The choke point and the Event stream).

**Status:** resolved

- [x] Receiving against a Purchase Order raises on-hand by the received quantity
- [x] The incoming balance falls as a consequence of the Document advancing, not by direct write
- [x] A partial receipt leaves the Purchase Order open and correctly reflects what remains
- [x] Receiving the remainder closes the Purchase Order
- [x] Over-receipt behaviour is an explicit decision, implemented and covered by a test
- [x] The resulting Movement is a purchase-receipt attributed to the Actor
- [x] A user whose Role forbids receiving is refused even when reaching the action directly
- [x] End-to-end coverage exists for a partial receipt, a completing receipt and a permission refusal

## Comments

### 2026-08-30 — done

The write flow is `receiveGoods(actor, input, db)` in `lib/domain/receiving.ts`.
It opens one interactive transaction, locks the Purchase Order and its lines
`FOR UPDATE`, and for each accepted line calls the choke point
(`applyStockChange`) on that same `tx` — its inner `db.transaction` nests as a
savepoint, so the `purchase-receipt` Movement commits and rolls back with the
document advance. `lib/domain/stock.ts` gained a `StockDb = Db | Tx` type so
the choke point accepts an open transaction; tickets 13–16 reuse that seam.

On-hand rises only through the choke point. Incoming is never written: it is
`sum(quantity - fulfilled)` over open Purchase Orders (`documents.incomingByProduct`,
now `greatest(…, 0)` per line), so it falls purely because `receiveGoods` raised
the line `fulfilled` and moved the order out of `ordered`. After every line the
status is recomputed — `received` once every line has met its ordered quantity,
`partially-received` otherwise — and `receivedAt` is stamped on close.

Over-receipt is **permitted with the excess recorded**: a line may end with
`fulfilled` above `quantity`, on-hand rises by the full accepted amount, and the
order still closes. This matches the receiving screen, which already showed an
over-delivery as an allowed discrepancy. `stock_rows.incoming` (the seeded
per-row projection the stock screens still render) is deliberately left
untouched — incoming has no natural per-location home, and rebuilding that
projection is shared work across tickets 12–16, not this ticket.

`GoodsReceipt` (the Receive tab) is wired to a new `submitGoodsReceipt` server
action (ADR-0005: validate + delegate only). A receipt into a location that has
never held the product calls `ensureStockHolding` first — a new export of
`lib/domain/stock.ts`, so `stock_rows` is still only ever written from that one
module — to insert the zero Stock Row the choke point then locks. The receivable
statuses are one `satisfies readonly POStatus[]` constant with an `isReceivable`
helper the PO detail page's Receive gate now shares.

Three checks in `lib/domain/receiving.checks.ts`, run by `npm run check:receiving`
as a CI step after `check:reference` (ADR-0009's gap):

- Forbidden — `receiveGoods` called directly as `auditor` throws
  `GoodsReceiptError('forbidden')` and appends no Event.
- Over-receipt — receiving 5 above a line's outstanding raises on-hand by the
  full amount (not clamped), pushes `fulfilled` above `quantity`, advances the
  order, and writes a `purchase-receipt` Movement attributed to the Actor.
- Atomic — a two-line receipt whose second line is not on the order rolls the
  first line's on-hand change and Event back with it (spec story 26).

End to end: `e2e/goods-receipt.write.spec.ts` against `PO-2026-1094` — a partial
receipt (on-hand up, order partially received, outstanding down by the same
amount), the completing receipt (order closes, Receive tab shows fully-received,
goods-received record shows 158/158), and an `auditor` who never sees the tab.
Each run restores the order and holding in `afterAll`.

Verified against a real Neon branch: `check:receiving` green, all four check
scripts green, `npx tsc` and `npx eslint` clean, full Playwright suite 43/43.
