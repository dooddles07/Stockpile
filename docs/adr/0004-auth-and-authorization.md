---
status: accepted
---

# Auth.js for identity; authorization enforced in domain functions

Identity, sessions and password flows are handled by Auth.js with the Drizzle adapter, so users and sessions are tables in our own Postgres rather than a vendor's. Authorization is enforced inside the domain functions: every mutation function takes the acting user as its first argument and checks permission before doing anything. Roles and their permissions are database rows, editable at runtime through the admin UI.

## Considered options

Clerk was the stronger option on capability — hosted invitations, MFA, reset flows — and is the native Vercel Marketplace integration. It was rejected on the zero-recurring-cost constraint (ADR-0007) and because it would put identity outside the database while roles stayed inside it, requiring a webhook to keep a local user row in sync.

Checking permissions in the server action layer was rejected because there is already a second caller that is not a request — automation running after commit (ADR-0008) — and a REST layer is likely later. A check at the deepest common choke point cannot be bypassed by an entry point added later.

## Consequences

Existing `can(role, module, action)` calls in pages and components are **rendering gates only**; they hide UI and protect nothing. They stay, but no mutation may rely on them.

Every domain function carries an explicit actor argument, including a system actor used by automation. `ROLES` as a hardcoded array in `lib/auth/permissions.ts` contradicts the runtime permission editor and is replaced by database rows.
