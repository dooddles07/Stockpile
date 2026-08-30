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

**Status:** resolved

- [x] An append-only Event table exists and nothing updates or deletes its rows
- [x] One function is the sole code path that appends an Event or updates a stock projection
- [x] Within its transaction the order is: permission check, lock, read, append, project, commit
- [x] The Actor is a required first argument, and a system Actor exists for automation
- [x] An operation that would drive on-hand below zero is rejected inside the transaction
- [x] A failure partway through leaves no Event and no projection change
- [x] A concurrency check runs two simultaneous operations on the same Product and Location and asserts the resulting balance is correct
- [x] A reconciliation check replays the Event stream and asserts it equals projected on-hand, for on-hand and damaged only
- [x] Both checks run in CI against a seeded Neon branch

## Comments

### 2026-08-30 — done

The choke point is `applyStockChange(actor, input, db)` in `lib/domain/stock.ts`.
Order inside `db.transaction`: `can()` permission check, then reason present,
then `SELECT ... FOR UPDATE` on the affected `stock_rows` holding, read the
balance, reject if on-hand (or damaged) would go negative, append one `events`
row, update the `stock_rows` projection and insert the `movements` ledger row,
commit. It imports no `server-only` code — the caller passes the Drizzle
handle (`getDb()` on the request path, an own `Pool` for the checks and any
future REST caller) — so ticket 10's server action is the first place
`server-only` re-enters.

`SYSTEM_ACTOR` (id `system`, `super-admin`) is exported for automation;
`events.actor_id` / `movements.user_id` carry no FK so it is a constant, not a
row, until attribution needs a joinable name (ticket 17).

Migration `0009_events_append_only.sql` adds a `BEFORE UPDATE OR DELETE` row
trigger on `events` that raises — append-only is enforced by the database, not
convention. `TRUNCATE` still works (statement-level, different trigger event),
so the seed's re-seed reset is unaffected; `seed.ts` now truncates `events`
too so every run starts from an empty stream.

Two checks in `lib/domain/stock.checks.ts`, run by `npm run check:stock` as a
CI step after migrate + seed (ADR-0009's named gap):

- Concurrency — two `applyStockChange` calls fired with `Promise.all` against
  the same holding, each `-1`; asserts final on-hand is exactly `before - 2`,
  i.e. they serialized rather than lost an update.
- Reconciliation — replays the movement-type events and asserts every
  holding's summed `onHandDelta` / `damagedDelta` equals its projected change,
  for on-hand and damaged only; reserved / incoming / in-transit are asserted
  unchanged (they project from open Document state, not Movements).

Verified against a real Neon branch: `check:stock` green (concurrency 56→54;
reconciliation over 634 holdings), trigger blocks UPDATE and DELETE and allows
TRUNCATE, `npx tsc` and `npx eslint` clean, all 29 Playwright tests pass
unchanged.
