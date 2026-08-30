# 13: Sales Order fulfilment

**What to build:** The full path a Sales Order takes through the warehouse. Confirming an order reserves stock; picking and packing advance it; shipping removes the stock from the building and releases the reservation.

This is the flow where the distinction between the two kinds of balance matters most. Reserved is derived from open Sales Order state — no Movement produces it — so confirming an order changes what is reserved without any Movement being appended at all. Shipping appends a sale Movement that lowers on-hand, and reserved falls because the Document advanced. An implementation that writes to reserved directly is wrong even if the numbers happen to look right.

Reserving stock that is not available must be prevented. The point of a reservation is that stock promised to one customer cannot be promised to another.

Cancelling a confirmed order releases its reservation without appending any Movement, because nothing physically moved. This is worth an explicit test: it is the case most likely to be implemented as a compensating stock write.

**Blocked by:** 09 (The choke point and the Event stream).

**Status:** resolved

- [x] Confirming a Sales Order reserves stock and appends no Movement
- [x] Reserving more than is available is prevented
- [x] Picking and packing advance the Document's state
- [x] Shipping appends a sale Movement, lowers on-hand, and releases the reservation
- [x] Cancelling a confirmed order releases its reservation and appends no Movement
- [x] Reserved is never written directly; it follows from open Sales Order state
- [x] A user whose Role forbids fulfilment is refused even when reaching the action directly
- [x] End-to-end coverage exists for the full confirm-to-ship path and for cancellation

## Comments

### 2026-08-30 — done

The write flows are in `lib/domain/fulfilment.ts`, each Actor-first and checking
`fulfillment`/`edit` before anything else (ADR-0004):

- `confirmSalesOrder(actor, { salesOrderId }, db)` — `draft -> confirmed`.
  Reserves stock by moving the order into the open set the reserved projection
  sums, not by writing a balance: no Event, no `stock_rows.reserved` write. Each
  line's outstanding quantity must fit `availableToPromise` — `sum(on_hand -
  damaged)` over the product's holdings at the order's warehouse minus
  `sum(quantity - fulfilled)` over *other* open Sales Orders there (the reserved
  projection from CONTEXT.md, not the seeded `stock_rows.reserved`). Over-committing
  rejects the whole confirmation with `insufficient-stock`.
- `advanceSalesOrder(actor, { salesOrderId, to }, db)` — `confirmed -> reserved
  -> picking -> packing`, one linear step, validated against the state machine.
  No stock effect, no Event.
- `shipSalesOrder(actor, { salesOrderId, carrier? }, db)` — `packing -> shipped`.
  Each line's outstanding quantity leaves stock as one or more `sale` Movements
  through `applyStockChange` (the choke point), drawn oldest-first from the
  product's holdings at the order's warehouse. On-hand falls; `fulfilled` reaches
  `quantity`; the order leaves the open set so reserved falls out of the
  projection. A line that cannot be covered fails the whole shipment — the choke
  point's negative-stock guard rolls the transaction back (spec story 26).
- `cancelSalesOrder(actor, { salesOrderId }, db)` — any open status `->
  cancelled`. Releases the reservation by leaving the open set; no Movement, no
  stock write.

UI: one server action `advanceSalesOrderAction` (validate + delegate only,
ADR-0005) keyed by an `intent` field, plus a `FulfilmentActionButton` client
component. The order header gains "Confirm order" (draft) and "Cancel order"
(open); the Fulfil tab's three toast-only buttons became real submit buttons —
"Reserve stock", "Start picking", "Finish picking", "Ship order" — and the tab
now opens for `confirmed` orders too. The panel re-renders in place after each
action via `revalidatePath`.

Below the UI, `npm run check:fulfilment` (`lib/domain/fulfilment.checks.ts`), a
CI step after `check:receiving`:

- Forbidden — `auditor` calling confirm / ship / cancel directly throws
  `SalesOrderError('forbidden')` and appends no Event.
- Over-reservation — a line inflated past the warehouse's availability makes
  `confirmSalesOrder` reject with `insufficient-stock`; the order stays a draft.
- Confirm/cancel — confirming raises the reserved projection by the outstanding
  quantity with no Event and no `stock_rows.reserved` write; cancelling puts it
  back, also with no Event.
- Ship — walks an order to `packing` then ships it: a `sale` Movement per line
  attributed to the Actor, on-hand down by the shipped quantity, `fulfilled ==
  quantity`, the order gone from the reserved projection. Restored through the
  choke point afterwards.

End to end: `e2e/sales-order-fulfilment.write.spec.ts` — a draft order confirmed
then walked reserve -> pick -> pack -> ship (status transitions on the list, no
ledger row from the confirmation, one `sale` row for the shipment attributed to
the operator), a second order confirmed then cancelled (no ledger row either
way), and an `auditor` who is offered no Confirm control. Each target is wound
back to its seeded state in `afterAll`.

Verified against a real Neon branch: `check:fulfilment` green, all five check
scripts green, `npx tsc` and `npx eslint` clean, full Playwright suite 46/46.
