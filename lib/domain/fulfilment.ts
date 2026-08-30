/**
 * Sales Order fulfilment (ticket 13) — the flow where the distinction between
 * the two kinds of balance matters most.
 *
 * Reserved is projected from open Sales Order state (`documents.reservedByProduct`
 * — `sum(quantity - fulfilled)` over orders in `confirmed` / `reserved` /
 * `picking` / `packing`), never from a Movement. So:
 *
 *  - `confirmSalesOrder` moves an order `draft -> confirmed`. That alone changes
 *    what is reserved, because the order has entered the open set. No Event is
 *    appended and nothing writes to `stock_rows.reserved`.
 *  - `advanceSalesOrder` steps `confirmed -> reserved -> picking -> packing`.
 *    Still no stock effect — the order stays in the open set the whole way, so
 *    the reservation simply holds.
 *  - `shipSalesOrder` moves `packing -> shipped`. Stock leaves the building, so
 *    this is the one step that appends Movements: one `sale` per line through
 *    the choke point, lowering on-hand. Reserved falls as a consequence — the
 *    order has left the open set and each line's `fulfilled` now equals its
 *    `quantity`.
 *  - `cancelSalesOrder` moves an open order `-> cancelled`. The reservation is
 *    released because the order left the open set; nothing physically moved, so
 *    no Movement is appended. Implementing this as a compensating stock write
 *    would be wrong even if the numbers looked right.
 *
 * Availability is checked at confirm: stock already promised to another open
 * order cannot be promised again. The figure is `sum(on_hand - damaged)` over
 * the product's holdings in the order's warehouse minus `sum(quantity -
 * fulfilled)` over the *other* open Sales Orders on that warehouse — the
 * reserved balance projected from open Document state, not `stock_rows.reserved`.
 *
 * Like `lib/domain/stock.ts` this imports no `server-only` code: the caller
 * passes the Drizzle handle (`getDb()` on the request path, an own `Pool` for
 * `fulfilment.checks.ts`). The permission matrix must already be hydrated.
 */

import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

import { can } from "@/lib/auth/permissions";
import * as schema from "@/lib/db/schema";
import { applyStockChange, type Actor } from "@/lib/domain/stock";
import type { SOStatus } from "@/lib/types";

type Db = NeonDatabase<typeof schema>;

/** Every fulfilment action is gated on the same access (CONTEXT.md: a Role that
 *  forbids fulfilment is refused, per ADR-0004, in the domain — not the UI). */
const FULFIL_PERMISSION = { module: "fulfillment", action: "edit" } as const;

/**
 * The no-stock steps `advanceSalesOrder` makes, as `from -> to`: everything
 * between confirm (`draft -> confirmed`, `confirmSalesOrder`) and ship
 * (`packing -> shipped`, `shipSalesOrder`).
 */
const NEXT_STATUS: Partial<Record<SOStatus, SOStatus>> = {
  confirmed: "reserved",
  reserved: "picking",
  picking: "packing",
};

/** The steps `advanceSalesOrder` will make — everything between confirm and ship. */
export type AdvanceTarget = "reserved" | "picking" | "packing";

/**
 * Sales Order statuses that hold a reservation: the "open set" the reserved
 * projection sums. An order in one of these can still be cancelled, and its
 * outstanding quantity counts against what is available to promise to another
 * order. `lib/repo/documents.ts` imports this for `reservedByProduct`.
 */
export const OPEN_SO_STATUSES = [
  "confirmed",
  "reserved",
  "picking",
  "packing",
] as const satisfies readonly SOStatus[];

export type SalesOrderErrorCode =
  | "forbidden"
  | "not-found"
  | "invalid"
  | "wrong-state"
  | "insufficient-stock";

export class SalesOrderError extends Error {
  constructor(
    message: string,
    readonly code: SalesOrderErrorCode,
  ) {
    super(message);
    this.name = "SalesOrderError";
  }
}

function assertCan(actor: Actor): void {
  if (!can(actor.role, FULFIL_PERMISSION.module, FULFIL_PERMISSION.action)) {
    throw new SalesOrderError(
      `Your role (${actor.role}) is not allowed to fulfil sales orders.`,
      "forbidden",
    );
  }
}

/**
 * How much of a Product can still be promised at a warehouse, from the point of
 * view of Sales Order fulfilment:
 *
 *   sum(on_hand - damaged) over the holdings
 *     - sum(quantity - fulfilled) over OTHER open Sales Orders on that warehouse
 *
 * The second term is the reserved balance projected from open Document state
 * (CONTEXT.md "Reserved") — not `stock_rows.reserved`, which the seed populates
 * independently and which fulfilment must never write. Excluding the order being
 * confirmed keeps a re-confirm idempotent, and lets `confirmSalesOrder` net out
 * the quantity its own earlier lines already claimed via `alreadyPlanned`.
 *
 * ponytail: the reads are not `FOR UPDATE` — two confirmations of *different*
 * orders for the same product, running at once, can each see the other's
 * outstanding as not-yet-committed and both pass. The over-promise then surfaces
 * at ship time, where the choke point's row lock and non-negative check reject
 * the shipment that can't be covered. A `SELECT ... FOR UPDATE` over the
 * product's holdings here would close the window at the cost of serialising
 * confirmations per product.
 */
async function availableToPromise(
  db: Db,
  productId: string,
  warehouseId: string,
  excludeSalesOrderId: string,
  alreadyPlanned: number,
): Promise<number> {
  const [physical] = await db
    .select({
      qty: sql<number>`coalesce(sum(${schema.stockRows.onHand} - ${schema.stockRows.damaged}), 0)::int`,
    })
    .from(schema.stockRows)
    .where(
      and(
        eq(schema.stockRows.productId, productId),
        eq(schema.stockRows.warehouseId, warehouseId),
      ),
    );

  const [reserved] = await db
    .select({
      qty: sql<number>`coalesce(sum(${schema.salesOrderLines.quantity} - ${schema.salesOrderLines.fulfilled}), 0)::int`,
    })
    .from(schema.salesOrderLines)
    .innerJoin(
      schema.salesOrders,
      eq(schema.salesOrders.id, schema.salesOrderLines.salesOrderId),
    )
    .where(
      and(
        eq(schema.salesOrderLines.productId, productId),
        eq(schema.salesOrders.warehouseId, warehouseId),
        ne(schema.salesOrders.id, excludeSalesOrderId),
        inArray(schema.salesOrders.status, [...OPEN_SO_STATUSES]),
      ),
    );

  return (physical?.qty ?? 0) - (reserved?.qty ?? 0) - alreadyPlanned;
}

export interface ConfirmSalesOrderResult {
  salesOrderId: string;
  number: string;
  status: SOStatus;
  /** Units the confirmation newly reserves — `sum(quantity - fulfilled)`. */
  reservedUnits: number;
}

/**
 * Confirm a Sales Order: `draft -> confirmed`. This reserves stock — not by
 * writing a balance, but because the order is now in the open set the reserved
 * projection sums. No Movement is appended.
 *
 * Every line's outstanding quantity must be coverable from what is available at
 * the order's warehouse; otherwise the whole confirmation is rejected with
 * `insufficient-stock` and nothing changes. Stock promised to one customer is
 * not promised to another.
 */
export async function confirmSalesOrder(
  actor: Actor,
  input: { salesOrderId: string },
  db: Db,
): Promise<ConfirmSalesOrderResult> {
  assertCan(actor);

  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(schema.salesOrders)
      .where(eq(schema.salesOrders.id, input.salesOrderId))
      .for("update");
    if (!order) throw new SalesOrderError("Sales order not found.", "not-found");
    if (order.status !== "draft") {
      throw new SalesOrderError(
        `${order.number} is ${order.status}, not a draft, so it cannot be confirmed.`,
        "wrong-state",
      );
    }

    const lines = await tx
      .select()
      .from(schema.salesOrderLines)
      .where(eq(schema.salesOrderLines.salesOrderId, order.id))
      .orderBy(schema.salesOrderLines.seq);
    if (lines.length === 0) {
      throw new SalesOrderError(`${order.number} has no lines to reserve.`, "invalid");
    }

    let reservedUnits = 0;
    // Quantity this confirmation has already claimed per product, so a second
    // line for the same product sees the first line's demand.
    const plannedByProduct = new Map<string, number>();
    for (const line of lines) {
      const outstanding = line.quantity - line.fulfilled;
      if (outstanding <= 0) continue;
      const planned = plannedByProduct.get(line.productId) ?? 0;
      const available = await availableToPromise(
        tx,
        line.productId,
        order.warehouseId,
        order.id,
        planned,
      );
      if (outstanding > available) {
        throw new SalesOrderError(
          `${line.sku}: ${outstanding} needed but only ${available} available at the order's warehouse. ` +
            `Confirming would promise stock already promised elsewhere.`,
          "insufficient-stock",
        );
      }
      plannedByProduct.set(line.productId, planned + outstanding);
      reservedUnits += outstanding;
    }

    await tx
      .update(schema.salesOrders)
      .set({ status: "confirmed" })
      .where(eq(schema.salesOrders.id, order.id));

    return {
      salesOrderId: order.id,
      number: order.number,
      status: "confirmed" as SOStatus,
      reservedUnits,
    };
  });
}

export interface AdvanceSalesOrderResult {
  salesOrderId: string;
  number: string;
  from: SOStatus;
  status: SOStatus;
}

/**
 * Step a Sales Order one place along `confirmed -> reserved -> picking ->
 * packing`. These moves keep the order in the open set, so the reservation
 * holds and no stock moves and no Event is appended — the Document's state is
 * all that advances.
 */
export async function advanceSalesOrder(
  actor: Actor,
  input: { salesOrderId: string; to: AdvanceTarget },
  db: Db,
): Promise<AdvanceSalesOrderResult> {
  assertCan(actor);

  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(schema.salesOrders)
      .where(eq(schema.salesOrders.id, input.salesOrderId))
      .for("update");
    if (!order) throw new SalesOrderError("Sales order not found.", "not-found");

    if (NEXT_STATUS[order.status] !== input.to) {
      throw new SalesOrderError(
        `${order.number} is ${order.status}; it cannot advance to ${input.to}.`,
        "wrong-state",
      );
    }

    await tx
      .update(schema.salesOrders)
      .set({ status: input.to })
      .where(eq(schema.salesOrders.id, order.id));

    return {
      salesOrderId: order.id,
      number: order.number,
      from: order.status,
      status: input.to,
    };
  });
}

export interface ShipSalesOrderLineResult {
  lineId: string;
  sku: string;
  shippedQty: number;
  /** One or more `sale` Movement ids — a line can draw from several holdings. */
  movementIds: string[];
}

export interface ShipSalesOrderResult {
  salesOrderId: string;
  number: string;
  status: SOStatus;
  lines: ShipSalesOrderLineResult[];
  totalShipped: number;
}

/**
 * Ship a Sales Order: `packing -> shipped`. Each line's outstanding quantity
 * leaves stock as one or more `sale` Movements through the choke point, drawn
 * from the product's holdings in the order's warehouse oldest-first. On-hand
 * falls; reserved falls too, as a consequence of the order leaving the open set
 * and each line's `fulfilled` reaching its `quantity`.
 *
 * A line that cannot be covered from on-hand fails the whole shipment — the
 * choke point rejects the change that would drive on-hand negative and the
 * transaction rolls back, so a half-shipped order cannot exist (spec story 26).
 */
export async function shipSalesOrder(
  actor: Actor,
  input: { salesOrderId: string; carrier?: string | null },
  db: Db,
): Promise<ShipSalesOrderResult> {
  assertCan(actor);

  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(schema.salesOrders)
      .where(eq(schema.salesOrders.id, input.salesOrderId))
      .for("update");
    if (!order) throw new SalesOrderError("Sales order not found.", "not-found");
    if (order.status !== "packing") {
      throw new SalesOrderError(
        `${order.number} is ${order.status}; only a packing order can be shipped.`,
        "wrong-state",
      );
    }

    const lines = await tx
      .select()
      .from(schema.salesOrderLines)
      .where(eq(schema.salesOrderLines.salesOrderId, order.id))
      .for("update")
      .orderBy(schema.salesOrderLines.seq);

    const reason = `Shipment of ${order.number}`;
    const results: ShipSalesOrderLineResult[] = [];

    for (const line of lines) {
      const outstanding = line.quantity - line.fulfilled;
      if (outstanding <= 0) {
        results.push({ lineId: line.id, sku: line.sku, shippedQty: 0, movementIds: [] });
        continue;
      }

      // Plan the draw across the product's holdings in this warehouse,
      // oldest-first. The choke point locks and re-checks each holding it
      // touches; this pre-read only decides which holdings and how much.
      // ponytail: a concurrent shipment of the same product could change these
      // balances between here and the choke-point lock. The choke point still
      // rejects an over-draw (rolling the whole shipment back), so the result
      // is safe — just occasionally a retryable failure rather than a clean
      // split. A holding-level reservation ledger would remove even that.
      const holdings = await tx
        .select({
          locationId: schema.stockRows.locationId,
          lotNumber: schema.stockRows.lotNumber,
          onHand: schema.stockRows.onHand,
        })
        .from(schema.stockRows)
        .where(
          and(
            eq(schema.stockRows.productId, line.productId),
            eq(schema.stockRows.warehouseId, order.warehouseId),
          ),
        )
        .orderBy(schema.stockRows.seq);

      let remaining = outstanding;
      const draws: { locationId: string; lotNumber: string | null; qty: number }[] = [];
      for (const h of holdings) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, Math.max(0, h.onHand));
        if (take <= 0) continue;
        draws.push({ locationId: h.locationId, lotNumber: h.lotNumber, qty: take });
        remaining -= take;
      }
      if (remaining > 0) {
        throw new SalesOrderError(
          `${line.sku}: ${outstanding} to ship but only ${outstanding - remaining} on hand at the order's warehouse.`,
          "insufficient-stock",
        );
      }

      const movementIds: string[] = [];
      for (const draw of draws) {
        const change = await applyStockChange(
          actor,
          {
            productId: line.productId,
            warehouseId: order.warehouseId,
            locationId: draw.locationId,
            lotNumber: draw.lotNumber,
            movementType: "sale",
            onHandDelta: -draw.qty,
            reason,
            permission: FULFIL_PERMISSION,
            ref: { type: "sales-order", id: order.id, number: order.number },
          },
          tx,
        );
        movementIds.push(change.movementId);
      }

      await tx
        .update(schema.salesOrderLines)
        .set({ fulfilled: line.quantity })
        .where(eq(schema.salesOrderLines.seq, line.seq));

      results.push({
        lineId: line.id,
        sku: line.sku,
        shippedQty: outstanding,
        movementIds,
      });
    }

    await tx
      .update(schema.salesOrders)
      .set({
        status: "shipped",
        fulfillmentStatus: "fulfilled",
        shippedAt: new Date().toISOString(),
        carrier: input.carrier?.trim() || order.carrier,
      })
      .where(eq(schema.salesOrders.id, order.id));

    return {
      salesOrderId: order.id,
      number: order.number,
      status: "shipped" as SOStatus,
      lines: results,
      totalShipped: results.reduce((s, r) => s + r.shippedQty, 0),
    };
  });
}

export interface CancelSalesOrderResult {
  salesOrderId: string;
  number: string;
  status: SOStatus;
  /** Units the cancellation releases — `sum(quantity - fulfilled)`. */
  releasedUnits: number;
}

/**
 * Cancel an open Sales Order. The reservation is released because the order
 * leaves the open set the reserved projection sums — nothing physically moved,
 * so no Movement is appended and no stock balance is written.
 */
export async function cancelSalesOrder(
  actor: Actor,
  input: { salesOrderId: string },
  db: Db,
): Promise<CancelSalesOrderResult> {
  assertCan(actor);

  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(schema.salesOrders)
      .where(eq(schema.salesOrders.id, input.salesOrderId))
      .for("update");
    if (!order) throw new SalesOrderError("Sales order not found.", "not-found");
    if (!(OPEN_SO_STATUSES as readonly SOStatus[]).includes(order.status)) {
      throw new SalesOrderError(
        `${order.number} is ${order.status} and cannot be cancelled.`,
        "wrong-state",
      );
    }

    const lines = await tx
      .select({ quantity: schema.salesOrderLines.quantity, fulfilled: schema.salesOrderLines.fulfilled })
      .from(schema.salesOrderLines)
      .where(eq(schema.salesOrderLines.salesOrderId, order.id));
    const releasedUnits = lines.reduce((s, l) => s + Math.max(0, l.quantity - l.fulfilled), 0);

    await tx
      .update(schema.salesOrders)
      .set({ status: "cancelled" })
      .where(eq(schema.salesOrders.id, order.id));

    return {
      salesOrderId: order.id,
      number: order.number,
      status: "cancelled" as SOStatus,
      releasedUnits,
    };
  });
}
