---
status: accepted
---

# Playwright end-to-end tests are the test strategy

Correctness is verified by driving the real UI through real flows with Playwright — receive a purchase order, ship an order, confirm the stock number moved — rather than by unit-testing domain functions.

## Consequences

**Known gap: concurrency is untested.** Playwright cannot easily issue two simultaneous writes, so the `SELECT ... FOR UPDATE` serialization in ADR-0006 — the single riskiest part of this design — is not covered. If a stock discrepancy is ever reported in production, this is the first place to look, and the cheapest closing move is one integration test that fires two concurrent shipments at the same product and asserts the resulting balance.

The reconciliation invariant from ADR-0006 (projected `onHand` equals the replayed event sum) is also not covered by end-to-end tests and is worth asserting somewhere.

`lib/import/validate.test.ts` exists but `package.json` has no test runner, so it does not currently run.

## Amendment: a below-the-UI check tier now closes those gaps

The write-path tickets (09–17) each ship a check script alongside the flow — `lib/domain/*.checks.ts`, run with `npm run check:*` under `tsx` with plain `assert` and no test framework. CI (`.github/workflows/e2e.yml`) runs all of them against the seeded "ci" Neon branch before the Playwright suite. The strategy above is unchanged — this is a targeted supplement for what Playwright structurally cannot reach, not a general unit-test tier, and domain functions are still not unit-tested in isolation.

- **Concurrency** (was a known gap): `check:stock` fires two simultaneous operations at the same product and location and asserts the final balance; `check:transfers` fires two concurrent despatches between the same warehouse pair and asserts no deadlock.
- **Reconciliation** (was a known gap): `check:stock` replays the event stream and asserts the sum equals projected `onHand` and `damaged` (ADR-0006). Reserved, incoming and in-transit are excluded — no movement produces them.
- **Enforcement past the UI**: each per-flow check calls the domain function directly as a forbidden role and asserts it refuses and writes no event.

`lib/import/validate.test.ts` no longer exists; `lib/import/validate.ts` is now exercised by `e2e/import-validation.spec.ts` in the Playwright suite.
