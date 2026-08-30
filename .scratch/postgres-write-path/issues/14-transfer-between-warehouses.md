# 14: Transfer between Warehouses

**What to build:** Stock moves from one Warehouse to another. Dispatching a Transfer lowers on-hand at the source and puts the quantity in transit; receiving it at the destination raises on-hand there and clears the in-transit balance.

This is the only Document with two ends, and the only flow where one logical operation touches two Stock Rows. Both ends of a dispatch must move together or not at all: stock that has left the source but was never recorded as in transit has vanished from the system. The choke point takes a lock per Stock Row, so a Transfer takes two, and they must be acquired in a consistent order across every flow that locks more than one row — otherwise two concurrent transfers between the same pair of Warehouses can deadlock.

Dispatching appends a transfer-out Movement at the source. Receiving appends a transfer-in Movement at the destination. In transit is derived from open Transfer state, not written directly.

A Transfer in flight is a real state that can persist for days, and stock in it belongs to neither end's on-hand. Reporting must reflect that rather than double-counting or losing it.

**Blocked by:** 09 (The choke point and the Event stream).

**Status:** resolved

- [x] Dispatching lowers on-hand at the source and places the quantity in transit
- [x] Receiving raises on-hand at the destination and clears the in-transit balance
- [x] Both ends of a dispatch commit together or not at all
- [x] Locks on multiple Stock Rows are acquired in a consistent order, documented where the choke point is used
- [x] Two concurrent transfers between the same pair of Warehouses do not deadlock, and this is covered by a test
- [x] In transit is derived from open Transfer state, never written directly
- [x] Stock in transit is counted at neither end's on-hand
- [x] End-to-end coverage exists for dispatch, receipt, and the in-flight state in between

## Comments

### 2026-08-30 — done

The write flows are in `lib/domain/transfers.ts`, both Actor-first and checking
`transfers`/`edit` before anything else (ADR-0004):

- `dispatchTransfer(actor, { transferId, carrier?, trackingNumber? }, db)` —
  `approved -> in-transit`. Each line's outstanding quantity (`quantity -
  shipped`) leaves the source as one or more `transfer-out` Movements through
  `applyStockChange` (the choke point), drawn from the product's holdings in the
  source warehouse oldest-first — `line.fromLocationId` is where the picker
  pulled from, not a constraint. `shipped` is raised per line and the Document
  moves to `in-transit` with `shippedAt` set. In transit is never written: it is
  `sum(shipped - received)` over open Transfers (`documents.inTransitByProduct`),
  so it rises purely as a consequence. A line that cannot be covered rejects the
  whole despatch with `insufficient-stock` — stock cannot leave the source
  without being recorded in transit.
- `receiveTransfer(actor, { transferId, locationId, lines, note? }, db)` —
  `in-transit -> partially-received | received`. Each line's received quantity
  raises on-hand at the destination as one `transfer-in` Movement (its damaged
  portion goes to the damaged balance in the same Movement, via the choke
  point's `damagedDelta`). `received` rises toward `shipped`, so the in-transit
  projection falls; when no line has anything still in transit the transfer is
  `received`. A line cannot be received beyond what was despatched for it —
  that would drive the in-transit projection negative — so such a receipt is
  rejected.

**Consistent lock order (ADR-0006).** `dispatchTransfer` plans every draw across
every line first, then sorts the draws by ascending `stock_rows.seq` — the same
key `shipSalesOrder` draws in — before calling the choke point. So a despatch
locks Stock Rows low-seq-first regardless of line order, and two concurrent
despatches between the same pair of Warehouses whose lines name the same
products in opposite order cannot deadlock (without the sort: A locks P1 then
P2 while B locks P2 then P1). `receiveTransfer` ensures every put-away holding
exists, then locks them in ascending `stock_rows.seq` order too — the same key —
so two concurrent receipts cannot deadlock either. Both are documented at the
call site.

`OPEN_TRANSFER_STATUSES` now lives in `lib/domain/transfers.ts` (as `const
satisfies`) and `lib/repo/documents.ts` imports it, replacing a hand-kept copy.

UI: one server action `submitTransferAction` (`app/(app)/warehousing/transfers/[id]/actions.ts`,
validate + delegate only, ADR-0005) keyed by an `intent` discriminated union.
The record header gains a "Despatch" button for the `approved` state
(`transfer-actions.tsx`); the Receive tab's toast-only "Confirm receipt" became
a real submit that posts counts and damaged per line and shows the booked-in
result. The panel re-renders in place via `revalidatePath`.

Below the UI, `npm run check:transfers` (`lib/domain/transfers.checks.ts`), a CI
step after `check:fulfilment`:

- Forbidden — `auditor` calling `dispatchTransfer` / `receiveTransfer` directly
  throws `TransferError('forbidden')` and appends no Event.
- Consistent lock order — two transfers between the same warehouse pair, lines
  naming the same two products in opposite order, despatched with `Promise.all`;
  both settle `fulfilled` (a deadlock would surface as a `40P01` rejection, not
  a hang) and source on-hand falls by the combined quantity.
- Atomic — a two-line despatch whose second line cannot be covered is rejected
  whole: no `transfer-out`, no Event, no state change.

End to end: `e2e/transfer.write.spec.ts` — a spec-created `approved` transfer
(the seeded ones are not stock-backed) despatched (status `In transit`, two
`Transfer Out` ledger rows attributed to the operator, nothing yet received),
then received (status `Received`, two `Transfer In` rows raising destination
on-hand), and an `auditor` offered neither the Despatch control nor the Receive
tab. `afterAll` reverses every Movement and deletes the transfer.

Verified against a real Neon branch: `check:transfers` green, all six check
scripts green, `npx tsc` and `npx eslint` clean, full Playwright suite 49/49.
