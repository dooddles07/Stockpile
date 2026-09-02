# 10: Raise a Return, in both directions

**What to build:** An operator raises a Return against its source Document — a customer sending goods back, or goods going back to a supplier — and a real Return exists in `requested`.

`components/record/return-form.tsx` is shared by both the sales and purchase return screens. It picks the source order, selects the lines and quantities coming back, and toasts. `processReturn` on the other end was built in phase 2: it books a customer return to on-hand or to the damaged balance by condition, and a supplier return leaves stock. What is missing is the document it processes.

The constraint that matters is that a Return cannot take back more than its source Document moved. Phase 2 enforces that at processing time; enforcing it again at creation time is not duplication, because a return requesting an impossible quantity should be refused when it is raised rather than accepted and then rejected later by a different person. The two directions differ in which permission is checked — `sales-returns` against `purchase-returns` — and in the source document type, and in nothing else.

Creation moves no stock. Stock moves when the return is processed.

**Blocked by:** 09 (schedule a Stock Count).

**Status:** resolved

- [x] A `raiseReturn(actor, input, db)` domain function handles both kinds, keyed by the return's kind, checking the matching permission first
- [x] The number is allocated inside the transaction, using the correct prefix for the kind, and an Event is appended and attributed
- [x] A line taking back more than the source Document moved is refused at creation
- [x] The return lands in `requested` and moves no stock
- [x] The created return can be processed through the existing `processReturn`
- [x] Both return screens submit through a server action that validates and delegates only
- [x] A Role that forbids raising returns of that kind is refused when reaching the domain function directly
- [x] End-to-end coverage exists for raising a customer return and processing it, with on-hand moving only at processing

## Comments

**2026-09-02:** Implemented. `raiseReturn` in `lib/domain/returns.ts` — permission checked first via `RAISE_PERMISSION[kind]` (`sales-returns`/`purchase-returns`, action `create`), keyed by the return's kind, before the transaction opens. Inside one transaction: reads the source Document (Sales Order or Purchase Order) and its lines, refuses a line that is not on the Document or whose quantity (accumulated per product) exceeds `sum(fulfilled)` for that product — refused *before* a number is allocated — then allocates the number (`salesReturn` → `SR`, `purchaseReturn` → `PR`, one shared sequence), appends a `return-created` Event attributed to the Actor, and writes the return (`requested`) and its lines with SKU/name/price copied from the matched source line. No `applyStockChange`; stock still moves only in `processReturn`, which accepts `requested`.

Both screens submit through the shared `components/record/return-form.tsx`, now wired to `raiseReturnAction` in `app/(app)/purchasing/returns/new/actions.ts` (validate with zod + delegate only, per ADR-0005) — the same single-action-under-the-purchasing-route arrangement the `[id]` processing action uses. The form navigates to the new return's detail page on success.

Direct-call coverage for the forbidden role and the over-return-at-creation refusal is in `lib/domain/returns.checks.ts` (`raisingForbiddenIsRefusedAndWritesNothing`, `raiseOverReturnIsRefused`, `npm run check:returns`). End-to-end coverage is `e2e/return-raise.write.spec.ts` — raises a customer return through the form, asserts it lands numbered in `requested` with no Movement and on-hand unchanged, then processes it and asserts on-hand rises by the returned quantity as a `return-in` Movement.

Reviewed with `/code-review` (fixed point `19f7ab9`, spec-sourced from this ticket). Standards: no hard violations; the judgement-call findings that were cheap to take were fixed directly — the form's action call is wrapped so a thrown non-`ReturnError` cannot leave the submit button stuck, the action result type was renamed off the domain's `RaiseReturnResult`, and its `kind` typed as `ReturnKind`. Spec: all 8 items met; the one "looks wrong" finding (a product on two source lines at different prices would stamp the first line's price) was fixed by keying return lines to the source *line* id rather than the product, so each line copies its exact source line. Left as noted: `raiseReturn` repeats `processReturn`'s source-line read and ceiling loop (the codebase already tolerates this pattern in `transfers.ts`), and the ceiling does not subtract sibling returns (the ticket's constraint is what the Document moved; `processReturn` still does the full accounting).

Not run: `npm run check:returns` and the Playwright e2e need the seeded Neon branch, which is still over its data-transfer quota (`Your project has exceeded the data transfer quota`) — same blocker as ticket 09, out of my control here. Typecheck and lint both pass clean on every changed file.
