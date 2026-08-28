# 08: Migrate operator screens onto the async surface

**What to build:** The operator screens — lookup, scan, receive, approve — read their data by awaiting the async repository surface instead of importing the generated dataset directly. Roughly 4 files.

To a user, nothing changes. The baseline suite demonstrates it.

This ticket ends green on its own and is independent of the other migration tickets.

These screens sit in a separate route group from the main application and are the ones warehouse staff use on the floor, so they are worth confirming individually rather than assuming the main application's coverage reaches them.

Permission checks are not touched.

**Blocked by:** 02 (Expand — complete async repository surface).

**Status:** resolved

- [x] No operator screen imports the generated dataset directly
- [x] All reads in this area await the async repository surface
- [x] Permission checks are unchanged
- [x] No visual, behavioral or UX change of any kind
- [x] Typecheck and build pass
- [x] The baseline suite from ticket 01 passes unmodified

## Comments

All four operator screens migrated — look-up (`page.tsx`), scan, receive
and approve — plus the route-group `layout.tsx`, which imported
`@/lib/data/store` directly and so had to move for the first criterion to
hold. `grep` for `@/lib/data/store` and `*Sync` across `app/(operator)` is
clean. Every former `db.*` / `*Sync` read now awaits
`lib/repo/{reference,documents,inventory,metrics}.ts`; screens doing many
id lookups build one `Map` via `indexById()`.

`operatorCatalogue()` in `page.tsx` — shared by look-up and scan — became
`async` and returns `Promise<OperatorProduct[]>`; its per-product body is
wrapped in `Promise.all(products.filter(...).map(async ...))`, which
preserves order, and `summaryFor()` keeps the zero-value fallback its
`*Sync` twin had. Site resolution (`warehouses.find(w => w.id ===
user.warehouseId) ?? warehouses[0]`) reads the same array in the same
order as the old `db.warehouses[0]`, since `warehouses()` returns
`db.warehouses` unchanged. Permission checks (`getRole`,
`getCurrentUser`, `can(...)`) are byte-identical in every file.

`npx tsc --noEmit`, `npx next build` and `npx playwright test` (29/29, the
ticket 01 baseline) all pass.

Review (`mattpocock-skills:code-review`, this ticket as spec source) ran
Standards and Spec in parallel. Spec found no missing requirement and no
wrong implementation; it noted `layout.tsx` as a judgement call rather
than clean scope creep. Standards found no hard violation. Two judgement
calls acted on: `receive/page.tsx` resolved the transfer source warehouse
with a per-line `warehouses.find(...)` scan while building `indexById`
maps for its sibling supplier and product lookups — it now reads an
`indexById(allWarehouses)` map like the purchasing sibling; and
`layout.tsx` had batched all four reads in one `Promise.all` including
three consumed only inside `can(role, ...)` branches — the approvals, PO
and transfer reads are back behind their permission gates, only
`warehouses()` (needed for the site) stays unconditional. The 4-copy
site-resolution idiom across the operator files is pre-existing and left
as is; folding it into a helper is outside this ticket's "every rendered
figure and ordering untouched" mandate.
