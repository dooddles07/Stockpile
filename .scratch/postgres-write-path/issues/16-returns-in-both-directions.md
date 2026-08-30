# 16: Returns in both directions

**What to build:** Goods coming back are accounted for. A customer Return brings stock back in against a Sales Order; a supplier Return sends stock back out against a Purchase Order.

Returns are last among the write flows because they reference the Documents that created the original Movements — a customer Return relates to what was shipped, a supplier Return to what was received — so both need those flows to exist first.

Returned goods are not automatically sellable. A customer Return must record the condition of what came back, and goods returned damaged move into the damaged balance rather than on-hand. Treating every return as a straight reversal of the original sale is the mistake this flow exists to avoid.

A customer Return appends a return-in Movement; a supplier Return appends a return-out Movement. Returning more than was originally shipped or received must be prevented.

**Blocked by:** 09 (The choke point and the Event stream), 12 (Goods receipt against a Purchase Order), 13 (Sales Order fulfilment).

**Status:** resolved

- [x] A customer Return raises on-hand or the damaged balance according to the recorded condition
- [x] A supplier Return lowers on-hand and advances the Purchase Order relationship
- [x] Returning more than was shipped or received is prevented
- [x] Returns reference the originating Document and are visible from it
- [x] The resulting Movements are return-in and return-out respectively, attributed to the Actor
- [x] A user whose Role forbids processing returns is refused even when reaching the action directly
- [x] End-to-end coverage exists for a customer Return in good condition, a customer Return of damaged goods, and a supplier Return

## Comments

### 2026-08-30 — done

The write flow is `processReturn(actor, { returnId }, db)` in
`lib/domain/returns.ts`, one function over both kinds. Permission is checked
before the transaction, keyed by the Return's kind — `sales-returns` edit for a
customer Return, `purchase-returns` edit for a supplier one (ADR-0004) — then a
single interactive transaction locks the Return `FOR UPDATE`, plans every stock
change, and applies each through the choke point (`applyStockChange`).

- **Customer Return** — one `return-in` Movement per line. A line graded
  sellable (its `restock` flag) raises on-hand at the product's main holding in
  the return's warehouse; any other grade (damaged / defective / expired) raises
  the damaged balance in the same Movement instead. Returned goods are not
  automatically sellable and this is not a straight reversal of the sale.
- **Supplier Return** — `return-out` Movements drawn from the return's warehouse
  oldest-first, lowering on-hand, the same way a shipment draws.
- Both advance the Return `-> received` — the Document's own progression against
  its originating Purchase / Sales Order is what "advances the relationship";
  nothing is written back to the source Order (it carries no returned-quantity
  field, and touching its `fulfilled` would corrupt the incoming / reserved
  projections).

Over-return is refused: a line's quantity plus what sibling Returns in a settled
state have already booked against the same Document cannot exceed that
Document's shipped / received quantity for the product (`over-return`). The tally
reads without `FOR UPDATE` — a documented `ponytail:` caveat matching
`fulfilment.ts`; a supplier over-draw still fails at the choke point.

ADR-0006 — every stock change (a multi-line customer Return, a supplier Return
across holdings) is planned first, then the choke point's row locks are taken in
ascending `stock_rows.seq` order, the one order every multi-row flow shares.

UI: one server action `processReturnAction` (validate + delegate only, ADR-0005)
behind a `ProcessReturnButton` on the return detail page (shared by both
routes), shown while the Return is processable and the Role can edit that kind.
The "Returns against this order" block the Sales Order detail page already
carried is extracted to `<ReturnsAgainstOrder>` and the Purchase Order detail
page now renders it too, so a Return is visible from either Document.

Below the UI, `npm run check:returns` (`lib/domain/returns.checks.ts`), a CI step
after `check:counts`:

- Forbidden — `auditor` calling `processReturn` directly throws
  `ReturnError('forbidden')` and appends no Event.
- Over-return — a line exceeding what the source Sales Order shipped rejects
  with `over-return`, changing no balance.
- Direction — a customer Return raises on-hand for a sellable line and the
  damaged balance for a damaged line, both `return-in` Movements by the Actor; a
  supplier Return lowers on-hand as a `return-out` Movement by the Actor.

End to end: `e2e/returns.write.spec.ts` — a customer Return with a sellable and a
damaged line (on-hand up, damaged up, one `return-in` per line, visible from its
Sales Order reading "Received"), a supplier Return (on-hand down, one
`return-out`, visible from its Purchase Order), and an `auditor` offered no
Process control on either kind. Balances asserted as deltas; the spec's effect is
reversed relatively in `afterAll`.

Verified against a real Neon branch: `check:returns` green, all eight check
scripts green, `npx tsc` and `npx eslint` clean, full Playwright suite 55/55.
Reviewed with `/code-review`: the lock-order and pre-transaction permission
findings were applied here; the "advances the relationship" reading is recorded
above.
