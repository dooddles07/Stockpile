# 04: Migrate admin screens onto the async surface

**What to build:** Every admin screen — users, roles, audit logs, automation, integrations — reads its data by awaiting the async repository surface instead of importing the generated dataset directly. Roughly 12 files.

To a user, nothing changes. The baseline suite demonstrates it.

This ticket ends green on its own and is independent of the other migration tickets.

Two things in this area are known to be wrong and are deliberately left wrong. Roles are a hardcoded array while the permission editor implies they are editable at runtime; that contradiction is recorded in ADR-0004 and cannot be resolved without a database. Automation rules carry untyped free-text triggers, conditions and actions, so the rule builder sits on a type with no semantics; that is recorded in ADR-0008. Neither is in scope here.

Permission checks are not touched, including in the roles and users screens where the temptation is strongest.

**Blocked by:** 02 (Expand — complete async repository surface).

**Status:** resolved

- [x] No admin screen imports the generated dataset directly
- [x] All reads in this area await the async repository surface
- [x] Permission checks are unchanged
- [x] The hardcoded roles array and the untyped automation rule shape are left as they are
- [x] No visual, behavioral or UX change of any kind
- [x] Typecheck and build pass
- [x] The baseline suite from ticket 01 passes unmodified

## Comments

All 12 `app/(app)/admin/**/page.tsx` files migrated. No admin screen imports
`@/lib/data/store` any more (`grep` is clean across the area); every former
`db.*` read awaits `lib/repo/{ops,reference,inventory}.ts` —
`auditEntries`, `automationRules`, `automationRuns`, `integrations`, the
async `users`/`warehouses` accessors, `userById`, and `indexById()` for the
screens that do many id lookups at render time (audit log, role detail,
users list). The `can(role, …)` / `levelFor` calls are byte-for-byte
unchanged. `ROLES` still drives the permission matrix and
`generateStaticParams`; the `AutomationRule` type is untouched. `npx tsc
--noEmit`, `npx eslint .` (0 errors, 1 pre-existing unrelated warning),
`npm run build` and `npx playwright test` (29/29, the ticket 01 baseline)
all pass.

Review (`mattpocock-skills:code-review`, this ticket as spec source) ran
Standards and Spec in parallel. Neither found a hard violation or an
incorrect implementation; iteration order and every rendered figure are
preserved (Standards confirmed `indexById` insertion order equals the old
`db.*` array order and all uses are `.get()` lookups; Spec walked the
acceptance checklist and every item passes). One nit acted on: the
`automation/[id]` detail screen had an inline `await userById(...)` inside
its `fields={[…]}` array; hoisted to the top of the component body to match
the pattern ticket 03 set. Observations logged for later tickets, not acted
on here:

- `audit-logs`, `users` and `roles/[id]` now rebuild entity `Map`s per
  request instead of using the process-level `*ByIdSync` singletons — a
  perf regression invisible to users, and the phase-2 screen-shaped-join
  fix, same as ticket 03 recorded.
- Role-holder counting is hand-rolled off the raw `users()` accessor in
  three admin screens and the definition already differs (`roles/[id]/edit`
  filters `status === "active"`, `roles/[id]` does not — a pre-existing
  discrepancy this migration surfaces, does not introduce). A
  `holdersOf(roleId)` reader on the repository surface would collapse all
  three.

