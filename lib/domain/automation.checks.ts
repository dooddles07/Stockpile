/**
 * The guarantees ticket 17 needs that Playwright cannot express.
 *
 * ADR-0008 runs Automation Rules in-process after a stock transaction commits.
 * The riskiest parts of that are invisible from a browser:
 *
 *  1. A matching rule evaluates *after* the commit and is recorded as a run,
 *     attributed to the system Actor. This drives a holding across its reorder
 *     point through the choke point and asserts a `success` run appears for the
 *     one modelled rule, carrying `actor_id = "system"`.
 *
 *  2. A rolled-back operation triggers no evaluation. An operation that throws
 *     inside its transaction appends no Event, so a following `runAutomation`
 *     finds nothing and records nothing.
 *
 *  3. A failing rule is isolated. With a deliberately-throwing rule enabled, a
 *     stock change still commits and returns its result, `runAutomation` does
 *     not throw, and the failure is recorded as a `failed` run.
 *
 * The `trigger` / `conditions` / `actions` vocabulary is left unmodelled (ADR
 * -0008): the engine matches on rule id, not on the free-text columns, so a
 * seeded rule with arbitrary trigger text produces no run — asserted implicitly
 * by (1), where only the hardcoded reorder rule fires.
 *
 * Run with `npm run check:automation` against a migrated, seeded database; CI
 * runs it after `check:returns`. Its own Pool under plain Node, same as the
 * seed and the other check scripts. Everything it writes is undone: stock
 * balances restored, the throwaway canary rule and every `automation_runs` row
 * these checks caused deleted. Only the append-only Event stream keeps the few
 * Movement Events — truncated on the next reseed, counted by no read test —
 * exactly as `returns.checks.ts` leaves it.
 */

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { Pool, neonConfig } from "@neondatabase/serverless";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";

import { hydrateRoles } from "@/lib/auth/permissions";
import * as schema from "@/lib/db/schema";
import {
  runAutomation,
  REORDER_RULE_ID,
  CANARY_FAIL_RULE_ID,
} from "@/lib/domain/automation";
import { applyStockChange, SYSTEM_ACTOR, StockChangeError, type Actor } from "@/lib/domain/stock";

type Db = NeonDatabase<typeof schema>;

async function actorForRole(db: Db, role: string): Promise<Actor> {
  const [user] = await db
    .select({ id: schema.users.id, name: schema.users.name, role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.role, role as Actor["role"]))
    .limit(1);
  if (!user) throw new Error(`checks: no seeded user with role "${role}"`);
  return user;
}

async function runCountFor(db: Db, ruleId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.automationRuns)
    .where(eq(schema.automationRuns.ruleId, ruleId));
  return row?.n ?? 0;
}

async function maxEventSeq(db: Db): Promise<number> {
  const [row] = await db
    .select({ m: sql<number>`coalesce(max(${schema.events.seq}), 0)::int` })
    .from(schema.events);
  return row?.m ?? 0;
}

/** Delete the automation_runs a check created for a rule, by seq, so the shared
 *  branch is left as the seed made it (the sibling check-script convention). */
async function deleteRunsAfter(db: Db, ruleId: string, afterSeq: number): Promise<void> {
  await db
    .delete(schema.automationRuns)
    .where(and(eq(schema.automationRuns.ruleId, ruleId), gt(schema.automationRuns.seq, afterSeq)));
}

async function latestRunFor(db: Db, ruleId: string) {
  const [row] = await db
    .select()
    .from(schema.automationRuns)
    .where(eq(schema.automationRuns.ruleId, ruleId))
    .orderBy(sql`${schema.automationRuns.seq} desc`)
    .limit(1);
  return row;
}

async function setOnHand(db: Db, rowSeq: number, onHand: number): Promise<void> {
  await db.update(schema.stockRows).set({ onHand }).where(eq(schema.stockRows.seq, rowSeq));
}

interface Holding {
  rowSeq: number;
  productId: string;
  warehouseId: string;
  locationId: string;
  sku: string;
  onHand: number;
  reorderPoint: number;
}

/**
 * An un-lotted Stock Row that is the only holding for its product at that
 * location, sitting a little above a reorder point of at least 1 — so a single
 * decrease takes it from above the point to just below, and `applyStockChange`
 * accepts the target as one row.
 */
async function pickCrossingHolding(db: Db): Promise<Holding> {
  const candidates = await db
    .select({
      rowSeq: schema.stockRows.seq,
      productId: schema.stockRows.productId,
      warehouseId: schema.stockRows.warehouseId,
      locationId: schema.stockRows.locationId,
      sku: schema.products.sku,
      onHand: schema.stockRows.onHand,
      reorderPoint: schema.products.reorderPoint,
    })
    .from(schema.stockRows)
    .innerJoin(schema.products, eq(schema.products.id, schema.stockRows.productId))
    .where(
      and(
        isNull(schema.stockRows.lotNumber),
        gt(schema.products.reorderPoint, 0),
        sql`${schema.stockRows.onHand} BETWEEN ${schema.products.reorderPoint} + 1 AND ${schema.products.reorderPoint} + 8`,
      ),
    )
    .orderBy(schema.stockRows.seq)
    .limit(100);

  for (const c of candidates) {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.stockRows)
      .where(
        and(
          eq(schema.stockRows.productId, c.productId),
          eq(schema.stockRows.warehouseId, c.warehouseId),
          eq(schema.stockRows.locationId, c.locationId),
          isNull(schema.stockRows.lotNumber),
        ),
      );
    if (n === 1) return c;
  }
  throw new Error("checks: no single un-lotted holding sitting just above its reorder point");
}

/** (1) A matching rule evaluates after commit and is recorded, as the system Actor. */
async function matchingRuleIsRecordedAfterCommit(db: Db): Promise<void> {
  const operator = await actorForRole(db, "warehouse-staff");
  const holding = await pickCrossingHolding(db);
  const decrease = holding.onHand - holding.reorderPoint + 1; // → on-hand = reorderPoint - 1

  const before = await runCountFor(db, REORDER_RULE_ID);
  const beforeRunSeq = (await latestRunFor(db, REORDER_RULE_ID))?.seq ?? 0;
  try {
    const applied = await applyStockChange(
      operator,
      {
        productId: holding.productId,
        warehouseId: holding.warehouseId,
        locationId: holding.locationId,
        lotNumber: null,
        movementType: "adjustment",
        onHandDelta: -decrease,
        reason: "automation check: cross the reorder point",
        permission: { module: "adjustments", action: "create" },
      },
      db,
    );
    assert.equal(
      applied.onHand,
      holding.onHand - decrease,
      "precondition: the stock change committed and moved on-hand",
    );

    // The domain function would call this straight after its transaction; here
    // the check plays that part, handing it the Event the change just wrote.
    const summary = await runAutomation(db, [applied.eventSeq]);
    assert.ok(summary.recorded >= 1, "runAutomation recorded no run for a threshold crossing");

    assert.equal(
      await runCountFor(db, REORDER_RULE_ID),
      before + 1,
      "exactly one reorder run should have been recorded",
    );
    const run = await latestRunFor(db, REORDER_RULE_ID);
    assert.equal(run.outcome, "success", "the reorder run outcome is success");
    assert.equal(run.actorId, SYSTEM_ACTOR.id, "the run is attributed to the system Actor");
    assert.equal(SYSTEM_ACTOR.name, "Automation", "the system Actor has a stable, named identity");
    assert.ok(
      run.message.includes(holding.sku) && run.message.includes(String(holding.reorderPoint)),
      `the run message names the product and its reorder point (got: ${run.message})`,
    );
    console.log(
      `  after commit: ${holding.sku} crossed ${holding.reorderPoint}, one success run by ${SYSTEM_ACTOR.name}`,
    );
  } finally {
    await setOnHand(db, holding.rowSeq, holding.onHand);
    await deleteRunsAfter(db, REORDER_RULE_ID, beforeRunSeq);
  }
}

/** (2) An operation that rolls back triggers no evaluation. */
async function rolledBackOperationTriggersNothing(db: Db): Promise<void> {
  const operator = await actorForRole(db, "warehouse-staff");
  const holding = await pickCrossingHolding(db);

  const beforeReorder = await runCountFor(db, REORDER_RULE_ID);
  const wouldBeSeq = (await maxEventSeq(db)) + 1;

  // A decrease far larger than on-hand: the choke point rejects it inside the
  // transaction, so nothing commits and no Event is appended.
  await assert.rejects(
    () =>
      applyStockChange(
        operator,
        {
          productId: holding.productId,
          warehouseId: holding.warehouseId,
          locationId: holding.locationId,
          lotNumber: null,
          movementType: "adjustment",
          onHandDelta: -(holding.onHand + 1000),
          reason: "automation check: this must roll back",
          permission: { module: "adjustments", action: "create" },
        },
        db,
      ),
    (err: unknown) => err instanceof StockChangeError && err.code === "negative-stock",
    "the oversized decrease should be rejected inside the transaction",
  );

  // Hand the engine the seq the rejected operation *would* have written. It was
  // never committed, so no `events` row carries it and nothing evaluates.
  const summary = await runAutomation(db, [wouldBeSeq]);
  assert.equal(summary.recorded, 0, "a rolled-back operation caused a run to be recorded");
  assert.equal(
    await runCountFor(db, REORDER_RULE_ID),
    beforeReorder,
    "the reorder run count changed after a rolled-back operation",
  );
  console.log("  rolled back: no Event committed, no rule evaluated");
}

/** (3) A failing rule is recorded as failed and does not fail the operation. */
async function failingRuleIsIsolated(db: Db): Promise<void> {
  const operator = await actorForRole(db, "warehouse-staff");
  const [someUser] = await db.select({ id: schema.users.id }).from(schema.users).limit(1);

  await db
    .insert(schema.automationRules)
    .values({
      id: CANARY_FAIL_RULE_ID,
      name: "Canary (always fails)",
      description: "automation check: proves a failing rule is isolated",
      trigger: "any Event",
      conditions: [],
      actions: ["throw"],
      enabled: true,
      lastRunAt: null,
      runCount: 0,
      successRate: 0,
      createdBy: someUser.id,
      scope: "checks",
    })
    .onConflictDoNothing();

  // A holding well clear of its reorder point, so this Event matches only the
  // canary and not the reorder rule.
  const [holding] = await db
    .select({
      rowSeq: schema.stockRows.seq,
      productId: schema.stockRows.productId,
      warehouseId: schema.stockRows.warehouseId,
      locationId: schema.stockRows.locationId,
      onHand: schema.stockRows.onHand,
    })
    .from(schema.stockRows)
    .innerJoin(schema.products, eq(schema.products.id, schema.stockRows.productId))
    .where(
      and(
        isNull(schema.stockRows.lotNumber),
        gt(schema.stockRows.onHand, 5),
        sql`${schema.stockRows.onHand} > ${schema.products.reorderPoint} + 50`,
      ),
    )
    .orderBy(schema.stockRows.seq)
    .limit(1);
  if (!holding) throw new Error("checks: no holding sitting well above its reorder point");

  const beforeCanary = await runCountFor(db, CANARY_FAIL_RULE_ID);
  try {
    const applied = await applyStockChange(
      operator,
      {
        productId: holding.productId,
        warehouseId: holding.warehouseId,
        locationId: holding.locationId,
        lotNumber: null,
        movementType: "adjustment",
        onHandDelta: -1,
        reason: "automation check: a rule will fail on this Event",
        permission: { module: "adjustments", action: "create" },
      },
      db,
    );
    assert.equal(applied.onHand, holding.onHand - 1, "the triggering operation still committed");

    // Must not throw, even though the canary rule does.
    const summary = await runAutomation(db, [applied.eventSeq]);
    assert.ok(summary.recorded >= 1, "the failing rule was not recorded");

    assert.equal(
      await runCountFor(db, CANARY_FAIL_RULE_ID),
      beforeCanary + 1,
      "exactly one failed canary run should have been recorded",
    );
    const run = await latestRunFor(db, CANARY_FAIL_RULE_ID);
    assert.equal(run.outcome, "failed", "the canary run outcome is failed");
    assert.equal(run.actorId, SYSTEM_ACTOR.id, "the failed run is still attributed to the system Actor");
    console.log("  failing rule: operation committed, failure recorded, runAutomation did not throw");
  } finally {
    await setOnHand(db, holding.rowSeq, holding.onHand);
    await db.delete(schema.automationRuns).where(eq(schema.automationRuns.ruleId, CANARY_FAIL_RULE_ID));
    await db.delete(schema.automationRules).where(eq(schema.automationRules.id, CANARY_FAIL_RULE_ID));
  }
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  neonConfig.webSocketConstructor = ws;

  const pool = new Pool({ connectionString, max: 5 });
  try {
    const db = drizzle({ client: pool, schema });
    hydrateRoles(await db.select().from(schema.roles));

    console.log("automation checks:");
    await matchingRuleIsRecordedAfterCommit(db);
    await rolledBackOperationTriggersNothing(db);
    await failingRuleIsIsolated(db);
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
