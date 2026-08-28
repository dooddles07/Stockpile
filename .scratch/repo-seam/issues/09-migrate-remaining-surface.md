# 09: Migrate the remaining application surface

**What to build:** Everything not covered by the area-specific migration tickets reads its data by awaiting the async repository surface: dashboard, analytics, settings, approvals, tasks, notifications, import, and the application layout. Roughly 10 files.

To a user, nothing changes. The baseline suite demonstrates it.

This ticket ends green on its own and is independent of the other migration tickets.

Two parts of this set deserve attention. The dashboard and analytics screens read across every domain at once, so they exercise more of the repository surface than any single-area screen and are the most likely place for a gap in ticket 02 to surface. The application layout is shared by every screen in the main route group, so a mistake there is visible everywhere rather than on one page.

Permission checks are not touched.

**Blocked by:** 02 (Expand — complete async repository surface).

**Status:** resolved

- [x] No remaining screen or layout imports the generated dataset directly
- [x] All reads in these areas await the async repository surface
- [x] Cross-domain figures on the dashboard and analytics screens are unchanged
- [x] Permission checks are unchanged
- [x] No visual, behavioral or UX change of any kind
- [x] Typecheck and build pass
- [x] The baseline suite from ticket 01 passes unmodified

## Comments

Seventeen files moved: the `app/(app)` layout; the dashboard; every
analytics screen (inventory, purchasing, sales, valuation, warehouse, the
reports index and a report page); and settings (company, products,
security, warehouses), approvals, tasks, notifications and import. Ten of
them imported `@/lib/data/store` directly; the rest still called `*Sync`
repo functions. `grep` for `@/lib/data/store` and `*Sync` across the
dashboard, analytics, settings, approvals, tasks, notifications, import
and layout is now clean.

Every former `db.*` / `*Sync` read now awaits
`lib/repo/{reference,documents,inventory,ops,metrics,analytics,reports}.ts`.
The cross-domain screens — dashboard and every analytics page — batch
their reads through one `Promise.all` each; the dashboard resolves
seventeen accessors that way, the analytics pages between two and eight.
Screens doing many id lookups build one `Map` via `indexById()` instead
of a `*ByIdSync` singleton. Two spots needed more than a rename:

- `analytics/reports/page.tsx` — `reportSizeSync(report)` was called
  inside the JSX `.map`. It now precomputes a slug-keyed `Map` of row
  counts with `Promise.all(available.map(async r => [r.slug, await
  reportSize(r)]))` before render, and the card reads `sizes.get(slug)`.
- `import/page.tsx` — the product, supplier and customer lists are read
  through the async accessors in one `Promise.all`; the product SKU list
  is computed once and shared between the `products` and `stock`
  existing-key sets (the wizard only reads them, so the shared reference
  is safe).

`analytics/reports/[slug]/page.tsx` still calls `report.run()`
synchronously — `run` is a method on the `ReportDefinition` contract, not
a dataset import, and changing that signature is ticket 02 / 10 territory.

Permission checks (`getRole`, `getCurrentUser`, `can(...)`) are
byte-identical in every file. `npx tsc --noEmit`, `npx next build` and
`npx playwright test` (29/29, the ticket 01 baseline) all pass.

Review (`code-review`, max effort) found no correctness bugs — the
migration is mechanical and behavior-preserving. It re-flagged the
per-request `Map` rebuild versus the old process-level singleton as a
cost, already logged as deferred phase-2 work in tickets 03–08, and a
double-materialise of the warehouse list in the operator receive screen,
which is ticket 08 code and out of scope here.
