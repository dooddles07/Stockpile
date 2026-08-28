# 06: Migrate purchasing screens onto the async surface

**What to build:** Every purchasing screen — purchase orders, goods received, suppliers, supplier returns — reads its data by awaiting the async repository surface instead of importing the generated dataset directly. Roughly 10 files.

To a user, nothing changes. The baseline suite demonstrates it.

This ticket ends green on its own and is independent of the other migration tickets.

As with transfers, the incoming balance is derived from open purchase order state rather than from the movement ledger, and that derivation lives behind the seam after ticket 02. Screens here consume it rather than computing it.

Permission checks are not touched.

**Blocked by:** 02 (Expand — complete async repository surface).

**Status:** ready-for-agent

- [ ] No purchasing screen imports the generated dataset directly
- [ ] All reads in this area await the async repository surface
- [ ] No screen computes incoming or other derived balances itself
- [ ] Permission checks are unchanged
- [ ] No visual, behavioral or UX change of any kind
- [ ] Typecheck and build pass
- [ ] The baseline suite from ticket 01 passes unmodified
