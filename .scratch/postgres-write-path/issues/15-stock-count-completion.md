# 15: Stock Count completion

**What to build:** A warehouse operator works through a count sheet entering what is physically on the shelf, completes the count, and the system reconciles itself to reality — appending a count-correction Movement for every line where the counted quantity differs from the recorded one.

This is the flow where the system admits it was wrong, so the record of the correction matters more than the correction itself. Each variance produces its own Movement with the counted and expected quantities visible, so the ledger explains what changed and by how much rather than showing an unexplained jump.

A count with no variances appends nothing. Recording zero-quantity corrections would pollute the ledger with non-events.

Counted quantities are entered over time and the count is completed as one operation. The corrections apply together: a count that fails partway through must leave no corrections at all, or the shelf and the system disagree in a new way that nobody knows about.

The count sets the last-counted timestamp on the Stock Rows it touched, which is what tells an inventory manager where to count next.

**Blocked by:** 09 (The choke point and the Event stream).

**Status:** resolved

- [x] Completing a count appends a count-correction Movement for each line with a variance
- [x] Lines with no variance append nothing
- [x] Each correction records both the counted and the expected quantity
- [x] All corrections in one count apply together or not at all
- [x] The last-counted timestamp is set on the Stock Rows the count covered
- [x] Corrections are attributed to the Actor who completed the count
- [x] A user whose Role forbids completing counts is refused even when reaching the action directly
- [x] End-to-end coverage exists for a count with variances, a count with none, and a permission refusal

## Comments

### 2026-08-30 — done

The write flow is `completeStockCount(actor, { stockCountId, lines }, db)` in
`lib/domain/counts.ts`, Actor-first and checking `counts`/`edit` before the
transaction (ADR-0004). It moves a count `scheduled | in-progress -> applied`
in one transaction:

- Each covered line's `counted - expected` variance, when non-zero, leaves one
  `count-correction` Movement through the choke point (`applyStockChange`),
  carrying the counted and recorded quantities in the Movement reason so the
  ledger explains the jump. A matching line writes no Movement — a
  zero-quantity correction would be a non-event.
- The whole set is one `db.transaction`, so a completion that fails partway —
  a choke-point rejection, a bad line id — leaves no corrections at all.
- `markCounted` (new, in `lib/domain/stock.ts` beside `ensureStockHolding`, so
  `stock_rows` is still only written from that one module) stamps
  `stock_rows.last_counted_at` on every covered holding, in the same ascending
  `stock_rows.seq` order the corrections locked in (ADR-0006).
- `count_lines` get their `counted` / `variance` / `varianceValue` and the
  count its `accuracyPct` / `totalVarianceValue` (both already shown on the
  detail page), `completedAt` and `status`.

UI: one server action `submitCountAction`
(`app/(app)/inventory/counts/[id]/actions.ts`, validate + delegate only,
ADR-0005). The count sheet's toast-only "Submit for review" became a real
"Complete count" submit that posts every counted line and revalidates the
detail page in place; `review` is left out of the completable set so it keeps
its own approval path.

Below the UI, `npm run check:counts` (`lib/domain/counts.checks.ts`), a CI step
after `check:transfers`:

- Forbidden — `auditor` calling `completeStockCount` directly throws
  `CountError('forbidden')` and appends no Event.
- Atomic — a two-line completion whose second line's correction would drive
  on-hand below zero is rejected whole: the first line's `count-correction`
  rolls back, no Event survives, the count stays `in-progress`.
- No variance — a count where every counted line matched completes, appends
  zero Events, and still stamps `last_counted_at` on both Stock Rows.

End to end: `e2e/stock-count.write.spec.ts` — a spec-created stock-backed
count completed with one varied line (one `Count Correction` ledger row for
the signed variance, its reason showing `counted N, recorded M`, attributed to
the operator) and a second all-matching count (nothing posts), plus an
`auditor` offered neither the Count sheet tab nor the Complete control.
`afterAll` reverses every Movement and deletes the throwaway counts.

Verified against a real Neon branch: `check:counts` green, all seven check
scripts green, `npx tsc` and `npx eslint` clean, full Playwright suite 52/52.
