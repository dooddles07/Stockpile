# 16: Company settings, the one setting worth having

**What to build:** A single-row `settings` table holding the company name and address, editable from the Company settings page, and read where the company identifies itself.

Six of the seven settings pages are deleted in ticket 15 because they configure values that live elsewhere or configure nothing. Company is the exception: a name and a trading address are genuinely global, belong nowhere else in the model, and have real consumers — the page header, document views, and the metadata on the landing page.

A single-row table is the right shape. Settings here are one record with named columns, not a key-value store, because the set of settings is small, known, and typed. The row is created by the seed and updated in place; nothing creates or deletes it.

**Blocked by:** 15 (delete every surface that cannot do what it offers).

**Status:** resolved

- [x] A `settings` table with a single row, created by the seed and included in the truncate-and-reseed
- [x] An `updateCompanySettings(actor, input, db)` domain function that checks permission first
- [x] The Company settings page renders the stored values and saves through a server action that validates and delegates only
- [x] The stored company name is read where the application names the company, rather than hardcoded
- [x] A Role that forbids editing settings is refused when reaching the domain function directly
- [x] End-to-end coverage exists for changing the company name and seeing it rendered

## Comments

**2026-09-03** — Resolved.

- Schema: `settings` table, one row, fixed id `SET-COMPANY` (`SETTINGS_ROW_ID` in `lib/domain/settings.ts`). Migration `0014`. Seeded from `COMPANY_SETTINGS_SEED`, added to the truncate-and-reseed list and the row-count check in `lib/db/seed.ts`.
- `lib/domain/settings.ts`: `updateCompanySettings(actor, input, db)` — `can(actor.role, "settings", "edit")` is the first statement (ADR-0004), then trim + both-required, then a transaction that writes the two columns and one `update` audit row (the Settings layout copy states every change there is logged; `roles.ts` precedent). Idempotent — a no-op change writes no audit row. `settings` is Reference Data (ADR-0002): no Event. `companySettings(db)` is the read, falling back to the seed constants if the row is somehow absent so a consumer never renders blank.
- `app/(app)/settings/company/{page,company-form,actions}.tsx`: the page renders the stored name + address; `saveCompanySettings` is a thin action (zod + delegate + error-map, ADR-0005). The five fake sections (regional defaults, workspace, tax id, …) are gone — ticket 15 left Company as the only settings page and those configured nothing. `components/settings/setting-row.tsx` deleted (its only importer).
- Consumers: the app-shell sidebar brand line reads the stored name (prop from the `(app)` layout); `app/page.tsx` reads it for the landing `<h1>` and `generateMetadata` title/siteName. That route is now `force-dynamic` — `next build` with no `DATABASE_URL` still passes (it is not prerendered), same mechanism the `(app)` segment relies on. Root `app/layout.tsx` keeps `"%s · Stockpile"` — that is the product name in the browser tab, not the company identifying itself; making the root layout async would force every route dynamic for a tab title.
- Below-UI: `npm run check:settings` (`lib/domain/settings.checks.ts`) — Auditor (`settings: read`) refused directly with `forbidden` and nothing written, blank input refused with `invalid`, a permitted edit persists + one audit row + idempotent re-save. Wired into `e2e.yml` before the Playwright step.
- E2E: `e2e/company-settings.write.spec.ts` — an admin changes the name on the page, it persists on reload and renders in the landing `<h1>`; `afterAll` restores the seed values and drops the audit rows. `smoke.spec.ts` settings assertion updated from the deleted workspace-stats line to the stored name/address.
- Green: `tsc`, `eslint`, `next build` (no `DATABASE_URL`), `npm run check:settings`, the Playwright `write` spec, and `smoke.spec.ts` settings. The full `read` project has two unrelated `page.goto` timeouts locally (`/dashboard`, `/analytics/inventory` cold-compile under the dev server) — untouched routes, an environment limit noted in ticket 15; CI runs it against a warm server with retries.
