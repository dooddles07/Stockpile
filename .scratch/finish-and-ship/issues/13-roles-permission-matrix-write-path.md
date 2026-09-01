# 13: The roles permission matrix, actually editable

**What to build:** An administrator changes a Role's permissions in the existing editor, saves, and the change takes effect on the next request.

ADR-0004 says roles and their permissions are "database rows, editable at runtime through the admin UI". Half of that is true. Roles became rows in phase 2, `hydrateRoles` loads them into the permission engine per request, and every mutation calls `can()` against them. The editor at `admin/roles/[id]/edit/permission-editor.tsx` computes exactly which entries changed, reports it accurately, and then calls `toast.success` without saving anything. The ADR is currently a description of something that does not happen.

This is the highest-leverage remaining fake in the application, because it is the control surface over every other permission check in the system. Editing a role and then watching a previously permitted action be refused is the clearest possible demonstration that authorization is enforced in the domain layer rather than in the UI.

Two guards belong in the domain function. Editing permissions is itself a permission, so a Role cannot grant itself capabilities it lacks by editing itself unless it holds the `roles` permission already. And the last Role holding the `roles` permission must not be able to remove it from itself, or the system locks everyone out of its own permission editor with no way back except a reseed.

**Blocked by:** 12 (picking, packing, notifications and the handheld scanner).

**Status:** open

- [ ] An `updateRolePermissions(actor, roleId, matrix, db)` domain function exists and checks permission first
- [ ] The change is written in one transaction and an audit entry records who changed what
- [ ] The last Role holding the `roles` permission cannot remove it from itself
- [ ] The editor saves through a server action that validates and delegates only
- [ ] A saved change takes effect on the next request, through the existing `hydrateRoles`
- [ ] A Role that forbids editing roles is refused when reaching the domain function directly
- [ ] End-to-end coverage exists for removing a permission from a Role and then finding the corresponding action refused
