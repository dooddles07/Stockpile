---
status: accepted
---

# One Postgres holds both the event stream and the projections

Events and projections live in the same Neon Postgres database, so an event append and its projection update commit in a single transaction. Projections can therefore never lag or disagree with the stream they are built from, and they rebuild by replaying the events table. Drizzle is the data access layer, chosen mainly for drizzle-kit migrations across 20+ tables and for making the schema the single source of the types that `lib/types.ts` currently maintains by hand.

## Considered options

A dedicated event store (EventStoreDB or similar) with a separate Postgres read model was rejected: no transaction can span two datastores, so every projection becomes eventually consistent and every read-your-own-write in the UI needs explicit handling. That is the dominant source of bugs in event-sourced systems and it is avoidable here.

## Consequences

**Do not use `drizzle-orm/neon-http`.** The Neon HTTP driver is single-shot and cannot run interactive transactions, which this design depends on (see ADR-0006). Use `drizzle-orm/neon-serverless` with a WebSocket `Pool`, or `node-postgres`.

Replay is a single-table scan. That is acceptable well past the volume one business generates, but the event stream is append-only and the free tier is capped at roughly 0.5 GB, so retention or archival becomes a real question rather than a theoretical one.
