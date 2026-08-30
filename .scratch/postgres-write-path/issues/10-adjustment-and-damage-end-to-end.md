# 10: Adjustment and damage, end to end

**What to build:** The first write a user can actually perform. A warehouse operator records an Adjustment with a reason and a quantity, submits it, and sees on-hand change and a Movement appear in the ledger with their name on it. Recording damaged goods works the same way and moves quantity into the damaged balance.

This is the first flow through the choke point, so it establishes the pattern every later write flow copies: a server action validates its input and calls a domain function, the domain function takes the Actor and calls the choke point, and nothing else happens anywhere.

Per ADR-0005 the server action holds no logic. It validates with zod and delegates. An action that looks like a pass-through is correct and should stay that way — a reviewer should not "improve" it.

Authorization is enforced in the domain function, not by the form being hidden. The existing rendering gates stay, but a user whose Role forbids adjustments must be refused even when reaching the action directly.

An Adjustment requires a reason. That is the entire point of the Movement type existing — a discrepancy that is explained rather than silently corrected.

**Blocked by:** 09 (The choke point and the Event stream).

**Status:** resolved

- [x] A warehouse operator can record an Adjustment with a reason and see on-hand change
- [x] The resulting Movement appears in the ledger attributed to the Actor who made it
- [x] Recording damage moves quantity into the damaged balance
- [x] The server action validates input and delegates; it contains no business logic
- [x] A user whose Role forbids the action is refused even when reaching it directly
- [x] An Adjustment that would drive on-hand below zero is rejected with a clear message
- [x] End-to-end coverage exists for the successful flow, the permission refusal and the negative-stock rejection

## Comments

### 2026-08-30 — done

The write path is `RecordAdjustmentForm` -> `submitAdjustment` (server action,
`app/(app)/inventory/adjustments/new/actions.ts`) -> `recordAdjustment`
(`lib/domain/adjustments.ts`) -> `applyStockChange`. The action is the first in
the codebase: it zod-validates the form, resolves the Actor with
`getCurrentUser()`, maps direction+quantity to a signed delta, and delegates —
no logic of its own (ADR-0005). `recordAdjustment` maps the reason: `damaged`
-> a `damage` movement (`onHandDelta -n`, `damagedDelta +n`); anything else -> a
straight `adjustment`. Permission (`adjustments`/`create`) is checked in the
choke point, not the form.

The `/inventory/adjustments/new` screen is now a slim real form — warehouse,
product, the exact location/lot holding, reason, direction, quantity, note —
that writes straight to the ledger and shows the new on-hand, the damaged
balance and the `MOV-…` id. Negative-stock is left to the choke point to
reject (clear message surfaced in the result panel) rather than gated on a
disabled button, matching how authorization is enforced below the UI. The
draft-editing screen (`[id]/edit`) keeps the existing multi-line mock; draft
persistence is not in this ticket.

Coverage: `e2e/adjustment.write.spec.ts` — four browser tests (successful
adjustment + attribution in the ledger, damage into the damaged balance,
negative-stock rejection writing nothing, the Role-refused render gate). Write
specs mutate stock, so a new `write` Playwright project `dependsOn` `read`:
every seeded-total assertion in the other suites runs first, then the write
specs run and each restores the on-hand it spent. The "refused even when
reaching the action directly" guarantee is `npm run check:adjustments`
(`lib/domain/adjustments.checks.ts`), a below-UI check like ticket 09's, added
as a CI step after `check:stock`.

Also fixed here: `stock.checks.ts` spent real quantity and never restored it,
drifting the seeded branch so the `warehousing` and `analytics` smoke tests
failed against it (the ticket 09 CI run is red on exactly those two). The
checks now reverse their own net change after asserting.

Verified against a real Neon branch: `db:seed` -> `check:stock` ->
`check:adjustments` -> 33 Playwright tests (29 existing + 4 new) all green;
`tsc` and `eslint` clean.
