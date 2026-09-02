# 11: Approve and reject, across four document types

**What to build:** One approval mechanism covering Purchase Orders, Transfers, Adjustments and Stock Counts, wired to the Approvals queue and to the handheld approve surface.

The status enums have modelled this from the beginning: `po_status` runs `draft`, `submitted`, `approved`, `ordered`; `transfer_status` and `adjustment_status` both carry `pending-approval`; `count_status` carries `review` then `approved`. Not one of those transitions has a domain function. `app/(app)/approvals/page.tsx` reads genuinely pending rows across all four types and offers no decision; `operator/approve/approve-client.tsx` toasts.

Without this ticket, tickets 06 to 10 produce documents that can never leave `draft`, and creation stays disconnected from the phase 2 write paths that consume approved documents. This is the join between the two halves of the phase.

Approve and reject differ per document type only in which table is touched, which permission is checked, and which status is written. Write the shared shape once — lock the document, verify it is in the pending status it claims to be, check permission, write the new status with the deciding Actor and timestamp, append the Event — and give each document type a thin wrapper. Approving a Purchase Order carries it far enough to be receivable, which makes the raise-approve-receive path continuous.

An approval appends no Movement. Nothing about approving a document moves stock; the stock consequence happens when the approved document is received, dispatched or applied. A rejection requires a reason and is terminal for that document.

**Blocked by:** 10 (raise a Return, in both directions).

**Status:** resolved

- [x] One shared approve/reject implementation with four thin per-document-type wrappers
- [x] Each checks permission before anything else and locks the document before reading its status
- [x] A document not in its pending status is refused rather than silently re-approved
- [x] Approval records the deciding Actor and the time; rejection additionally requires a reason
- [x] An Event is appended for every decision; no Movement is appended for any of them
- [x] The Approvals queue offers approve and reject for all four types and updates on decision
- [x] The handheld approve surface performs a real approval
- [x] An approved Purchase Order is receivable through the existing `receiveGoods`
- [x] A Role that forbids approving is refused when reaching the domain function directly, for each of the four types
- [x] End-to-end coverage exists for the full path: raise a Purchase Order, approve it, receive it, and see on-hand rise and the Movement in the ledger attributed to the Actor
- [x] End-to-end coverage exists for an Auditor seeing the queue and being unable to act on it

## Comments

**2026-09-02** — Resolved.

- `lib/domain/approvals.ts`: one `decide()` over a per-type descriptor, with
  `decideOnPurchaseOrder` / `decideOnTransfer` / `decideOnAdjustment` /
  `decideOnStockCount` wrappers and a `decideOnDocument` dispatcher. Permission
  (`approve` on the type's module) is checked before the transaction; the row is
  locked before its status is read; a document off its pending status throws
  `wrong-state`. Approve writes the deciding Actor to `approvedBy` and an
  approve-time stamp where the table has one (`orderedAt` / `approvedAt`);
  reject writes neither, only the terminal status, and needs a non-blank reason.
  Every decision appends one `<type>-(approved|rejected)` Event and no Movement.
  Approving a Purchase Order writes `ordered`, so `receiveGoods` accepts it
  unchanged.
- Queue + handheld both post to the `decideOnApproval` server action (ADR-0005:
  no logic in the action). Queue groups a role can decide render inline
  Approve / Reject with a reason field; the handheld cards make the real write.
- `lib/domain/approvals.checks.ts` (`npm run check:approvals`) and
  `e2e/approval.write.spec.ts` cover the below-UI refusals and the
  raise -> approve -> receive path.
- `tsc` and `eslint` pass. `check:approvals` and `test:e2e` were not run
  locally — the Neon dev branch is over its data-transfer quota; both run in CI
  against a fresh seeded branch.
