/**
 * The guarantees ticket 13 needs that Playwright cannot express.
 *
 *  1. Authorization is in the domain functions, not the Fulfil tab (ADR-0004).
 *     A browser test always goes through a page whose render gate already hid
 *     the tab, so it can only ever prove the gate. This calls `confirmSalesOrder`,
 *     `shipSalesOrder` and `cancelSalesOrder` directly, as automation or a REST
 *     caller would, and asserts each refuses a Role without `fulfillment` and
 *     appends no Event.
 *
 *  2. Reserving more than is available is prevented. A line inflated past what
 *     the order's warehouse can cover makes `confirmSalesOrder` reject the whole
 *     confirmation with `insufficient-stock`, leaving the order a draft.
 *
 *  3. Confirming reserves without a Movement and without a direct write. After
 *     `confirmSalesOrder` the reserved projection (`sum(quantity - fulfilled)`
 *     over open Sales Orders) has risen by the order's outstanding quantity, the
 *     Event stream is unchanged, and `stock_rows.reserved` is untouched.
 *     Cancelling then releases the reservation the same way — projection down,
 *     no Event.
 *
 *  4. Shipping appends a `sale` Movement, lowers on-hand and releases the
 *     reservation. After `shipSalesOrder` there is a `sale` Movement per line
 *     attributed to the Actor, on-hand has fallen by the shipped quantity, each
 *     line's `fulfilled` equals its `quantity`, and the order no longer counts
 *     toward the reserved projection.
 *
 * Run with `npm run check:fulfilment` against a migrated, seeded database; CI
 * runs it right after `check:receiving`. Its own Pool under plain Node, same as
 * the seed and the other check scripts — `lib/db/client.ts` is `server-only`.
 * Every mutation it makes is reversed so the shared branch the Playwright suite
 * then asserts against is left exactly as seeded.
 */

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { Pool, neonConfig } from "@neondatabase/serverless";
import { and, eq, inArray, sql } from "drizzle-orm";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";

import { hydrateRoles, can } from "@/lib/auth/permissions";
import * as schema from "@/lib/db/schema";
import {
  cancelSalesOrder,
  confirmSalesOrder,
  advanceSalesOrder,
  shipSalesOrder,
  SalesOrderError,
} from "@/lib/domain/fulfilment";
import { applyStockChange, type Actor } from "@/lib/domain/stock";

type Db = NeonDatabase<typeof schema>;

/** Sales Order statuses that hold a reservation — matches `OPEN_SO_STATUSES`. */
const OPEN_SO_STATUSES = ["confirmed", "reserved", "picking", "packing"] as const;

async function eventCount(db: Db): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.events);
  return row?.n ?? 0;
}

/** Reserved units for one product, projected from open Sales Order state. */
async function projectedReserved(db: Db, productId: string): Promise<number> {
  const [row] = await db
    .select({
      reserved: sql<number>`coalesce(sum(${schema.salesOrderLines.quantity} - ${schema.salesOrderLines.fulfilled}), 0)::int`,
    })
    .from(schema.salesOrderLines)
    .innerJoin(
      schema.salesOrders,
      eq(schema.salesOrders.id, schema.salesOrderLines.salesOrderId),
    )
    .where(
      and(
        eq(schema.salesOrderLines.productId, productId),
        inArray(schema.salesOrders.status, [...OPEN_SO_STATUSES]),
      ),
    );
  return row?.reserved ?? 0;
}

/** Summed `stock_rows.reserved` for one product — the seeded projection that
 *  fulfilment must never write to. */
async function seededReserved(db: Db, productId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`coalesce(sum(${schema.stockRows.reserved}), 0)::int` })
    .from(schema.stockRows)
    .where(eq(schema.stockRows.productId, productId));
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

interface Candidate {
  id: string;
  number: string;
  status: string;
  warehouseId: string;
  lineSeq: number;
  lineId: string;
  productId: string;
  sku: string;
  quantity: number;
  fulfilled: number;
  rowSeq: number;
  locationId: string;
  lotNumber: string | null;
  onHand: number;
}

/**
 * Single-line Sales Orders whose one line draws from a single un-lotted holding
 * in the order's warehouse that comfortably covers it — so a test can wind the
 * order through the whole flow and restore exactly one Stock Row afterwards.
 */
async function pickCandidates(db: Db, limit: number): Promise<Candidate[]> {
  const rows = await db.execute(sql`
    select so.id, so.number, so.status, so.warehouse_id as "warehouseId",
           l.seq as "lineSeq", l.id as "lineId", l.product_id as "productId", l.sku,
           l.quantity, l.fulfilled,
           sr.seq as "rowSeq", sr.location_id as "locationId", sr.lot_number as "lotNumber", sr.on_hand as "onHand"
      from sales_orders so
      join sales_order_lines l on l.sales_order_id = so.id
      join stock_rows sr on sr.product_id = l.product_id
                        and sr.warehouse_id = so.warehouse_id
                        and sr.lot_number is null
     where so.status in ('confirmed', 'reserved')
       and l.fulfilled = 0
       and (select count(*) from sales_order_lines x where x.sales_order_id = so.id) = 1
       and (select count(*) from stock_rows y where y.product_id = l.product_id and y.warehouse_id = so.warehouse_id) = 1
       and sr.on_hand >= l.quantity * 2
     order by so.id
     limit ${limit}
  `);
  return (rows.rows as unknown as Candidate[]) ?? [];
}

async function restoreOrderStatus(db: Db, c: Candidate): Promise<void> {
  await db
    .update(schema.salesOrders)
    .set({
      status: c.status as (typeof OPEN_SO_STATUSES)[number],
      fulfillmentStatus: "unfulfilled",
      shippedAt: null,
      carrier: null,
      trackingNumber: null,
    })
    .where(eq(schema.salesOrders.id, c.id));
  await db
    .update(schema.salesOrderLines)
    .set({ fulfilled: c.fulfilled })
    .where(eq(schema.salesOrderLines.seq, c.lineSeq));
}

async function forbiddenIsRefused(db: Db, c: Candidate): Promise<void> {
  const forbidden = await actorForRole(db, "auditor");
  assert.equal(
    can(forbidden.role, "fulfillment", "edit"),
    false,
    "precondition: the chosen role must not be able to fulfil",
  );
  const before = await eventCount(db);

  for (const call of [
    () => confirmSalesOrder(forbidden, { salesOrderId: c.id }, db),
    () => shipSalesOrder(forbidden, { salesOrderId: c.id }, db),
    () => cancelSalesOrder(forbidden, { salesOrderId: c.id }, db),
  ]) {
    await assert.rejects(
      call,
      (err: unknown) => err instanceof SalesOrderError && err.code === "forbidden",
      "a fulfilment call by a role without `fulfillment` must throw SalesOrderError('forbidden')",
    );
  }

  assert.equal(await eventCount(db), before, "a refused fulfilment call appended an Event");
  console.log(`  forbidden: ${forbidden.role} refused on confirm / ship / cancel, event stream unchanged`);
}

async function overReservationIsPrevented(db: Db, c: Candidate): Promise<void> {
  const operator = await actorForRole(db, "sales-manager");
  assert.equal(can(operator.role, "fulfillment", "edit"), true, "precondition: operator can fulfil");

  // Wind the order back to draft and inflate its line past anything the
  // warehouse can cover.
  await db.update(schema.salesOrders).set({ status: "draft" }).where(eq(schema.salesOrders.id, c.id));
  await db
    .update(schema.salesOrderLines)
    .set({ quantity: c.onHand * 100 })
    .where(eq(schema.salesOrderLines.seq, c.lineSeq));

  await assert.rejects(
    () => confirmSalesOrder(operator, { salesOrderId: c.id }, db),
    (err: unknown) => err instanceof SalesOrderError && err.code === "insufficient-stock",
    "confirmSalesOrder must reject a line that cannot be reserved from available stock",
  );

  const [order] = await db
    .select({ status: schema.salesOrders.status })
    .from(schema.salesOrders)
    .where(eq(schema.salesOrders.id, c.id));
  assert.equal(order.status, "draft", "a rejected confirmation left the order a draft");

  // Restore the line quantity and the seeded status.
  await db
    .update(schema.salesOrderLines)
    .set({ quantity: c.quantity })
    .where(eq(schema.salesOrderLines.seq, c.lineSeq));
  await restoreOrderStatus(db, c);
  console.log(`  over-reservation: ${c.number} confirm rejected (insufficient-stock), stayed draft (restored)`);
}

async function confirmReservesWithoutMovementOrDirectWrite(db: Db, c: Candidate): Promise<void> {
  const operator = await actorForRole(db, "sales-manager");

  await db.update(schema.salesOrders).set({ status: "draft" }).where(eq(schema.salesOrders.id, c.id));

  const outstanding = c.quantity - c.fulfilled;
  const eventsBefore = await eventCount(db);
  const seededBefore = await seededReserved(db, c.productId);
  const projectedBefore = await projectedReserved(db, c.productId);

  const confirmed = await confirmSalesOrder(operator, { salesOrderId: c.id }, db);
  assert.equal(confirmed.status, "confirmed", "order is confirmed");
  assert.equal(confirmed.reservedUnits, outstanding, "reservedUnits is the outstanding quantity");

  assert.equal(
    await projectedReserved(db, c.productId),
    projectedBefore + outstanding,
    "the reserved projection rose by the order's outstanding quantity",
  );
  assert.equal(await eventCount(db), eventsBefore, "confirming appended no Event");
  assert.equal(
    await seededReserved(db, c.productId),
    seededBefore,
    "confirming did not write to stock_rows.reserved",
  );

  const cancelled = await cancelSalesOrder(operator, { salesOrderId: c.id, reason: "checks" }, db);
  assert.equal(cancelled.status, "cancelled", "order is cancelled");
  assert.equal(
    await projectedReserved(db, c.productId),
    projectedBefore,
    "cancelling released the reservation (projection back to where it started)",
  );
  assert.equal(await eventCount(db), eventsBefore, "cancelling appended no Event");

  await restoreOrderStatus(db, c);
  console.log(
    `  confirm/cancel: ${c.number} reserved ${outstanding} via projection only (no Event, no stock_rows.reserved write), then released (restored)`,
  );
}

async function shipAppendsSaleLowersOnHandReleasesReservation(db: Db, c: Candidate): Promise<void> {
  const operator = await actorForRole(db, "warehouse-staff");
  assert.equal(can(operator.role, "fulfillment", "edit"), true, "precondition: operator can fulfil");

  // Walk it from draft to packing so the ship path runs end to end.
  await db.update(schema.salesOrders).set({ status: "draft" }).where(eq(schema.salesOrders.id, c.id));
  await confirmSalesOrder(operator, { salesOrderId: c.id }, db);
  await advanceSalesOrder(operator, { salesOrderId: c.id, to: "reserved" }, db);
  await advanceSalesOrder(operator, { salesOrderId: c.id, to: "picking" }, db);
  await advanceSalesOrder(operator, { salesOrderId: c.id, to: "packing" }, db);

  const outstanding = c.quantity - c.fulfilled;
  const [rowBefore] = await db
    .select({ onHand: schema.stockRows.onHand })
    .from(schema.stockRows)
    .where(eq(schema.stockRows.seq, c.rowSeq));
  const projectedBefore = await projectedReserved(db, c.productId);

  const shipped = await shipSalesOrder(
    operator,
    { salesOrderId: c.id, carrier: "Checks Freight" },
    db,
  );
  assert.equal(shipped.status, "shipped", "order is shipped");
  assert.equal(shipped.totalShipped, outstanding, "the outstanding quantity shipped");

  const movementIds = shipped.lines.flatMap((l) => l.movementIds);
  assert.ok(movementIds.length >= 1, "at least one sale Movement was written");
  const movements = await db
    .select()
    .from(schema.movements)
    .where(inArray(schema.movements.id, movementIds));
  for (const m of movements) {
    assert.equal(m.type, "sale", "movement type is sale");
    assert.equal(m.userId, operator.id, "movement is attributed to the operator");
    assert.equal(m.refType, "sales-order", "movement references the sales order");
  }
  assert.equal(
    movements.reduce((s, m) => s + m.qtyChange, 0),
    -outstanding,
    "the sale Movements sum to the negative of the shipped quantity",
  );

  const [rowAfter] = await db
    .select({ onHand: schema.stockRows.onHand })
    .from(schema.stockRows)
    .where(eq(schema.stockRows.seq, c.rowSeq));
  assert.equal(rowAfter.onHand, rowBefore.onHand - outstanding, "on-hand fell by the shipped quantity");

  const [line] = await db
    .select({ quantity: schema.salesOrderLines.quantity, fulfilled: schema.salesOrderLines.fulfilled })
    .from(schema.salesOrderLines)
    .where(eq(schema.salesOrderLines.seq, c.lineSeq));
  assert.equal(line.fulfilled, line.quantity, "the line is fully fulfilled");

  assert.equal(
    await projectedReserved(db, c.productId),
    projectedBefore - outstanding,
    "the shipped order no longer counts toward the reserved projection",
  );

  // Restore: put the units back through the choke point, then reset the order.
  await applyStockChange(
    operator,
    {
      productId: c.productId,
      warehouseId: c.warehouseId,
      locationId: c.locationId,
      lotNumber: c.lotNumber,
      movementType: "count-correction",
      onHandDelta: outstanding,
      reason: "checks: restore shipment",
      permission: { module: "counts", action: "create" },
    },
    db,
  );
  await restoreOrderStatus(db, c);

  const [restored] = await db
    .select({ onHand: schema.stockRows.onHand })
    .from(schema.stockRows)
    .where(eq(schema.stockRows.seq, c.rowSeq));
  assert.equal(restored.onHand, rowBefore.onHand, "on-hand restored to its pre-test value");
  console.log(
    `  ship: ${c.number} shipped ${outstanding} — ${movements.length} sale Movement(s), on-hand ${rowBefore.onHand} -> ${rowAfter.onHand}, reservation released (restored)`,
  );
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  neonConfig.webSocketConstructor = ws;

  const pool = new Pool({ connectionString, max: 5 });
  try {
    const db = drizzle({ client: pool, schema });
    hydrateRoles(await db.select().from(schema.roles));

    const candidates = await pickCandidates(db, 4);
    if (candidates.length < 2) {
      throw new Error(
        `checks: need 2 single-line, amply-stocked sales orders; found ${candidates.length}`,
      );
    }

    // Each check winds its order back to its seeded state, so the first three
    // can share one order; shipping gets its own so a restore that missed
    // cannot mask a later assertion.
    console.log("sales-order fulfilment checks:");
    await forbiddenIsRefused(db, candidates[0]);
    await overReservationIsPrevented(db, candidates[0]);
    await confirmReservesWithoutMovementOrDirectWrite(db, candidates[0]);
    await shipAppendsSaleLowersOnHandReleasesReservation(db, candidates[1]);
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
