# 11: Approve and reject, across four document types

**What to build:** One approval mechanism covering Purchase Orders, Transfers, Adjustments and Stock Counts, wired to the Approvals queue and to the handheld approve surface.

The status enums have modelled this from the beginning: `po_status` runs `draft`, `submitted`, `approved`, `ordered`; `transfer_status` and `adjustment_status` both carry `pending-approval`; `count_status` carries `review` then `approved`. Not one of those transitions has a domain function. `app/(app)/approvals/page.tsx` reads genuinely pending rows across all four types and offers no decision; `operator/approve/approve-client.tsx` toasts.

Without this ticket, tickets 06 to 10 produce documents that can never leave `draft`, and creation stays disconnected from the phase 2 write paths that consume approved documents. This is the join between the two halves of the phase.

Approve and reject differ per document type only in which table is touched, which permission is checked, and which status is written. Write the shared shape once — lock the document, verify it is in the pending status it claims to be, check permission, write the new status with the deciding Actor and timestamp, append the Event — and give each document type a thin wrapper. Approving a Purchase Order carries it far enough to be receivable, which makes the raise-approve-receive path continuous.

An approval appends no Movement. Nothing about approving a document moves stock; the stock consequence happens when the approved document is received, dispatched or applied. A rejection requires a reason and is terminal for that document.

**Blocked by:** 10 (raise a Return, in both directions).

**Status:** open

- [ ] One shared approve/reject implementation with four thin per-document-type wrappers
- [ ] Each checks permission before anything else and locks the document before reading its status
- [ ] A document not in its pending status is refused rather than silently re-approved
- [ ] Approval records the deciding Actor and the time; rejection additionally requires a reason
- [ ] An Event is appended for every decision; no Movement is appended for any of them
- [ ] The Approvals queue offers approve and reject for all four types and updates on decision
- [ ] The handheld approve surface performs a real approval
- [ ] An approved Purchase Order is receivable through the existing `receiveGoods`
- [ ] A Role that forbids approving is refused when reaching the domain function directly, for each of the four types
- [ ] End-to-end coverage exists for the full path: raise a Purchase Order, approve it, receive it, and see on-hand rise and the Movement in the ledger attributed to the Actor
- [ ] End-to-end coverage exists for an Auditor seeing the queue and being unable to act on it
