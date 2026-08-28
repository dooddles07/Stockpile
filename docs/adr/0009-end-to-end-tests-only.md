---
status: accepted
---

# Playwright end-to-end tests are the test strategy

Correctness is verified by driving the real UI through real flows with Playwright — receive a purchase order, ship an order, confirm the stock number moved — rather than by unit-testing domain functions.

## Consequences

**Known gap: concurrency is untested.** Playwright cannot easily issue two simultaneous writes, so the `SELECT ... FOR UPDATE` serialization in ADR-0006 — the single riskiest part of this design — is not covered. If a stock discrepancy is ever reported in production, this is the first place to look, and the cheapest closing move is one integration test that fires two concurrent shipments at the same product and asserts the resulting balance.

The reconciliation invariant from ADR-0006 (projected `onHand` equals the replayed event sum) is also not covered by end-to-end tests and is worth asserting somewhere.

`lib/import/validate.test.ts` exists but `package.json` has no test runner, so it does not currently run.
