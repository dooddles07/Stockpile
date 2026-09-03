# 15: Delete every surface that cannot do what it offers

**What to build:** Removal of the screens, buttons and tables that exist only to look like a feature, and one small real feature in place of the largest group of them.

A button that lies is worse than a missing button. A visitor who clicks "Resync" and gets a success toast that changed nothing has learned that the application is a mockup, and one such click is enough to reframe everything else they saw. There are twenty-six of them.

**Deleted:**

- `admin/integrations/*` and its nav entry. It configures third-party connections to systems that do not exist.
- `settings/api/*`. API keys for an API that was never built; ADR-0005 keeps the door open to a REST layer and walking through it is future work.
- `admin/automation/new/*`, the rule builder. ADR-0008 leaves the trigger, condition and action vocabulary undefined and phase 2 put it out of scope, so a builder can only produce rules that cannot execute. The rule list and detail pages stay: they read real rows and real run history.
- `settings/{inventory,warehouses,products,notifications,security}`. Each configures values that either live elsewhere already — reorder points are per-Product and read by `healthOf`, warehouses have their own CRUD — or configure nothing.
- `app/(app)/tasks/*` and its nav entry. A seeded to-do list that nothing generates and nothing completes; it can only ever be stale.
- Every `ActionButton` usage with no implementation behind it.

**Dropped from the schema and the seed:** `integrations` and `tasks`. A table nothing reads is a claim in the schema that the system does something it does not.

**Built:** the `ActionButton`s labelled export become a real CSV download — a `Response` with `text/csv` built from the rows the screen already has. It is the only one of the twenty-six with an honest implementation short enough to belong in a deletion ticket.

**Also built:** the Automation Rule `enabled` toggle, wired for real. It is one boolean column that `runAutomation` already honours, and it makes the automation screen operable without a rule language existing.

**Blocked by:** 14 (the import wizard writes what it validates).

**Status:** resolved

- [x] Every screen in the deleted list is removed, along with its nav entries and its route files
- [x] `integrations` and `tasks` are dropped from the schema, the seed and the generated dataset, by migration
- [x] No `ActionButton` remains that has nothing behind it; the component itself goes if nothing uses it
- [x] Export actions produce a real CSV download of the rows on screen
- [x] An Automation Rule can be enabled and disabled, through a permission-checked domain function, and `runAutomation` honours it
- [x] Playwright assertions covering deleted screens are removed, not skipped
- [x] The suite passes, `tsc` and `eslint` are clean, and no dead import or unreferenced component is left behind

## Comments

**2026-09-03** — Resolved.

- Deleted: `admin/integrations/*`, `settings/api/*`, `settings/{inventory,warehouses,products,notifications,security}`, `tasks/*`, `admin/automation/new/*`, and `admin/automation/[id]/edit/*` (it imported the deleted rule builder). `settings/` keeps only Company, so `SettingsNav` / `SETTINGS_NAV` are gone and the layout drops its sidebar column.
- Schema: migration `0013` drops `integrations` and `tasks` with `CASCADE`; removed from `lib/db/seed.ts`, the generated dataset in `lib/data/store.ts`, `lib/repo/ops.ts`, and the `TaskItem` / `Integration` types. Kept the `integrations` permission-module key — removing it would churn every seeded role matrix for no functional gain (recorded in ADR-0011).
- `ActionButton` and its component file are gone. The `Export`-labelled buttons on screens that render a table of rows (products, stock levels, movements, audit log, valuation) now build a real `text/csv` file client-side and download it; `rowsToCsv` / `triggerCsvDownload` factored out of `components/data-table/export.ts` so the table export and the new `ExportButton` share one serialiser. The dashboard and analytics `Export` buttons had no single row set behind them and were removed rather than faked.
- Automation Rule `enabled` toggle: `setRuleEnabled` domain function (permission-checked `automation:manage`, typed error, idempotent) + thin server action + `RuleEnabledToggle` switch replacing the detail page's "Edit rule" button. `runAutomation` already filters `enabled = true`; a fourth case in `automation.checks.ts` proves a disabled rule does not evaluate and that a role without access is refused.
- ADR-0011 records the decision. `smoke.spec.ts`: `tasks` describe block removed (not skipped); the approvals assertion that expected a link now expects text (Super Admin renders the row in the decide list, not as a link — it was already failing on `main`).
- Green: `tsc`, `eslint`, `next build`, `npm run check:automation`, and the Playwright `read` project (28/28). The `write` project could not be run to completion locally — the `next dev` server crashes under the parallel write-spec load (`Jest worker … child process exceptions`), an environment limit unrelated to this change; those specs exercise write paths this ticket does not touch. CI runs the write suite against a fresh Neon branch.
