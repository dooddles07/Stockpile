/**
 * The two checks Playwright cannot express, required by ticket 09 and named as
 * the known gap in ADR-0009. Run with `npm run check:stock` against a migrated,
 * seeded database; CI runs it on the "ci" Neon branch after the seed.
 *
 *   Concurrency    — fire two simultaneous changes at the same Product and
 *                    Location and assert the final balance is correct, not
 *                    merely that both succeeded. This exercises the
 *                    `SELECT ... FOR UPDATE` serialization in ADR-0006, the
 *                    single riskiest decision in the design.
 *
 *   Reconciliation — replay the Event stream and assert that every holding's
 *                    summed movement-event deltas equal its projected change,
 *                    for on-hand and damaged. Reserved, incoming and in-transit
 *                    are projected from open Document state, not from
 *                    Movements, so they are deliberately excluded (ADR-0006).
 *                    The seed loads `stock_rows` without genesis events, so the
 *                    comparison is against the change each holding's events
 *                    produce, not an absolute from-zero replay.
 *
 * Its own Pool with room for concurrent connections, not `lib/db/client.ts`:
 * that module is `server-only` and this runs under plain Node, same as the seed.
 */

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { Pool, neonConfig } from "@neondatabase/serverless";
import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";

import { hydrateRoles } from "@/lib/auth/permissions";
import * as schema from "@/lib/db/schema";
import {
  applyStockChange,
  MOVEMENT_TYPES,
  SYSTEM_ACTOR,
  type Actor,
} from "@/lib/domain/stock";

type Db = NeonDatabase<typeof schema>;

/** The (product, location, lot) tuple that identifies one stock holding. */
type Holding = {
  productId: string;
  warehouseId: string;
  locationId: string;
  lotNumber: string | null;
};

const keyOf = (h: Holding) =>
  `${h.productId}|${h.warehouseId}|${h.locationId}|${h.lotNumber ?? ""}`;

async function balanceSnapshot(db: Db) {
  const rows = await db.select().from(schema.stockRows);
  return new Map(rows.map((r) => [r.seq, r]));
}

async function maxEventSeq(db: Db): Promise<number> {
  const [row] = await db
    .select({ max: sql<number | null>`max(${schema.events.seq})` })
    .from(schema.events);
  return row?.max ?? 0;
}

async function actorWithRole(db: Db, role: string): Promise<Actor> {
  const [user] = await db
    .select({ id: schema.users.id, name: schema.users.name, role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.role, role as Actor["role"]))
    .limit(1);
  if (!user) throw new Error(`checks: no seeded user with role "${role}"`);
  return user;
}

/** A seeded un-lotted holding with enough on-hand for the check to spend. */
async function pickHoldings(db: Db, count: number) {
  const rows = await db
    .select()
    .from(schema.stockRows)
    .where(and(isNull(schema.stockRows.lotNumber), gt(schema.stockRows.onHand, 20)))
    .orderBy(schema.stockRows.seq)
    .limit(count);
  if (rows.length < count) {
    throw new Error(`checks: need ${count} un-lotted holdings with on-hand > 20, found ${rows.length}`);
  }
  return rows;
}

async function concurrencyCheck(db: Db, actor: Actor): Promise<void> {
  const [row] = await pickHoldings(db, 1);
  const before = row.onHand;

  const change = {
    productId: row.productId,
    warehouseId: row.warehouseId,
    locationId: row.locationId,
    lotNumber: null,
    movementType: "sale" as const,
    onHandDelta: -1,
    reason: "concurrency check",
    permission: { module: "movements" as const, action: "create" as const },
  };

  // Two calls, same handle: `db.transaction` takes a separate pooled
  // connection for each, so they genuinely overlap.
  await Promise.all([
    applyStockChange(actor, change, db),
    applyStockChange(actor, change, db),
  ]);

  const [after] = await db
    .select({ onHand: schema.stockRows.onHand })
    .from(schema.stockRows)
    .where(eq(schema.stockRows.seq, row.seq));

  assert.equal(
    after.onHand,
    before - 2,
    `concurrent changes did not serialize: on-hand ${before} -> ${after.onHand}, expected ${before - 2}`,
  );

  console.log(`  concurrency: on-hand ${before} -> ${after.onHand} across 2 concurrent changes`);
}

async function reconciliationCheck(db: Db, actor: Actor): Promise<void> {
  const before = await balanceSnapshot(db);
  const startSeq = await maxEventSeq(db);
  const [a, b] = await pickHoldings(db, 2);

  // A spread of movement types and both Actors, including the system Actor.
  await applyStockChange(actor, {
    productId: a.productId, warehouseId: a.warehouseId, locationId: a.locationId, lotNumber: null,
    movementType: "adjustment", onHandDelta: -3, reason: "recon: miscount",
    permission: { module: "adjustments", action: "create" },
  }, db);
  await applyStockChange(actor, {
    productId: a.productId, warehouseId: a.warehouseId, locationId: a.locationId, lotNumber: null,
    movementType: "count-correction", onHandDelta: 5, reason: "recon: recount up",
    permission: { module: "counts", action: "create" },
  }, db);
  await applyStockChange(SYSTEM_ACTOR, {
    productId: b.productId, warehouseId: b.warehouseId, locationId: b.locationId, lotNumber: null,
    movementType: "damage", onHandDelta: -2, damagedDelta: 2, reason: "recon: crushed carton",
    permission: { module: "adjustments", action: "create" },
  }, db);

  const after = await balanceSnapshot(db);

  // Sum the projection deltas per holding key.
  const projDelta = new Map<string, { onHand: number; damaged: number }>();
  for (const [seq, row] of after) {
    const was = before.get(seq);
    if (!was) continue; // choke point never inserts stock rows
    const k = keyOf(row);
    const acc = projDelta.get(k) ?? { onHand: 0, damaged: 0 };
    acc.onHand += row.onHand - was.onHand;
    acc.damaged += row.damaged - was.damaged;
    projDelta.set(k, acc);

    // The choke point touches on-hand and damaged only.
    assert.equal(row.reserved, was.reserved, `reserved moved for stock_row ${seq}`);
    assert.equal(row.incoming, was.incoming, `incoming moved for stock_row ${seq}`);
    assert.equal(row.inTransit, was.inTransit, `in-transit moved for stock_row ${seq}`);
  }

  // Replay the Event stream for the same keys (movement events only).
  const events = await db
    .select()
    .from(schema.events)
    .where(and(gt(schema.events.seq, startSeq), inArray(schema.events.type, [...MOVEMENT_TYPES])));
  const eventDelta = new Map<string, { onHand: number; damaged: number }>();
  for (const e of events) {
    const p = e.payload as Holding & { onHandDelta: number; damagedDelta: number };
    const k = keyOf(p);
    const acc = eventDelta.get(k) ?? { onHand: 0, damaged: 0 };
    acc.onHand += p.onHandDelta;
    acc.damaged += p.damagedDelta;
    eventDelta.set(k, acc);
  }

  const keys = new Set([...projDelta.keys(), ...eventDelta.keys()]);
  assert.ok(keys.size > 0, "reconciliation ran no changes");
  for (const k of keys) {
    const proj = projDelta.get(k) ?? { onHand: 0, damaged: 0 };
    const ev = eventDelta.get(k) ?? { onHand: 0, damaged: 0 };
    assert.equal(proj.onHand, ev.onHand, `on-hand drift at ${k}: projection ${proj.onHand}, events ${ev.onHand}`);
    assert.equal(proj.damaged, ev.damaged, `damaged drift at ${k}: projection ${proj.damaged}, events ${ev.damaged}`);
  }

  console.log(`  reconciliation: ${keys.size} holding(s), projection equals replayed events for on-hand and damaged`);
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  neonConfig.webSocketConstructor = ws;

  const pool = new Pool({ connectionString, max: 5 });
  try {
    const db = drizzle({ client: pool, schema });
    hydrateRoles(await db.select().from(schema.roles));
    const actor = await actorWithRole(db, "super-admin");

    console.log("choke-point checks:");
    await concurrencyCheck(db, actor);
    await reconciliationCheck(db, actor);
    console.log("ok");
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
