# 11: Reference data creation and editing

**What to build:** An inventory manager can create and edit the records that describe the business: Products, Categories, Suppliers, Customers, Warehouses and Locations. The forms these screens already have start working.

This is plain CRUD on mutable rows, per ADR-0002. Reference data is not event-sourced — the boundary test is whether something moves quantity or advances a state machine, and a Supplier's payment terms do neither. Do not route these through the choke point, and do not append Events for them. That is why this ticket does not depend on ticket 09 and can run alongside it.

Authorization is still enforced in the domain function with an explicit Actor, exactly as for stock writes. The rule is universal even though the persistence style differs.

Referential integrity is the database's job here. Deleting a Warehouse that holds stock, or a Category with Products in it, must be prevented by a constraint rather than by a check someone remembered to write.

**Blocked by:** 06 (Roles as database rows), 08 (Retire the generated dataset at runtime).

**Status:** resolved

- [x] Products, Categories, Suppliers, Customers, Warehouses and Locations can be created and edited
- [x] These writes are plain row updates; no Events are appended and the choke point is not used
- [x] Each domain function takes an Actor and enforces permission
- [x] A user whose Role forbids the action is refused even when reaching it directly
- [x] Foreign key constraints prevent deleting records that others depend on
- [x] Server actions validate input and delegate; they contain no business logic
- [x] End-to-end coverage exists for creating and editing at least one record of each kind, and for a permission refusal

## Comments

### 2026-08-30 — done

New domain module `lib/domain/reference.ts`: `create*` / `update*` for all six
entities, plus `deleteCategory` / `deleteWarehouse`. Plain `INSERT` / `UPDATE`
/ `DELETE` — no Events, no choke point (ADR-0002). Every function takes an
`Actor` and calls `assertCan(actor, module, action)` before touching a row
(ADR-0004); it imports no `server-only` code, same as `lib/domain/stock.ts`.
Derived columns are set here, never in a caller — `slug` from the category
name, the `zone-aisle-rack-bin` location `code`, `openedAt` / `since` /
`shortName`, and the activity fields a new record starts flat (`usedPallets`,
`occupiedUnits`, supplier performance rates, all `0`).

Referential integrity is left to the database. `deleteCategory` and
`deleteWarehouse` issue the `DELETE` and translate the foreign-key rejection
(SQLSTATE 23503, unwrapped from Drizzle's `DrizzleQueryError`) into
`ReferenceWriteError("in-use")` — no app-level dependent check. The other four
entities get no delete path in this ticket; the criterion only names Category
and Warehouse, and those are the FK-backed cases.

Six server actions (`app/(app)/**/new/actions.ts`) — one per entity. Each
re-validates its payload with zod at the trust boundary, resolves the Actor
with `getCurrentUser()`, and calls `attempt(() => id ? update… : create…)`,
which maps `ReferenceWriteError` to a `SaveResult` the form renders. No logic
in the action (ADR-0005). The existing forms were switched from their
toast-and-redirect stubs to calling the action; two screens that had no form
yet were added — category edit (`inventory/categories/[id]/edit`) and location
new + edit (`warehousing/locations/new`, `[id]/edit`).

Below-UI coverage: `npm run check:reference`
(`lib/domain/reference.checks.ts`), a CI step after `check:adjustments`. It
calls `createCategory` / `updateProduct` directly as a forbidden Role and
asserts `ReferenceWriteError("forbidden")` with nothing written, and deletes a
seeded Category-with-products and Warehouse-with-stock and asserts the FK
rejects both. Playwright only ever reaches the form, so the direct-call
refusal lives here (same split as ticket 10).

End-to-end: `e2e/reference.write.spec.ts` (`write` project) — one create and
one edit through the real form for each of the six kinds, plus a Role refused
the create screen. Edits round-trip a single field so the seeded records the
read suite asserts against stay put; creates tag their rows with an `E2E`
marker and `test.afterAll` deletes them, mirroring how the adjustment suite
restores the stock it spends.

Verified against a real Neon branch: `tsc` and `eslint` clean, `check:stock` /
`check:adjustments` / `check:reference` green, full Playwright suite 40/40
(29 existing + 4 adjustment + 7 new).

A two-axis review (standards + spec) ran after the first pass. Fixes folded in:
the location `code` was being built in the server action rather than the
domain function; `updateProduct` was resetting `status` and collapsing a
multi-supplier product's `supplierIds` to one on every edit; four unused
`delete*` functions were removed as scope creep.
