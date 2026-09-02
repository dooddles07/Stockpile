# 05: Document numbers allocated by the database

**What to build:** A number allocator for every document type that can be created, backed by a Postgres sequence per type, allocated inside the creating transaction, with a unique index on each `number` column.

Every document number in the system today came from the seed's counters — `PO-2026-1000` plus an index, and the same shape for `SO`, `TR`, `CNT`, `ADJ`, `SR` and `PR`. The `number` columns are plain `text().notNull()` with no unique constraint, because nothing has ever allocated one at runtime. Every creation ticket that follows needs one.

A sequence is the right mechanism rather than `max(number) + 1` because ADR-0010 puts every visitor on the same shared account: two people clicking "create" at the same moment is the normal case here, not an edge case, and a read-then-increment races even inside a transaction unless it takes a lock nothing else needs. `nextval` does not race, does not lock, and does not roll back — a rolled-back creation burns a number, which is correct behaviour for a document number and not a defect.

The trap is the seed. Each sequence must be advanced past the highest number the seed loaded, in the seed script itself, or the first document a visitor creates collides with a seeded one and the unique index turns it into an error on screen. That has to happen every time the seed runs, including during the daily reset.

This ticket is the riskiest small piece of work in the phase: everything from 06 to 10 depends on it, and its failure mode is a duplicate-key error in front of a visitor.

**Blocked by:** 04 (the daily reset, and a smoke test against the live instance).

**Status:** resolved

- [x] A migration adds one sequence per creatable document type and a unique index on each `number` column
- [x] A single allocator function returns the next formatted number for a given document type, taking the open transaction
- [x] The number format matches the seeded one exactly, so a created document is indistinguishable in shape from a seeded one
- [x] `db:seed` advances every sequence past the highest number it loaded, on every run
- [x] A check proves two concurrent allocations of the same document type return two different numbers
- [x] A check proves a rolled-back creation leaves no document and does not reuse a burned number

## Comments

**2026-09-02** — Done. `drizzle/0011_large_dazzler.sql` creates the sequences and
the unique constraints; `lib/db/numbers.ts` holds the registry and
`allocateDocumentNumber`, which `lib/db/seed.ts` follows with
`advanceDocumentNumbers` on every run. `npm run check:numbers`
(`lib/db/numbers.checks.ts`) covers the seeded-series, concurrency and rollback
guarantees and runs in CI ahead of the Playwright suite.

Two deviations worth recording:

- Six sequences for seven creatable types. The two kinds of Return share the one
  `return_number_seq`, because the seeded dataset numbers `SR` and `PR` from a
  single run of counters; giving them separate sequences would have made created
  Returns a different shape from seeded ones, which the third acceptance line
  forbids.
- 0011's statements are guarded (`IF NOT EXISTS`, `DO $$ … EXCEPTION`) because
  the "ci" Neon branch already carried five of the unique constraints, created
  outside the migration history. The end state is the same either way.

Post-review cleanup: the temporary `lib/db/_explain_migration.ts` and its
`if: failure()` CI step were deleted now that 0011 has landed, and the
`CREATE SEQUENCE` statements were guarded to match the constraints.

`check:numbers` could not be run locally against the demo branch — Neon returned
"Your project has exceeded the data transfer quota". It runs in CI on the "ci"
branch.
