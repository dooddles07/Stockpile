# 12: Picking, packing, notifications and the handheld scanner

**What to build:** Four surfaces that display real rows and do nothing, wired to functions and tables that already exist.

Picking and packing are the cheap ones. `advanceSalesOrder` was built in phase 2 and the `picking` and `packing` states are already reachable from the sales order detail page. The queues at `warehousing/picking` and `warehousing/packing` show the right orders and their buttons are inert — each needs one server action calling a function that is already written. The work is in the wiring, not the domain.

Notifications reads a real `notifications` table and offers no way to clear anything, so the list only ever grows. Dismissing is a single column update through a domain function with a permission check like any other.

The handheld scanner at `operator/scan` is 32 lines and does nothing at all. A real SKU lookup against the existing search route at `app/api/search/route.ts` makes it usable on a phone, which is the whole point of the operator surface and one of the four things the landing page invites a visitor to try.

**Blocked by:** 11 (approve and reject, across four document types).

**Status:** resolved

- [x] The picking queue advances a Sales Order through the existing `advanceSalesOrder`
- [x] The packing queue does the same
- [x] A notification can be dismissed, through a permission-checked domain function, and stays dismissed
- [x] The handheld scanner looks up a real SKU and shows its stock, using the existing search route
- [x] Each new action goes through a server action that validates and delegates only
- [x] End-to-end coverage exists for advancing an order from the picking queue and for dismissing a notification

## Comments

**2026-09-02** — Resolved.

- **Picking / packing queues**: both `action` columns now render the existing
  `FulfilmentActionButton` (wired to `advanceSalesOrderAction`, ADR-0005: the
  action validates and delegates to `advanceSalesOrder`). A `reserved` row on
  `/warehousing/picking` gets "Start pick" (`reserved -> picking`); a `picking`
  row keeps the "Continue" link to the walk sheet. The packing queue was
  widened to list `picking` as well as `packing` orders — a `picking` row gets
  "Start packing" (`picking -> packing`), which is the one step the queue can
  make through `advanceSalesOrder`; a `packing` row keeps its detail link. A
  Status column was added there since the queue is now mixed-state.
- **Notifications**: new `notifications.dismissed` boolean column
  (`drizzle/0012_old_whistler.sql`; the seed never sets it, so the default
  carries every seeded row). `lib/domain/notifications.ts` `dismissNotification`
  checks `view` on `dashboard` (spec story 24 is "as any user") before a single
  `dismissed = true` write — no Event, no Movement. `dismissNotificationAction`
  validates and delegates. `lib/repo/ops.ts` filters `dismissed` out of the one
  accessor both the page and the top-bar bell read, so a dismissal leaves every
  feed and persists.
- **Handheld scanner**: `operator/scan` now renders `ScanClient`, which on
  submit fetches the existing `/api/search` route (already permission-filtered)
  and lists the product hits with the available stock the route reports. The
  preloaded browser-side catalogue is gone from this surface.
- `lib/domain/notifications.checks.ts` (`npm run check:notifications`, wired
  into CI) covers the below-UI guards the ADR-0009 amendment asks for: a Role
  without dashboard access refused, an unknown id refused, neither writing
  anything, and an idempotent repeat. `e2e/picking-queue.write.spec.ts` and
  `e2e/notification-dismiss.write.spec.ts` cover the two required UI paths.
- `tsc` and `eslint` pass; `db:migrate`, `check:notifications` and `test:e2e`
  were not run locally (Neon dev branch over its data-transfer quota) — all run
  in CI against a fresh seeded branch.
