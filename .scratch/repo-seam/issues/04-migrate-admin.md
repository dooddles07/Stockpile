# 04: Migrate admin screens onto the async surface

**What to build:** Every admin screen — users, roles, audit logs, automation, integrations — reads its data by awaiting the async repository surface instead of importing the generated dataset directly. Roughly 12 files.

To a user, nothing changes. The baseline suite demonstrates it.

This ticket ends green on its own and is independent of the other migration tickets.

Two things in this area are known to be wrong and are deliberately left wrong. Roles are a hardcoded array while the permission editor implies they are editable at runtime; that contradiction is recorded in ADR-0004 and cannot be resolved without a database. Automation rules carry untyped free-text triggers, conditions and actions, so the rule builder sits on a type with no semantics; that is recorded in ADR-0008. Neither is in scope here.

Permission checks are not touched, including in the roles and users screens where the temptation is strongest.

**Blocked by:** 02 (Expand — complete async repository surface).

**Status:** ready-for-agent

- [ ] No admin screen imports the generated dataset directly
- [ ] All reads in this area await the async repository surface
- [ ] Permission checks are unchanged
- [ ] The hardcoded roles array and the untyped automation rule shape are left as they are
- [ ] No visual, behavioral or UX change of any kind
- [ ] Typecheck and build pass
- [ ] The baseline suite from ticket 01 passes unmodified
