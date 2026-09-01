---
status: accepted
---

# The deployed instance is a public writable demo, reset daily

Stockpile is deployed publicly as a portfolio and showcase piece. Visitors sign in to a seeded demo account with an ordinary role and can genuinely use the product — create orders, receive stock, watch the ledger move — rather than being confined to a read-only tour. A scheduled GitHub Actions workflow calls an authenticated endpoint once a day that truncates every table, event stream included, and re-runs the seed that loads the generated dataset into Postgres.

Letting visitors write is the point. The write path, the movement ledger and the permission engine are the parts of this system worth showing, and none of them are visible from a read-only view. A "view as Auditor" button was considered and rejected for exactly that reason: it would have been nearly free and would have shown nearly nothing.

Truncate-and-reseed was chosen over a Neon branch reset and over selectively deleting visitor-created rows. It adds no new machinery: the seed script is required by the database migration anyway, so the reset is that script called again. It is deterministic, because the same fixed generator seed produces the same state every time — which also keeps the Playwright assertions valid against the deployed instance. And truncating the event stream is what caps storage growth, which a projection-only reset would not do.

## Consequences

**Demo traffic is a storage cost.** Every visitor's clicks append events permanently until the next reset, against a free tier of roughly 0.5 GB (ADR-0007). The daily cadence is what bounds this; a longer interval trades storage headroom for a richer accumulated demo.

**The reset endpoint is destructive and public-facing.** It must be authenticated with a secret held in GitHub Actions, and must not be reachable by an ordinary session. It is the single most dangerous route in the application.

**The demo account is shared.** Two visitors at once act as the same user and see each other's changes. This is acceptable for a demo and should not be designed around.

**A visitor mid-session can have the world reset underneath them.** Accepted as the cost of the simpler mechanism.

**This ADR is deployment-only.** It changes nothing about the domain model, and it does not apply if Stockpile ever acquires real users — at that point the demo and the real instance must be separated, and ADR-0007 must be revisited first.

## Amendment: the reset is a workflow step, not an HTTP endpoint

The endpoint above does not need to exist, and the consequence that calls it the single most dangerous route in the application no longer applies. `.github/workflows/daily-reset.yml` runs `npm run db:seed` against the production connection string directly, the way the `playwright` job in `.github/workflows/e2e.yml` already runs it against the `ci` branch on every push. That deletes the route, the secret comparison and the whole attack surface, and changes nothing else: the same script truncates and reloads the same deterministic dataset on the same daily cadence.

The reasoning above for truncate-and-reseed over a Neon branch reset or selective deletion is unaffected and stands.

The workflow runs `e2e/smoke.spec.ts` against the live URL immediately after seeding and fails if it fails. The reset is the one mechanism that can break the demo silently — a seed that half-fails leaves the URL up and the data wrong — and the determinism this ADR relies on is exactly what makes the recorded assertions valid against production (ADR-0009). Only the smoke spec runs; the write specs would leave the demo in a state the reset did not produce.
