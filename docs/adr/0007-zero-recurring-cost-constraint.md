---
status: accepted
---

# Zero recurring cost is a hard constraint

Stockpile must run with no recurring spend. The stack is chosen to fit free tiers: Neon Postgres, Vercel Blob for attachments, Auth.js instead of a paid identity vendor, and no paid scheduler or queue.

This is a constraint on the design, not an implementation detail, and it explains choices that would otherwise look strange — most notably self-hosted auth (ADR-0004) and automation with no scheduler (ADR-0008).

## Consequences

Known ceilings to plan around rather than discover: Neon free storage is roughly 0.5 GB and shared with an append-only event stream; Neon compute autosuspends, so the first query after idle pays a cold start.

**Vercel Hobby commercial-use question: closed.** Stockpile has no commercial users. It is built to product standard as a portfolio and showcase piece, and no business depends on it, so a non-commercial free tier is the correct fit rather than a risk. This closes what was previously recorded here as an unresolved risk.

If that ever changes — if a real business puts its stock in Stockpile — this ADR must be revisited before it happens, not after. At that point the Hobby terms need verifying and the answer is a paid plan or self-hosting. Backups and a restore procedure become requirements at the same moment; today they are deliberately absent because the daily reset in ADR-0010 makes the deployed data disposable by design.
