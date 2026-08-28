# 07: Migrate sales screens onto the async surface

**What to build:** Every sales screen — customers, orders, order fulfilment, customer returns — reads its data by awaiting the async repository surface instead of importing the generated dataset directly. Roughly 8 files.

To a user, nothing changes. The baseline suite demonstrates it.

This ticket ends green on its own and is independent of the other migration tickets.

The reserved balance is derived from open sales order state rather than from the movement ledger, and that derivation lives behind the seam after ticket 02. Screens here consume it rather than computing it.

Permission checks are not touched.

**Blocked by:** 02 (Expand — complete async repository surface).

**Status:** ready-for-agent

- [ ] No sales screen imports the generated dataset directly
- [ ] All reads in this area await the async repository surface
- [ ] No screen computes reserved or other derived balances itself
- [ ] Permission checks are unchanged
- [ ] No visual, behavioral or UX change of any kind
- [ ] Typecheck and build pass
- [ ] The baseline suite from ticket 01 passes unmodified
