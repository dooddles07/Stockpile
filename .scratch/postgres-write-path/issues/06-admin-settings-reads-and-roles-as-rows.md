# 06: Admin and settings reads; Roles become database rows

**What to build:** Users, Roles, audit entries, Automation Rules, integrations and settings exist as tables, are loaded by the seed, and their screens render from Postgres.

The significant part is Roles. Today a hardcoded array defines them while the permission editor implies they are editable at runtime — a contradiction recorded in ADR-0004 that could not be resolved without a database. This ticket resolves it: Roles and their permissions become rows, and the permission engine reads them from Postgres.

This gates the write path. Domain functions enforce permission per ADR-0004, and they cannot do that against a hardcoded array that the admin UI claims is editable.

Permission checks in pages and components stay exactly as they are for now — still rendering gates, still protecting nothing. They read their answers from the database instead of the array. Moving enforcement into domain functions is ticket 09.

Automation Rules keep their untyped free-text trigger, condition and action fields. ADR-0008 records that the vocabulary is undefined; modelling it is not this ticket and not this phase.

This ticket runs in parallel with 03, 04 and 05.

**Blocked by:** 02 (Inventory schema, seed, and reads from Postgres).

**Status:** resolved

- [x] Schema covers Users, Roles and their permissions, audit entries, Automation Rules, integrations and settings
- [x] The hardcoded role array is gone; the permission engine reads Roles from Postgres
- [x] The seed script loads this area, including the existing roles, from the generated dataset
- [x] Admin and settings repository function bodies query Postgres; their signatures are unchanged
- [x] Existing permission checks in pages and components behave identically, sourced from the database
- [x] Automation Rule trigger, condition and action fields are left untyped
- [x] The Playwright suite passes unmodified, including role-switching behaviour

## Comments

**2026-08-29** — Done across three commits (schema / seed / reads).

- Tables added: `users`, `roles`, `audit_entries`, `automation_rules`,
  `automation_runs`, `integrations`. Roles hold their permission map in one
  `permissions` jsonb column, not a join table — no write path against them
  until ticket 09. `users.role` is a real FK into `roles`.
- **No `settings` table.** The dataset carries no settings entity, so one
  would seed empty. The settings screens already render from Postgres —
  their company / security / product figures come from `reference.users`,
  `warehouses` and `products` — and are otherwise static copy. Flag if a
  real settings table is wanted anyway.
- The permission engine keeps `can()` / `levelFor()` synchronous. It
  hydrates a module-level matrix from the `roles` rows: the server in
  `getRole()` via a request-cached `ensureRoles()`, the client in
  `<RoleProvider>` from a `roles` prop. `lib/auth/permissions.ts` carries a
  `ponytail:` note that this global becomes per-request state once roles
  are runtime-editable.
- `/admin/roles/[id]` and its edit page now render on demand
  (`generateStaticParams` returns `[]`) — the build has no `DATABASE_URL`,
  so they can't be prerendered from the table.
- `notifications` and `tasks` in `lib/repo/ops.ts` stay on the in-memory
  dataset — not in this ticket's entity list, no table yet.
- typecheck clean, lint 0 errors, `db:seed` round-trips the matrix,
  Playwright 29/29 unmodified.
