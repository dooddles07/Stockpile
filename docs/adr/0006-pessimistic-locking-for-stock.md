---
status: accepted
---

# Stock concurrency uses `SELECT ... FOR UPDATE`, not stream versions

Concurrent writes to the same stock are serialized with a pessimistic row lock: inside the transaction, lock the `stock_rows` row for that product and location, read the balance, append the event, update the projection, commit.

This deliberately departs from event-sourcing orthodoxy, which uses optimistic concurrency on a per-aggregate stream version. That approach exists because a dedicated event store cannot participate in a transaction with the read model. ADR-0003 chose a single database precisely so that transactions are available, and this uses them: no version column, no conflict detection, no retry loop, and therefore no way for a caller to forget to handle a conflict.

## Consequences

Writes to the same product and location serialize. Contention is per product-location rather than global, which is not a throughput concern at one business's volume.

This requires interactive transactions, so the Neon HTTP driver cannot be used (see ADR-0003).

The invariant worth checking in production: the projected `onHand` must always equal the sum of the replayed movement events for that product and location.
