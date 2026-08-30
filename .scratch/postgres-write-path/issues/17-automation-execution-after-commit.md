# 17: Automation execution after commit

**What to build:** The mechanism that runs Automation Rules. When a transaction that appended an Event commits, matching rules evaluate immediately in the same request, and each evaluation is recorded as a run with its outcome.

Timing is the decision this ticket implements. A rule must never run inside the transaction, because it would act on a change that may still roll back — alerting someone about a shipment that never happened. It runs after commit, which is also why an alert fires the moment stock crosses its reorder point rather than up to a day later.

A failing rule must not fail the operation that triggered it. A broken alert is an annoyance; a broken alert that stops a warehouse shipping is an outage. Failures are recorded as failed runs and the triggering operation succeeds regardless.

Rule actions run on the user's request path, so they must stay cheap. Anything slow makes a warehouse operation feel slow, and that is a real cost paid by the person using the system.

Automation acts as the system Actor established in ticket 09, so anything it changes is attributable rather than anonymous.

Scope boundary worth stating plainly: this ticket builds the engine, not the language. Per ADR-0008 the trigger, condition and action fields are untyped free text and the rule builder sits on a type with no semantics. Modelling that vocabulary is separate work, and until it is done this mechanism can execute rules while having no rules worth executing. Verify it against a minimal hardcoded rule rather than waiting for the vocabulary.

**Blocked by:** 09 (The choke point and the Event stream).

**Status:** resolved

- [x] Matching rules evaluate after the transaction commits, never inside it
- [x] A rolled-back operation triggers no rule evaluation
- [x] A failing rule is recorded as a failed run and does not fail the triggering operation
- [x] Each evaluation is recorded as a run with its outcome
- [x] Automation acts as the system Actor and its changes are attributable
- [x] The mechanism is verified against a minimal hardcoded rule
- [x] The trigger, condition and action vocabulary is left unmodelled

## Comments

### 2026-08-30 — done

`runAutomation(db, eventSeqs)` in `lib/domain/automation.ts` is the mechanism.
Every request-path domain function that appends Events (`receiveGoods`,
`shipSalesOrder`, `dispatchTransfer`, `receiveTransfer`, `recordAdjustment`,
`completeStockCount`, `processReturn`) calls it once, straight after its
`db.transaction(...)` resolves, passing the `seq` of every Event that
transaction wrote (each `applyStockChange` returns `eventSeq`).

- **After commit, never inside.** The call sits after `await db.transaction(...)`.
  It is passed the pooled `db`, not the `tx`, so the rules run against a
  committed stream.
- **Rolled back → nothing.** A rejected operation appends no Event and collects
  no seq, so `runAutomation` is handed an empty list and returns immediately.
- **Passing seqs, not a stream cursor.** An earlier draft tracked a stream
  position in a locked single-row `automation_cursor` table; that put a global
  `FOR UPDATE` on the request path, against ADR-0006 (contention stays per
  product-location) and ADR-0008 (rule actions must stay cheap). Passing the
  just-committed seqs keeps each request evaluating only its own Events with no
  shared lock.
- **Failing rule.** Each rule evaluation is wrapped: a throw becomes a `failed`
  `automation_runs` row, not a rejected request. The whole function is wrapped
  again so an engine-level fault is swallowed and logged.
- **Attribution.** Every run row carries `actor_id = "system"` (`SYSTEM_ACTOR`,
  name `Automation`) — a new `automation_runs.actor_id` column, defaulted so the
  seeded history reads back attributed. Same designated-Actor handling as
  `events.actor_id` / `movements.user_id`; no `users` row, consistent with
  ticket 09.
- **Hardcoded rule.** The one executable rule is bound by id to the seeded
  `AUT-001` ("Low stock alert…", trigger "Available quantity falls below
  reorder point"): when a Movement takes a product's on-hand across its reorder
  point, a `success` run is recorded. Its free-text `trigger` / `conditions` /
  `actions` are never parsed — the id-to-handler binding is the whole model, and
  modelling the vocabulary stays out of scope (ADR-0008). The rule's own
  `runCount` / `successRate` / `lastRunAt` rollups are left as the dataset set
  them; the `automation_runs` rows are the record.

Verified against the Neon `ci` branch: `check:automation` (new,
`lib/domain/automation.checks.ts`, wired into CI after `check:returns`) covers
the after-commit success run, the rolled-back no-op, and the failing-rule
isolation via a throwaway canary rule. All eight sibling check scripts, `tsc`
and `eslint` stay green; the full Playwright suite is unchanged and runs in CI.
