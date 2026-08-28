# 09: The choke point and the Event stream

**What to build:** The single function through which every stock change in Stockpile will pass, and the append-only Event stream it writes to. This ticket builds no screen and no server action; it builds the thing all of them will depend on, and proves it works.

The function is the only code in the codebase permitted to append an Event or update a stock projection. Every operation that moves quantity — receipt, shipment, transfer, adjustment, count correction, damage, return — routes through it. That is what makes ADR-0006's guarantee hold: a lock taken in one place cannot be forgotten in another.

The sequence inside the transaction is fixed and the order matters. Check the Actor's permission. Lock the affected Stock Row for update. Read the current balance. Append the Event. Update the projection. Commit. Locking before reading is not a detail — reading first reintroduces exactly the race the lock exists to prevent.

An operation that would drive on-hand below zero is rejected inside the transaction rather than recorded as a negative balance.

The Actor is the first argument and is not optional. ADR-0004 puts enforcement here rather than in the action layer, because automation and any future REST layer are callers that never pass through a server action. Automation acts as a designated system Actor rather than as nobody. The Actor parameter belongs in this function from the outset; retrofitting it after several domain functions exist means revisiting all of them.

Two checks below the UI are part of this ticket, not deferred. ADR-0009 chose end-to-end tests as the strategy and named this as its known gap: Playwright cannot express either of these, and they verify the riskiest decision in the design.

The concurrency check issues two simultaneous operations against the same Product and Location and asserts the final balance is correct — not merely that both succeeded.

The reconciliation check replays the Event stream and asserts the sum equals the projected on-hand. It applies to on-hand and damaged only. Reserved, incoming and in-transit are projected from open Document state and no Movement produces them, so including them in this check is a bug.

**Blocked by:** 06 (Roles as database rows), 08 (Retire the generated dataset at runtime).

**Status:** ready-for-agent

- [ ] An append-only Event table exists and nothing updates or deletes its rows
- [ ] One function is the sole code path that appends an Event or updates a stock projection
- [ ] Within its transaction the order is: permission check, lock, read, append, project, commit
- [ ] The Actor is a required first argument, and a system Actor exists for automation
- [ ] An operation that would drive on-hand below zero is rejected inside the transaction
- [ ] A failure partway through leaves no Event and no projection change
- [ ] A concurrency check runs two simultaneous operations on the same Product and Location and asserts the resulting balance is correct
- [ ] A reconciliation check replays the Event stream and asserts it equals projected on-hand, for on-hand and damaged only
- [ ] Both checks run in CI against a seeded Neon branch
