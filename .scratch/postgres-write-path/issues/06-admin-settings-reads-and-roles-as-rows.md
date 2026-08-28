# 06: Admin and settings reads; Roles become database rows

**What to build:** Users, Roles, audit entries, Automation Rules, integrations and settings exist as tables, are loaded by the seed, and their screens render from Postgres.

The significant part is Roles. Today a hardcoded array defines them while the permission editor implies they are editable at runtime — a contradiction recorded in ADR-0004 that could not be resolved without a database. This ticket resolves it: Roles and their permissions become rows, and the permission engine reads them from Postgres.

This gates the write path. Domain functions enforce permission per ADR-0004, and they cannot do that against a hardcoded array that the admin UI claims is editable.

Permission checks in pages and components stay exactly as they are for now — still rendering gates, still protecting nothing. They read their answers from the database instead of the array. Moving enforcement into domain functions is ticket 09.

Automation Rules keep their untyped free-text trigger, condition and action fields. ADR-0008 records that the vocabulary is undefined; modelling it is not this ticket and not this phase.

This ticket runs in parallel with 03, 04 and 05.

**Blocked by:** 02 (Inventory schema, seed, and reads from Postgres).

**Status:** ready-for-agent

- [ ] Schema covers Users, Roles and their permissions, audit entries, Automation Rules, integrations and settings
- [ ] The hardcoded role array is gone; the permission engine reads Roles from Postgres
- [ ] The seed script loads this area, including the existing roles, from the generated dataset
- [ ] Admin and settings repository function bodies query Postgres; their signatures are unchanged
- [ ] Existing permission checks in pages and components behave identically, sourced from the database
- [ ] Automation Rule trigger, condition and action fields are left untyped
- [ ] The Playwright suite passes unmodified, including role-switching behaviour
