# 05: Migrate warehousing screens onto the async surface

**What to build:** Every warehousing screen — warehouses, locations, transfers, picking, packing, receiving — reads its data by awaiting the async repository surface instead of importing the generated dataset directly. Roughly 11 files.

To a user, nothing changes. The baseline suite demonstrates it.

This ticket ends green on its own and is independent of the other migration tickets.

Transfers are worth care: a transfer in flight contributes to the in-transit balance, which is derived from open document state rather than from the movement ledger. That derivation moves behind the seam in ticket 02, so screens here consume it rather than computing it. If a screen in this area still calculates an in-transit figure itself, that read belongs in the repository layer.

Permission checks are not touched.

**Blocked by:** 02 (Expand — complete async repository surface).

**Status:** resolved

- [x] No warehousing screen imports the generated dataset directly
- [x] All reads in this area await the async repository surface
- [x] No screen computes in-transit or other derived balances itself
- [x] Permission checks are unchanged
- [x] No visual, behavioral or UX change of any kind
- [x] Typecheck and build pass
- [x] The baseline suite from ticket 01 passes unmodified

## Comments

All 11 files migrated: warehouses (list, detail, new, edit), locations,
transfers (list, detail, new), picking (queue, pick list), packing and
receiving. No warehousing screen imports `@/lib/data/store` any more
(`grep` is clean across the area); every former `db.*`/`*Sync` read
awaits `lib/repo/{documents,reference,inventory}.ts`. Screens doing many
id lookups build one `Map` via `indexById()`; the pick list's bin
allocation and FEFO/walk-order logic is untouched.

Transfers: `transferRows()` is a new join on `lib/repo/documents.ts`,
following the `productRows`/`stockLevelRows` precedent — a transfer's
requested/shipped/received unit totals, computed once from `t.lines`
instead of screens reducing over the lines themselves. The transfers
list and receiving queue consume it; the transfer detail page keeps its
own-line-total arithmetic (a single document totalling its own lines,
the same pattern every other detail screen in this codebase uses, not a
cross-document balance). No new repository function derives an
inventory-style in-transit balance — none of these screens ever computed
one; `stockRow.inTransit` continues to flow through `stockLevelRows()`
and `warehouseRollups()` unchanged.

`npx tsc --noEmit`, `npx eslint .` (0 errors, 1 pre-existing unrelated
warning), `npm run build` and `npx playwright test` (29/29, the ticket 01
baseline) all pass.

Review (`mattpocock-skills:code-review`, this ticket as spec source) ran
Standards and Spec in parallel. Standards found no hard violation; one
judgement call acted on — the warehouse detail screen fetched locations
twice (an `indexById` map for per-id lookups, then a separate raw list
for the per-site filter), now filters the one map. Spec flagged the
transfers/receiving in-transit reduction as not meeting "no screen
computes in-transit or other derived balances itself" — addressed via
`transferRows()` above; the transfer detail page's own-line totals were
judged out of that finding's scope, for the reason above.
