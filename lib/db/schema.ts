/**
 * Drizzle schema.
 *
 * Phase 2 fills this in table by table (see .scratch/postgres-write-path).
 * Ticket 01 only needs one real table so the migration pipeline has
 * something to author and apply — the append-only event stream from
 * ADR-0003, which every later ticket builds around and none reshapes.
 */

import { bigint, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Global append order; replay is a single-table scan by this column. */
  seq: bigint("seq", { mode: "number" }).generatedAlwaysAsIdentity(),
  type: text("type").notNull(),
  payload: jsonb("payload").notNull(),
  /** The Actor on whose authority the change was made (ADR-0004). */
  actorId: text("actor_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
