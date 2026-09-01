# 05: Document numbers allocated by the database

**What to build:** A number allocator for every document type that can be created, backed by a Postgres sequence per type, allocated inside the creating transaction, with a unique index on each `number` column.

Every document number in the system today came from the seed's counters — `PO-2026-1000` plus an index, and the same shape for `SO`, `TR`, `CNT`, `ADJ`, `SR` and `PR`. The `number` columns are plain `text().notNull()` with no unique constraint, because nothing has ever allocated one at runtime. Every creation ticket that follows needs one.

A sequence is the right mechanism rather than `max(number) + 1` because ADR-0010 puts every visitor on the same shared account: two people clicking "create" at the same moment is the normal case here, not an edge case, and a read-then-increment races even inside a transaction unless it takes a lock nothing else needs. `nextval` does not race, does not lock, and does not roll back — a rolled-back creation burns a number, which is correct behaviour for a document number and not a defect.

The trap is the seed. Each sequence must be advanced past the highest number the seed loaded, in the seed script itself, or the first document a visitor creates collides with a seeded one and the unique index turns it into an error on screen. That has to happen every time the seed runs, including during the daily reset.

This ticket is the riskiest small piece of work in the phase: everything from 06 to 10 depends on it, and its failure mode is a duplicate-key error in front of a visitor.

**Blocked by:** 04 (the daily reset, and a smoke test against the live instance).

**Status:** open

- [ ] A migration adds one sequence per creatable document type and a unique index on each `number` column
- [ ] A single allocator function returns the next formatted number for a given document type, taking the open transaction
- [ ] The number format matches the seeded one exactly, so a created document is indistinguishable in shape from a seeded one
- [ ] `db:seed` advances every sequence past the highest number it loaded, on every run
- [ ] A check proves two concurrent allocations of the same document type return two different numbers
- [ ] A check proves a rolled-back creation leaves no document and does not reuse a burned number
