/**
 * The guarantees ticket 15 needs that Playwright cannot express.
 *
 *  1. Authorization is in the domain function, not the Count sheet (ADR-0004).
 *     A browser test always goes through a page whose render gate already hid
 *     the sheet, so it can only prove the gate. This calls `completeStockCount`
 *     directly, as automation or a REST caller would, and asserts the domain
 *     refuses a Role without `counts` edit and writes nothing.
 *
 *  2. All corrections in one count apply together or not at all. A two-line
 *     completion whose second line's correction would drive on-hand below zero
 *     is rejected whole — the first line's `count-correction` rolls back, no
 *     Event survives, the count does not advance — so the shelf and the system
 *     never disagree in a new way that nobody knows about.
 *
 *  3. A count with no variances appends nothing, and still sets the last-counted
 *     timestamp. Every counted line matching the recorded quantity completes the
 *     count and stamps `stock_rows.last_counted_at`, without polluting the
 *     ledger with a single zero-quantity Movement.
 *
 * Run with `npm run check:counts` against a migrated, seeded database; CI runs
 * it after `check:transfers`. Its own Pool under plain Node, same as the seed
 * and the other check scripts. Every mutation it makes is reversed (or its
 * throwaway rows deleted) so the shared branch the Playwright suite then asserts
 * against is left exactly as seeded — bar the append-only Event stream, which CI
 * truncates on reseed.
 */

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { Pool, neonConfig } from "@neondatabase/serverless";
import { and, eq, isNull, sql } from "drizzle-orm";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";

import { hydrateRoles, can } from "@/lib/auth/permissions";
import * as schema from "@/lib/db/schema";
import { StockChangeError, type Actor } from "@/lib/domain/stock";
import { completeStockCount, CountError } from "@/lib/domain/counts";

type Db = NeonDatabase<typeof schema>;

async function eventCount(db: Db): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.events);
  return row?.n ?? 0;
}

async function actorForRole(db: Db, role: string): Promise<Actor> {
  const [user] = await db
    .select({ id: schema.users.id, name: schema.users.name, role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.role, role as Actor["role"]))
    .limit(1);
  if (!user) throw new Error(`checks: no seeded user with role "${role}"`);
  return user;
}

interface Holding {
  productId: string;
  sku: string;
  warehouseId: string;
  locationId: string;
  onHand: number;
  lastCountedAt: string | null;
}

/**
 * A warehouse with two products that each sit in exactly one un-lotted holding
 * there with room to spare — so a small correction moves that one row and can be
 * reversed by a single equal-and-opposite change.
 */
async function pickPair(db: Db): Promise<{ warehouseId: string; a: Holding; b: Holding }> {
  const rows = await db
    .select({
      productId: schema.stockRows.productId,
      warehouseId: schema.stockRows.warehouseId,
      locationId: schema.stockRows.locationId,
      onHand: schema.stockRows.onHand,
      lastCountedAt: schema.stockRows.lastCountedAt,
    })
    .from(schema.stockRows)
    .where(and(isNull(schema.stockRows.lotNumber), sql`${schema.stockRows.onHand} >= 20`));

  const byWarehouse = new Map<string, Map<string, (typeof rows)[number][]>>();
  for (const r of rows) {
    const perProduct = byWarehouse.get(r.warehouseId) ?? new Map();
    const list = perProduct.get(r.productId) ?? [];
    list.push(r);
    perProduct.set(r.productId, list);
    byWarehouse.set(r.warehouseId, perProduct);
  }

  const skuById = new Map(
    (await db.select({ id: schema.products.id, sku: schema.products.sku }).from(schema.products)).map(
      (p) => [p.id, p.sku] as const,
    ),
  );

  for (const [warehouseId, perProduct] of byWarehouse) {
    const singles = [...perProduct.values()].filter((l) => l.length === 1).map((l) => l[0]);
    if (singles.length < 2) continue;
    const toHolding = (r: (typeof rows)[number]): Holding => ({
      productId: r.productId,
      sku: skuById.get(r.productId) ?? r.productId,
      warehouseId: r.warehouseId,
      locationId: r.locationId,
      onHand: r.onHand,
      lastCountedAt: r.lastCountedAt,
    });
    return { warehouseId, a: toHolding(singles[0]), b: toHolding(singles[1]) };
  }
  throw new Error("checks: no warehouse with two single-holding un-lotted products");
}

/** The `where` for the one un-lotted Stock Row a check Holding names. */
function holdingWhere(h: Holding) {
  return and(
    eq(schema.stockRows.productId, h.productId),
    eq(schema.stockRows.warehouseId, h.warehouseId),
    eq(schema.stockRows.locationId, h.locationId),
    isNull(schema.stockRows.lotNumber),
  );
}

async function onHandOf(db: Db, h: Holding): Promise<number> {
  const [row] = await db
    .select({ onHand: schema.stockRows.onHand })
    .from(schema.stockRows)
    .where(holdingWhere(h));
  return row?.onHand ?? 0;
}

async function lastCountedOf(db: Db, h: Holding): Promise<string | null> {
  const [row] = await db
    .select({ at: schema.stockRows.lastCountedAt })
    .from(schema.stockRows)
    .where(holdingWhere(h));
  return row?.at ?? null;
}

let seq = 0;
async function makeCount(
  db: Db,
  opts: {
    warehouseId: string;
    createdBy: string;
    lines: { holding: Holding; expected: number; counted: number | null }[];
  },
): Promise<string> {
  const id = `SC-CHK-${Date.now()}-${seq++}`;
  const now = new Date().toISOString();
  await db.insert(schema.stockCounts).values({
    id,
    number: id,
    type: "spot",
    warehouseId: opts.warehouseId,
    scopeLabel: "checks",
    status: "in-progress",
    scheduledFor: now,
    startedAt: now,
    completedAt: null,
    assignedTo: [opts.createdBy],
    accuracyPct: 0,
    totalVarianceValue: 0,
    createdBy: opts.createdBy,
    approvedBy: null,
  });
  await db.insert(schema.countLines).values(
    opts.lines.map((l, n) => ({
      stockCountId: id,
      id: `CL-${n + 1}`,
      productId: l.holding.productId,
      sku: l.holding.sku,
      name: "checks",
      locationId: l.holding.locationId,
      expected: l.expected,
      counted: l.counted,
      variance: 0,
      varianceValue: 0,
      countedBy: null,
      countedAt: null,
      recount: false,
    })),
  );
  return id;
}

async function deleteCount(db: Db, id: string): Promise<void> {
  await db.delete(schema.countLines).where(eq(schema.countLines.stockCountId, id));
  await db.delete(schema.stockCounts).where(eq(schema.stockCounts.id, id));
}

async function restoreLastCounted(db: Db, h: Holding, at: string | null): Promise<void> {
  await db.update(schema.stockRows).set({ lastCountedAt: at }).where(holdingWhere(h));
}

async function forbiddenIsRefusedAndWritesNothing(db: Db): Promise<void> {
  const forbidden = await actorForRole(db, "auditor");
  assert.equal(
    can(forbidden.role, "counts", "edit"),
    false,
    "precondition: the chosen role must not be able to edit counts",
  );

  const { warehouseId, a } = await pickPair(db);
  const createdBy = (await actorForRole(db, "inventory-manager")).id;
  const countId = await makeCount(db, {
    warehouseId,
    createdBy,
    lines: [{ holding: a, expected: a.onHand, counted: a.onHand + 2 }],
  });

  try {
    const before = await eventCount(db);
    await assert.rejects(
      () => completeStockCount(forbidden, { stockCountId: countId, lines: [{ lineId: "CL-1", counted: a.onHand + 2 }] }, db),
      (err: unknown) => err instanceof CountError && err.code === "forbidden",
      "completeStockCount must throw CountError('forbidden') for a role without counts edit",
    );
    const after = await eventCount(db);
    assert.equal(after, before, `a refused completion appended ${after - before} event(s); expected 0`);

    const [c] = await db
      .select({ status: schema.stockCounts.status })
      .from(schema.stockCounts)
      .where(eq(schema.stockCounts.id, countId));
    assert.equal(c.status, "in-progress", "the count did not advance");
    console.log(`  forbidden: ${forbidden.role} refused directly, event stream unchanged (${after})`);
  } finally {
    await deleteCount(db, countId);
  }
}

async function partialFailureLeavesNoTrace(db: Db): Promise<void> {
  const operator = await actorForRole(db, "warehouse-staff");
  assert.equal(can(operator.role, "counts", "edit"), true, "precondition: operator can edit counts");

  const { warehouseId, a, b } = await pickPair(db);
  const createdBy = (await actorForRole(db, "inventory-manager")).id;

  // Line 1 is a real, coverable +3 correction. Line 2 claims the recorded
  // quantity was a million higher than it is and counted zero — the correction
  // would drive on-hand far below zero, so the whole completion must roll back.
  const countId = await makeCount(db, {
    warehouseId,
    createdBy,
    lines: [
      { holding: a, expected: a.onHand, counted: a.onHand + 3 },
      { holding: b, expected: b.onHand + 1_000_000, counted: 0 },
    ],
  });

  try {
    const before = await eventCount(db);
    const aBefore = await onHandOf(db, a);

    await assert.rejects(
      () =>
        completeStockCount(
          operator,
          {
            stockCountId: countId,
            lines: [
              { lineId: "CL-1", counted: a.onHand + 3 },
              { lineId: "CL-2", counted: 0 },
            ],
          },
          db,
        ),
      (err: unknown) => err instanceof StockChangeError && err.code === "negative-stock",
      "completeStockCount must reject a completion whose second line would drive on-hand below zero",
    );

    const aAfter = await onHandOf(db, a);
    assert.equal(aAfter, aBefore, "the first line's count-correction rolled back");
    assert.equal(await eventCount(db), before, "no Event survived the failed completion");

    const [c] = await db
      .select({ status: schema.stockCounts.status })
      .from(schema.stockCounts)
      .where(eq(schema.stockCounts.id, countId));
    assert.equal(c.status, "in-progress", "the count did not advance");
    console.log(`  atomic: a completion failing on line 2 left on-hand, the Event stream and ${countId} untouched`);
  } finally {
    await deleteCount(db, countId);
  }
}

async function noVarianceAppendsNothingButStampsCounted(db: Db): Promise<void> {
  const operator = await actorForRole(db, "warehouse-staff");
  const { warehouseId, a, b } = await pickPair(db);
  const createdBy = (await actorForRole(db, "inventory-manager")).id;

  const aWas = await lastCountedOf(db, a);
  const bWas = await lastCountedOf(db, b);

  const countId = await makeCount(db, {
    warehouseId,
    createdBy,
    lines: [
      { holding: a, expected: a.onHand, counted: a.onHand },
      { holding: b, expected: b.onHand, counted: b.onHand },
    ],
  });

  try {
    const before = await eventCount(db);

    const result = await completeStockCount(
      operator,
      {
        stockCountId: countId,
        lines: [
          { lineId: "CL-1", counted: a.onHand },
          { lineId: "CL-2", counted: b.onHand },
        ],
      },
      db,
    );

    assert.equal(result.corrections, 0, "a count where every line matched produced a correction");
    assert.equal(result.status, "applied", "the count did not complete");
    assert.equal(await eventCount(db), before, "a no-variance completion appended an Event");

    const aNow = await lastCountedOf(db, a);
    const bNow = await lastCountedOf(db, b);
    assert.notEqual(aNow, aWas, "line A's Stock Row was not stamped last-counted");
    assert.notEqual(bNow, bWas, "line B's Stock Row was not stamped last-counted");

    console.log(`  no variance: ${countId} completed, 0 Events appended, both Stock Rows stamped last-counted`);
  } finally {
    await restoreLastCounted(db, a, aWas);
    await restoreLastCounted(db, b, bWas);
    await deleteCount(db, countId);
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

    console.log("stock-count checks:");
    await forbiddenIsRefusedAndWritesNothing(db);
    await partialFailureLeavesNoTrace(db);
    await noVarianceAppendsNothingButStampsCounted(db);
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
