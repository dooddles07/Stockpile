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
