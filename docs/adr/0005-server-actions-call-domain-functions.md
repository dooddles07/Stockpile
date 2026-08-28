---
status: accepted
---

# Server actions contain no logic

Every mutation is a server action, but the action does nothing except validate its input with zod and call a plain async function in `lib/domain` that owns the transaction and the permission check. Business logic never lives in an action.

The action is one of several possible entry points: automation calls the same domain functions after commit, and a REST layer for the integrations feature will call them later. Keeping the logic out of the action is free — it is a convention, not an abstraction — and it means adding the REST layer is a thin wrapper rather than a rewrite.

## Consequences

A reviewer seeing an action that looks like a pass-through should leave it that way. Logic creeping into actions is the failure mode this ADR exists to prevent.
