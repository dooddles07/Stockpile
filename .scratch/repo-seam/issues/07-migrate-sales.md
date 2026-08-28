# 07: Migrate sales screens onto the async surface

**What to build:** Every sales screen — customers, orders, order fulfilment, customer returns — reads its data by awaiting the async repository surface instead of importing the generated dataset directly. Roughly 8 files.

To a user, nothing changes. The baseline suite demonstrates it.

This ticket ends green on its own and is independent of the other migration tickets.

The reserved balance is derived from open sales order state rather than from the movement ledger, and that derivation lives behind the seam after ticket 02. Screens here consume it rather than computing it.

Permission checks are not touched.

**Blocked by:** 02 (Expand — complete async repository surface).

**Status:** resolved

- [x] No sales screen imports the generated dataset directly
- [x] All reads in this area await the async repository surface
- [x] No screen computes reserved or other derived balances itself
- [x] Permission checks are unchanged
- [x] No visual, behavioral or UX change of any kind
- [x] Typecheck and build pass
- [x] The baseline suite from ticket 01 passes unmodified

## Comments

All 9 sales screens migrated: customers (list, detail, new, edit), sales
orders (list, detail, new) and sales returns (list, new). No screen
imports `@/lib/data/store` any more (`grep` is clean across
`app/(app)/sales`); every former `db.*` / `*Sync` read awaits
`lib/repo/{documents,reference,inventory,returns}.ts`. Screens doing many
id lookups build one `Map` via `indexById()`. The sales returns list
reads `returnRows("sales")` from the seam. Per-line site availability on
the order detail screen is still summed from `stockRowsFor()` rows and
`summaryFor()` — a stock-row figure, not a balance recomputed from
sales-order state — and is unchanged.

`npx tsc --noEmit`, `npm run build` and `npx playwright test` (29/29, the
ticket 01 baseline) all pass.

Review (`mattpocock-skills:code-review`, this ticket as spec source) ran
Standards and Spec in parallel. Spec found no missing requirement, no
scope creep and no wrong implementation — a clean mechanical migration.
Standards found no hard violation; one judgement call acted on — the
order detail screen resolved per-line stock reads with sequential
`await`s in a `for` loop, unlike the purchasing sibling which wraps them
in `Promise.all`; the loop is now a `Promise.all(order.lines.map(...))`
building the `lineAvailability` map, and its one location lookup reads an
`indexById(locations)` map rather than a per-iteration accessor call.
