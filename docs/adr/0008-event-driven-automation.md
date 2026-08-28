---
status: accepted
---

# Automation rules run in-process after commit; there is no scheduler

When a transaction that appends an event commits, matching automation rules evaluate immediately in the same request. There is no cron job, no queue and no background worker.

Event sourcing already produces the exact trigger signal a rule needs — "stock fell below its reorder point" is an event, not something to discover by polling — so a scheduler would add infrastructure and a delay to obtain something already available for free. This also fits the zero-cost constraint (ADR-0007), where free-tier cron quotas are tight.

## Consequences

Rule actions run on the user's request path and must stay cheap; anything slow makes a warehouse operation feel slow.

Genuinely time-based rules ("every Monday") have no triggering event and are not covered by this mechanism. When one is actually needed, a scheduled GitHub Actions workflow calling an authenticated endpoint is the free option — add it then, not before.

**Amendment: that scheduler now exists, for a different reason.** ADR-0010 introduced a daily GitHub Actions cron to reset the public demo data. This ADR's decision is unchanged — automation rules still run in-process after commit and are not moved onto a schedule — but the claim that no scheduler exists is no longer true. A future time-based rule can reuse that workflow rather than justify a new one.

`AutomationRule.trigger`, `conditions` and `actions` are currently untyped free text (`string` and `string[]`). The trigger, condition and action vocabulary must be modelled before automation can do anything real; the rule-builder UI presently sits on a type with no semantics.
