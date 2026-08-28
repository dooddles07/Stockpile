---
status: accepted
---

# Single-tenant: one deployment serves one business

Stockpile serves a single company, so no table carries a tenant identifier and no query is tenant-scoped. This is deliberate rather than an oversight: there is no second customer, and multi-tenancy would make every schema and query decision more expensive from day one.

## Consequences

If Stockpile is later sold to multiple businesses, the retrofit is a tenant column on every table, a scoping guard on every query, and a data migration. Prefer running a separate deployment and database per customer over adding tenant scoping to a live schema.
