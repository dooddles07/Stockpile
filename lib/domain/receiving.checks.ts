/**
 * The guarantees ticket 12 needs that Playwright cannot express.
 *
 *  1. Authorization is in the domain function, not the Receive tab (ADR-0004).
 *     A browser test always goes through a page whose render gate already hid
 *     the tab, so it can only ever prove the gate. This calls `receiveGoods`
 *     directly, as automation or a REST caller would, and asserts the domain
 *     refuses a Role without `receiving` and appends no Event.
 *
 *  2. Over-receipt is an explicit decision — permitted, with the excess
 *     recorded. This receives more than a line's outstanding quantity and
 *     asserts on-hand rose by the full received amount (not clamped to what was
 *     outstanding), the line's `fulfilled` went above its ordered `quantity`,
 *     the Purchase Order advanced, and the Movement is a `purchase-receipt`
 *     attributed to the Actor.
 *
 *  3. A receipt that fails partway leaves no trace (spec story 26): a two-line
 *     call whose second line is not on the order rolls the first line's on-hand
 *     change and Event back with it.
 *
 * Run with `npm run check:receiving` against a migrated, seeded database; CI
 * runs it right after `check:reference`. Its own Pool under plain Node, same as
 * the seed and the other check scripts — `lib/db/client.ts` is `server-only`.
 * Every mutation it makes is reversed so the shared branch the Playwright suite
 * then asserts against is left exactly as seeded.
 */

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { Pool, neonConfig } from "@neondatabase/serverless";
import { and, eq, isNull, sql } from "drizzle-orm";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";

import { hydrateRoles, can } from "@/lib/auth/permissions";
import * as schema from "@/lib/db/schema";
import { GoodsReceiptError, receiveGoods } from "@/lib/domain/receiving";
import { applyStockChange, type Actor } from "@/lib/domain/stock";

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

/**
 * A receivable Purchase Order line whose product already has an un-lotted
 * holding in the order's warehouse — so the receipt lands on an existing Stock
 * Row and nothing new is inserted to clean up afterwards.
 */
async function pickReceivableLine(db: Db) {
  const [row] = await db
    .select({
      poId: schema.purchaseOrders.id,
      poNumber: schema.purchaseOrders.number,
      poStatus: schema.purchaseOrders.status,
      poReceivedAt: schema.purchaseOrders.receivedAt,
      warehouseId: schema.purchaseOrders.warehouseId,
      lineSeq: schema.purchaseOrderLines.seq,
      lineId: schema.purchaseOrderLines.id,
      productId: schema.purchaseOrderLines.productId,
      quantity: schema.purchaseOrderLines.quantity,
      fulfilled: schema.purchaseOrderLines.fulfilled,
      rowSeq: schema.stockRows.seq,
      locationId: schema.stockRows.locationId,
      onHand: schema.stockRows.onHand,
    })
    .from(schema.purchaseOrders)
    .innerJoin(
      schema.purchaseOrderLines,
      eq(schema.purchaseOrderLines.purchaseOrderId, schema.purchaseOrders.id),
    )
    .innerJoin(
      schema.stockRows,
      and(
        eq(schema.stockRows.productId, schema.purchaseOrderLines.productId),
        eq(schema.stockRows.warehouseId, schema.purchaseOrders.warehouseId),
        isNull(schema.stockRows.lotNumber),
      ),
    )
    .where(eq(schema.purchaseOrders.status, "ordered"))
    .orderBy(schema.purchaseOrders.id, schema.purchaseOrderLines.seq)
    .limit(1);
  if (!row) throw new Error("checks: no 'ordered' PO line with an existing un-lotted holding");
  return row;
}

async function forbiddenIsRefusedAndWritesNothing(db: Db): Promise<void> {
  const forbidden = await actorForRole(db, "auditor");
  assert.equal(
    can(forbidden.role, "receiving", "edit"),
    false,
    "precondition: the chosen role must not be able to receive",
  );

  const line = await pickReceivableLine(db);
  const before = await eventCount(db);

  await assert.rejects(
    () =>
      receiveGoods(
        forbidden,
        {
          purchaseOrderId: line.poId,
          lines: [{ lineId: line.lineId, receivedQty: 1, locationId: line.locationId }],
          note: "direct call, no form",
        },
        db,
      ),
    (err: unknown) => err instanceof GoodsReceiptError && err.code === "forbidden",
    "receiveGoods must throw GoodsReceiptError('forbidden') for a role without receiving",
  );

  const after = await eventCount(db);
  assert.equal(after, before, `a refused receipt appended ${after - before} event(s); expected 0`);
  console.log(`  forbidden: ${forbidden.role} refused directly, event stream unchanged (${after})`);
}

async function overReceiptIsPermittedAndRecorded(db: Db): Promise<void> {
  const operator = await actorForRole(db, "warehouse-staff");
  assert.equal(can(operator.role, "receiving", "edit"), true, "precondition: operator can receive");

  const line = await pickReceivableLine(db);
  const outstanding = Math.max(0, line.quantity - line.fulfilled);
  const excess = 5;
  const receivedQty = outstanding + excess; // deliberately more than was ordered

  const result = await receiveGoods(
    operator,
    {
      purchaseOrderId: line.poId,
      lines: [{ lineId: line.lineId, receivedQty, locationId: line.locationId }],
      note: "checks: deliberate over-receipt",
    },
    db,
  );

  // On-hand rose by the full received quantity, not clamped to `outstanding`.
  const [row] = await db
    .select({ onHand: schema.stockRows.onHand })
    .from(schema.stockRows)
    .where(eq(schema.stockRows.seq, line.rowSeq));
  assert.equal(
    row.onHand,
    line.onHand + receivedQty,
    `on-hand ${line.onHand} -> ${row.onHand}, expected +${receivedQty} (the full amount received)`,
  );

  // The excess is recorded on the line rather than dropped.
  const [after] = await db
    .select({ fulfilled: schema.purchaseOrderLines.fulfilled })
    .from(schema.purchaseOrderLines)
    .where(eq(schema.purchaseOrderLines.seq, line.lineSeq));
  assert.equal(after.fulfilled, line.fulfilled + receivedQty, "line.fulfilled records the full receipt");
  assert.ok(after.fulfilled > line.quantity, "line.fulfilled is above the ordered quantity (over-receipt)");

  // The Document advanced as a consequence.
  const [po] = await db
    .select({ status: schema.purchaseOrders.status })
    .from(schema.purchaseOrders)
    .where(eq(schema.purchaseOrders.id, line.poId));
  assert.ok(
    po.status === "partially-received" || po.status === "received",
    `PO advanced out of 'ordered' (now '${po.status}')`,
  );

  // The Movement is a purchase-receipt attributed to the Actor.
  const [movement] = await db
    .select()
    .from(schema.movements)
    .where(eq(schema.movements.id, result.lines[0].movementId));
  assert.equal(movement.type, "purchase-receipt", "movement type is purchase-receipt");
  assert.equal(movement.userId, operator.id, "movement is attributed to the operator");
  assert.equal(movement.refType, "purchase-order", "movement references the purchase order");
  assert.equal(movement.qtyChange, receivedQty, "movement records the received quantity");

  // Restore: pull the units back out through the choke point, then reset the
  // Document rows to exactly their seeded values.
  await applyStockChange(
    operator,
    {
      productId: line.productId,
      warehouseId: line.warehouseId,
      locationId: line.locationId,
      lotNumber: null,
      movementType: "count-correction",
      onHandDelta: -receivedQty,
      reason: "checks: restore over-receipt",
      permission: { module: "counts", action: "create" },
    },
    db,
  );
  await db
    .update(schema.purchaseOrderLines)
    .set({ fulfilled: line.fulfilled })
    .where(eq(schema.purchaseOrderLines.seq, line.lineSeq));
  await db
    .update(schema.purchaseOrders)
    .set({ status: line.poStatus, receivedAt: line.poReceivedAt })
    .where(eq(schema.purchaseOrders.id, line.poId));

  const [restored] = await db
    .select({ onHand: schema.stockRows.onHand })
    .from(schema.stockRows)
    .where(eq(schema.stockRows.seq, line.rowSeq));
  assert.equal(restored.onHand, line.onHand, "on-hand restored to its seeded value");

  console.log(
    `  over-receipt: ${line.poNumber} line ${line.lineId} received ${receivedQty} (${outstanding} outstanding + ${excess} excess), on-hand +${receivedQty}, line.fulfilled ${after.fulfilled} > ${line.quantity} ordered (restored)`,
  );
}

/**
 * A receipt that fails partway leaves no trace (spec story 26). One call books
 * a valid line and then hits a line that is not on the order; the whole receipt
 * must roll back — the valid line's on-hand change and its Event included.
 */
async function partialFailureLeavesNoTrace(db: Db): Promise<void> {
  const operator = await actorForRole(db, "warehouse-staff");
  const line = await pickReceivableLine(db);
  const before = await eventCount(db);
  const [rowBefore] = await db
    .select({ onHand: schema.stockRows.onHand })
    .from(schema.stockRows)
    .where(eq(schema.stockRows.seq, line.rowSeq));

  await assert.rejects(
    () =>
      receiveGoods(
        operator,
        {
          purchaseOrderId: line.poId,
          lines: [
            { lineId: line.lineId, receivedQty: 3, locationId: line.locationId },
            { lineId: "LN-does-not-exist", receivedQty: 1, locationId: line.locationId },
          ],
          note: "checks: second line invalid",
        },
        db,
      ),
    (err: unknown) => err instanceof GoodsReceiptError && err.code === "invalid",
    "receiveGoods must reject a receipt naming a line that is not on the order",
  );

  const [rowAfter] = await db
    .select({ onHand: schema.stockRows.onHand })
    .from(schema.stockRows)
    .where(eq(schema.stockRows.seq, line.rowSeq));
  assert.equal(rowAfter.onHand, rowBefore.onHand, "the valid line's on-hand change rolled back");
  assert.equal(await eventCount(db), before, "no Event survived the failed receipt");

  const [po] = await db
    .select({ status: schema.purchaseOrders.status })
    .from(schema.purchaseOrders)
    .where(eq(schema.purchaseOrders.id, line.poId));
  assert.equal(po.status, line.poStatus, "the order did not advance");

  console.log(`  atomic: a receipt failing on line 2 left on-hand, the Event stream and ${line.poNumber} untouched`);
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  neonConfig.webSocketConstructor = ws;

  const pool = new Pool({ connectionString, max: 5 });
  try {
    const db = drizzle({ client: pool, schema });
    hydrateRoles(await db.select().from(schema.roles));

    console.log("goods-receipt checks:");
    await forbiddenIsRefusedAndWritesNothing(db);
    await overReceiptIsPermittedAndRecorded(db);
    await partialFailureLeavesNoTrace(db);
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
