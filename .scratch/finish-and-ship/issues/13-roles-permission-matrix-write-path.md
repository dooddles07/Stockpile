# 13: The roles permission matrix, actually editable

**What to build:** An administrator changes a Role's permissions in the existing editor, saves, and the change takes effect on the next request.

ADR-0004 says roles and their permissions are "database rows, editable at runtime through the admin UI". Half of that is true. Roles became rows in phase 2, `hydrateRoles` loads them into the permission engine per request, and every mutation calls `can()` against them. The editor at `admin/roles/[id]/edit/permission-editor.tsx` computes exactly which entries changed, reports it accurately, and then calls `toast.success` without saving anything. The ADR is currently a description of something that does not happen.

This is the highest-leverage remaining fake in the application, because it is the control surface over every other permission check in the system. Editing a role and then watching a previously permitted action be refused is the clearest possible demonstration that authorization is enforced in the domain layer rather than in the UI.

Two guards belong in the domain function. Editing permissions is itself a permission, so a Role cannot grant itself capabilities it lacks by editing itself unless it holds the `roles` permission already. And the last Role holding the `roles` permission must not be able to remove it from itself, or the system locks everyone out of its own permission editor with no way back except a reseed.

**Blocked by:** 12 (picking, packing, notifications and the handheld scanner).

**Status:** resolved

- [x] An `updateRolePermissions(actor, roleId, matrix, db)` domain function exists and checks permission first
- [x] The change is written in one transaction and an audit entry records who changed what
- [x] The last Role holding the `roles` permission cannot remove it from itself
- [x] The editor saves through a server action that validates and delegates only
- [x] A saved change takes effect on the next request, through the existing `hydrateRoles`
- [x] A Role that forbids editing roles is refused when reaching the domain function directly
- [x] End-to-end coverage exists for removing a permission from a Role and then finding the corresponding action refused

## Comments

**2026-09-03** — Implemented.

- `lib/domain/roles.ts`: `updateRolePermissions(actor, roleId, matrix, db)`. Checks `can(actor.role, "roles", "manage")` before anything, then validates every module/level in the matrix (the domain is the trust boundary per ADR-0004, not the action). In one `FOR UPDATE` transaction it merges the matrix, writes the `roles.permissions` column and inserts one `permission-change` audit entry attributed to the actor. Refuses with `last-admin` when the edit would leave no Role holding `roles: manage` (only that level expands to the `manage` action).
- `app/(app)/admin/roles/[id]/edit/actions.ts`: `saveRolePermissionsAction` — zod shape-check, actor from session, delegate, `revalidatePath("/", "layout")`. No logic (ADR-0005).
- `permission-editor.tsx`: the `save` handler that used to call `toast.success` and nothing else now calls the action inside a transition.
- No cache work needed for "takes effect next request" — `ensureRoles` already re-runs `hydrateRoles` per request off a plain `cache()` accessor.
- Coverage: `npm run check:roles` (forbidden / last-admin / persist+audit+hydrate, all self-reverting); `e2e/roles-permission-matrix.write.spec.ts` narrows Inventory Manager's `adjustments` to none through the editor and asserts that role is then refused `/inventory/adjustments`.
- `npm run check:notifications` and `check:approvals` fail locally on pre-existing migration drift (missing `notifications.dismissed` column) — unrelated to this change; `check:roles` and `check:adjustments` pass.
