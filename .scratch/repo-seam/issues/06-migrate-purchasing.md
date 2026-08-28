# 06: Migrate purchasing screens onto the async surface

**What to build:** Every purchasing screen — purchase orders, goods received, suppliers, supplier returns — reads its data by awaiting the async repository surface instead of importing the generated dataset directly. Roughly 10 files.

To a user, nothing changes. The baseline suite demonstrates it.

This ticket ends green on its own and is independent of the other migration tickets.

As with transfers, the incoming balance is derived from open purchase order state rather than from the movement ledger, and that derivation lives behind the seam after ticket 02. Screens here consume it rather than computing it.

Permission checks are not touched.

**Blocked by:** 02 (Expand — complete async repository surface).

**Status:** resolved

- [x] No purchasing screen imports the generated dataset directly
- [x] All reads in this area await the async repository surface
- [x] No screen computes incoming or other derived balances itself
- [x] Permission checks are unchanged
- [x] No visual, behavioral or UX change of any kind
- [x] Typecheck and build pass
- [x] The baseline suite from ticket 01 passes unmodified

## Comments

All 11 purchasing screens migrated: purchase orders (list, detail, new),
goods received, suppliers (list, detail, new, edit) and supplier returns
(list, detail, new). No screen imports `@/lib/data/store` any more (`grep`
is clean across `app/(app)/purchasing`); every former `db.*` / `*Sync`
read awaits `lib/repo/{documents,reference,inventory,returns}.ts`. Screens
doing many id lookups build one `Map` via `indexById()`. The new-order
screen's `incoming` figure is read from `summaryFor()` behind the seam,
not derived from purchase order state on the page. Per-document line sums
on the receipt and order screens are a single document totalling its own
lines — the same pattern every other detail screen uses, not a
cross-document balance — and are unchanged.

`npx tsc --noEmit`, `npm run lint` (0 errors, 7 pre-existing unrelated
warnings), `npm run build` and `npx playwright test` (29/29, the ticket 01
baseline) all pass.

Review (`mattpocock-skills:code-review`, this ticket as spec source) ran
Standards and Spec in parallel. Spec found the purchase-returns list
screen (`returns/page.tsx`) still on `returnRowsSync` — missed by the
first pass, now on `await returnRows("purchase")`. Standards found no hard
violation; judgement calls acted on — `suppliers/[id]` and
`purchase-orders` each fetched an accessor twice (an `indexById` map plus
a raw list), now both call sites read the one map; `returns/[id]` built a
whole `Map` for a single partner lookup, now a `.find`; the
`summaryByProduct` lookups on `suppliers/[id]` use `?? ` fallbacks rather
than a non-null assertion, matching the tolerant behaviour of the
`summaryForSync` they replaced.
