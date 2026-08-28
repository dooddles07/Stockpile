# 03: Migrate inventory screens onto the async surface

**What to build:** Every inventory screen — products, stock levels, movements, adjustments, categories, stock counts — reads its data by awaiting the async repository surface instead of importing the generated dataset directly. Roughly 15 files, the largest area in the codebase.

To a user, nothing changes. Every figure, every table, every ordering is exactly what it was. That is the entire point, and the baseline suite is how it is demonstrated rather than asserted.

This ticket ends green on its own, because the synchronous surface still exists for every area that has not yet been migrated. It is independent of the other migration tickets and can run in parallel with them.

Permission checks are not touched. The `can(role, module, action)` calls in these screens stay exactly as they are, including the fact that they gate rendering rather than enforce access. Moving authorization into domain functions is separate work under ADR-0004 and must not be entangled with this.

Screens in this area will reveal things worth improving. Those observations belong in new tickets, not in this one. A phase whose value is "provably nothing changed" loses that value the moment something changes.

**Blocked by:** 02 (Expand — complete async repository surface).

**Status:** resolved

- [x] No inventory screen imports the generated dataset directly
- [x] All reads in this area await the async repository surface
- [x] Permission checks are unchanged
- [x] No visual, behavioral or UX change of any kind
- [x] Typecheck and build pass
- [x] The baseline suite from ticket 01 passes unmodified

## Comments

All 15 `app/(app)/inventory/**/page.tsx` files migrated. No screen imports
`@/lib/data/store` any more (`grep` is clean across the area); every read
awaits `lib/repo/{inventory,reference,documents}.ts`. The `can(role, …)`
calls are byte-for-byte unchanged. `npx tsc --noEmit`, `npx eslint .`
(0 errors), `npm run build` and `npx playwright test` (29/29, the ticket 01
baseline) all pass.

Two small repository additions rather than pure call-site edits:

- `allStockRows()` / `allStockRowsSync()` in `inventory.ts` — the stock-count
  scheduler (`counts/new`) read `db.stockRows` inline and had no landing
  spot. This is a raw list accessor, matching the pattern ticket 02's review
  sanctioned; the screen still does its product/location/category join and
  bucket aggregation itself.
- `indexById(listFn)` in `reference.ts` — screens that do many id lookups
  against one collection (movements, the two count detail screens, the
  product and adjustment detail screens) were each hand-rolling
  `new Map((await xs()).map(e => [e.id, e]))` three or four times. One
  helper, 21 call sites, no speculative surface.

Review (`mattpocock-skills:code-review` against `140225c`, this ticket as
spec source) ran Standards and Spec in parallel. Neither found a hard
violation or an incorrect implementation; behaviour is preserved everywhere
both checked (Map insertion order matches the old `db.*` array order for the
warehouse-code lists; `productRows().stock.available` equals the old
`summaryForSync(id).available`). Observations logged for later tickets, not
acted on here:

- The migrated detail/list screens now rebuild full entity `Map`s per
  request instead of using the process-level `*ByIdSync` maps — a perf
  regression invisible to users, and a push against ticket 02's
  "screen-shaped" goal. A screen-shaped join (e.g. `movementRows()`) is the
  phase-2 fix.
- `counts/new` still does `categoryList.find(…)` inside its loop over every
  stock row; a `categoryById` map two lines up would remove the scan.

Commits: `6aa3c5d`, `7e8d42d`, `b58f44c`.
