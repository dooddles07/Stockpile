# 12: Picking, packing, notifications and the handheld scanner

**What to build:** Four surfaces that display real rows and do nothing, wired to functions and tables that already exist.

Picking and packing are the cheap ones. `advanceSalesOrder` was built in phase 2 and the `picking` and `packing` states are already reachable from the sales order detail page. The queues at `warehousing/picking` and `warehousing/packing` show the right orders and their buttons are inert — each needs one server action calling a function that is already written. The work is in the wiring, not the domain.

Notifications reads a real `notifications` table and offers no way to clear anything, so the list only ever grows. Dismissing is a single column update through a domain function with a permission check like any other.

The handheld scanner at `operator/scan` is 32 lines and does nothing at all. A real SKU lookup against the existing search route at `app/api/search/route.ts` makes it usable on a phone, which is the whole point of the operator surface and one of the four things the landing page invites a visitor to try.

**Blocked by:** 11 (approve and reject, across four document types).

**Status:** open

- [ ] The picking queue advances a Sales Order through the existing `advanceSalesOrder`
- [ ] The packing queue does the same
- [ ] A notification can be dismissed, through a permission-checked domain function, and stays dismissed
- [ ] The handheld scanner looks up a real SKU and shows its stock, using the existing search route
- [ ] Each new action goes through a server action that validates and delegates only
- [ ] End-to-end coverage exists for advancing an order from the picking queue and for dismissing a notification
