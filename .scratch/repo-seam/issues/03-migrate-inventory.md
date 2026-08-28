# 03: Migrate inventory screens onto the async surface

**What to build:** Every inventory screen — products, stock levels, movements, adjustments, categories, stock counts — reads its data by awaiting the async repository surface instead of importing the generated dataset directly. Roughly 15 files, the largest area in the codebase.

To a user, nothing changes. Every figure, every table, every ordering is exactly what it was. That is the entire point, and the baseline suite is how it is demonstrated rather than asserted.

This ticket ends green on its own, because the synchronous surface still exists for every area that has not yet been migrated. It is independent of the other migration tickets and can run in parallel with them.

Permission checks are not touched. The `can(role, module, action)` calls in these screens stay exactly as they are, including the fact that they gate rendering rather than enforce access. Moving authorization into domain functions is separate work under ADR-0004 and must not be entangled with this.

Screens in this area will reveal things worth improving. Those observations belong in new tickets, not in this one. A phase whose value is "provably nothing changed" loses that value the moment something changes.

**Blocked by:** 02 (Expand — complete async repository surface).

**Status:** ready-for-agent

- [ ] No inventory screen imports the generated dataset directly
- [ ] All reads in this area await the async repository surface
- [ ] Permission checks are unchanged
- [ ] No visual, behavioral or UX change of any kind
- [ ] Typecheck and build pass
- [ ] The baseline suite from ticket 01 passes unmodified
