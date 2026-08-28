# 17: Automation execution after commit

**What to build:** The mechanism that runs Automation Rules. When a transaction that appended an Event commits, matching rules evaluate immediately in the same request, and each evaluation is recorded as a run with its outcome.

Timing is the decision this ticket implements. A rule must never run inside the transaction, because it would act on a change that may still roll back — alerting someone about a shipment that never happened. It runs after commit, which is also why an alert fires the moment stock crosses its reorder point rather than up to a day later.

A failing rule must not fail the operation that triggered it. A broken alert is an annoyance; a broken alert that stops a warehouse shipping is an outage. Failures are recorded as failed runs and the triggering operation succeeds regardless.

Rule actions run on the user's request path, so they must stay cheap. Anything slow makes a warehouse operation feel slow, and that is a real cost paid by the person using the system.

Automation acts as the system Actor established in ticket 09, so anything it changes is attributable rather than anonymous.

Scope boundary worth stating plainly: this ticket builds the engine, not the language. Per ADR-0008 the trigger, condition and action fields are untyped free text and the rule builder sits on a type with no semantics. Modelling that vocabulary is separate work, and until it is done this mechanism can execute rules while having no rules worth executing. Verify it against a minimal hardcoded rule rather than waiting for the vocabulary.

**Blocked by:** 09 (The choke point and the Event stream).

**Status:** ready-for-agent

- [ ] Matching rules evaluate after the transaction commits, never inside it
- [ ] A rolled-back operation triggers no rule evaluation
- [ ] A failing rule is recorded as a failed run and does not fail the triggering operation
- [ ] Each evaluation is recorded as a run with its outcome
- [ ] Automation acts as the system Actor and its changes are attributable
- [ ] The mechanism is verified against a minimal hardcoded rule
- [ ] The trigger, condition and action vocabulary is left unmodelled
