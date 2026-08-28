# 05: Migrate warehousing screens onto the async surface

**What to build:** Every warehousing screen — warehouses, locations, transfers, picking, packing, receiving — reads its data by awaiting the async repository surface instead of importing the generated dataset directly. Roughly 11 files.

To a user, nothing changes. The baseline suite demonstrates it.

This ticket ends green on its own and is independent of the other migration tickets.

Transfers are worth care: a transfer in flight contributes to the in-transit balance, which is derived from open document state rather than from the movement ledger. That derivation moves behind the seam in ticket 02, so screens here consume it rather than computing it. If a screen in this area still calculates an in-transit figure itself, that read belongs in the repository layer.

Permission checks are not touched.

**Blocked by:** 02 (Expand — complete async repository surface).

**Status:** ready-for-agent

- [ ] No warehousing screen imports the generated dataset directly
- [ ] All reads in this area await the async repository surface
- [ ] No screen computes in-transit or other derived balances itself
- [ ] Permission checks are unchanged
- [ ] No visual, behavioral or UX change of any kind
- [ ] Typecheck and build pass
- [ ] The baseline suite from ticket 01 passes unmodified
