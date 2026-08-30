/**
 * Documents and the movement ledger.
 *
 * Raw reads of the event-sourced document tables (Purchase Order, Sales
 * Order, Transfer, Adjustment, Stock Count, Return) plus the Movement
 * ledger, unjoined. See `reference.ts` for why these are raw lists rather
 * than screen-shaped joins.
 *
 * Ticket 03 moved Purchase Orders and Returns onto Postgres; ticket 04 moved
 * Sales Orders; ticket 05 moved Transfers; ticket 07 moves the Movement ledger,
 * Adjustments and Stock Counts. Each is two queries — the parent rows and the
 * line rows — stitched back into the nested shape the screens expect, deduped
 * per request via React `cache`. Movements is one flat query.
 *
 * `incomingByProduct` / `reservedByProduct` / `inTransitByProduct` are the
 * incoming, reserved and in-transit balances projected from open Purchase
 * Order / Sales Order / Transfer state (ADR-0002, CONTEXT.md, spec story 21):
 * never from the Movement ledger, which has no movement type that produces
 * incoming or reserved and settles a transfer only once it lands.
 *
 * Adjustments and Stock Counts get their write paths in tickets 10 / 15; the
 * read swap and seed are done here so ticket 08 can retire the dataset.
 */

import { cache } from "react";

import { eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import type {
  Adjustment,
  Movement,
  PurchaseOrder,
  ReturnDoc,
  SalesOrder,
  StockCount,
  Transfer,
} from "@/lib/types";

/**
 * Purchase Order statuses where spend is committed but the goods have not all
 * arrived — the set the purchasing screens already call "open". `draft` is not
 * committed; `received` / `closed` / `cancelled` are settled and contribute
 * nothing incoming.
 */
const OPEN_PO_STATUSES = ["submitted", "approved", "ordered", "partially-received"] as const;

/**
 * Sales Order statuses that hold stock: `confirmed` through `packing`. The
 * sales-orders screen states the rule — "Confirming an order reserves stock
 * against it" — so reservation starts at `confirmed`, not at the later
 * `reserved` step. `draft` is uncommitted; `shipped` / `delivered` have
 * released the stock as `sale` Movements; `cancelled` released it too;
 * `backorder` could not be reserved from stock in the first place.
 */
const OPEN_SO_STATUSES = ["confirmed", "reserved", "picking", "packing"] as const;

/**
 * Transfer statuses that hold stock in transit: despatched from the source and
 * not yet fully landed. `draft` / `pending-approval` / `approved` have not
 * shipped; `received` / `cancelled` are settled — the ledger carries their
 * `transfer-out` / `transfer-in` Movements and nothing is still moving.
 */
const OPEN_TRANSFER_STATUSES = ["in-transit", "partially-received"] as const;

/** Group rows by a key, preserving input order within each group. */
function groupBy<T>(rows: T[], keyOf: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    let group = groups.get(key);
    if (!group) groups.set(key, (group = []));
    group.push(row);
  }
  return groups;
}

export const purchaseOrders = cache(async (): Promise<PurchaseOrder[]> => {
  const pg = getDb();
  const [orders, lineRows] = await Promise.all([
    pg.select().from(schema.purchaseOrders).orderBy(schema.purchaseOrders.id),
    pg.select().from(schema.purchaseOrderLines).orderBy(schema.purchaseOrderLines.seq),
  ]);

  const linesByOrder = groupBy(lineRows, (r) => r.purchaseOrderId);
  return orders.map((order) => ({
    ...order,
    // Drop the identity PK and parent FK; a null `note` column becomes the
    // absent optional field.
    lines: (linesByOrder.get(order.id) ?? []).map(({ seq, purchaseOrderId, note, ...line }) =>
      note == null ? line : { ...line, note },
    ),
  }));
});

/**
 * Incoming quantity per Product: `sum(quantity - fulfilled)` across the lines
 * of every open Purchase Order — the incoming balance projected from open
 * Document state, per ADR-0002 and spec story 21.
 *
 * The read-phase stock screens still render the seeded `stock_rows.incoming`
 * projection; the write path (ticket 09) is what rebuilds that projection, and
 * this is the query it is rebuilt from.
 */
export const incomingByProduct = cache(async (): Promise<Map<string, number>> => {
  const rows = await getDb()
    .select({
      productId: schema.purchaseOrderLines.productId,
      // `greatest(..., 0)` per line: an over-received line records the excess in
      // `fulfilled` (ticket 12) but still contributes zero incoming, never a
      // negative.
      incoming: sql<number>`sum(greatest(${schema.purchaseOrderLines.quantity} - ${schema.purchaseOrderLines.fulfilled}, 0))::int`,
    })
    .from(schema.purchaseOrderLines)
    .innerJoin(
      schema.purchaseOrders,
      eq(schema.purchaseOrders.id, schema.purchaseOrderLines.purchaseOrderId),
    )
    .where(inArray(schema.purchaseOrders.status, [...OPEN_PO_STATUSES]))
    .groupBy(schema.purchaseOrderLines.productId);
  return new Map(rows.map((r) => [r.productId, r.incoming]));
});

export const salesOrders = cache(async (): Promise<SalesOrder[]> => {
  const pg = getDb();
  const [orders, lineRows] = await Promise.all([
    pg.select().from(schema.salesOrders).orderBy(schema.salesOrders.id),
    pg.select().from(schema.salesOrderLines).orderBy(schema.salesOrderLines.seq),
  ]);

  const linesByOrder = groupBy(lineRows, (r) => r.salesOrderId);
  return orders.map((order) => ({
    ...order,
    // Drop the identity PK and parent FK; a null `note` column becomes the
    // absent optional field.
    lines: (linesByOrder.get(order.id) ?? []).map(({ seq, salesOrderId, note, ...line }) =>
      note == null ? line : { ...line, note },
    ),
  }));
});

/**
 * Reserved quantity per Product: `sum(quantity - fulfilled)` across the lines
 * of every open Sales Order — the reserved balance projected from open
 * Document state, per ADR-0002 and CONTEXT.md ("Reserved" is derived from open
 * Documents, never from Movements).
 *
 * The read-phase stock screens still render the seeded `stock_rows.reserved`
 * projection; the write path (ticket 09) is what rebuilds that projection, and
 * this is the query it is rebuilt from.
 */
export const reservedByProduct = cache(async (): Promise<Map<string, number>> => {
  const rows = await getDb()
    .select({
      productId: schema.salesOrderLines.productId,
      reserved: sql<number>`sum(${schema.salesOrderLines.quantity} - ${schema.salesOrderLines.fulfilled})::int`,
    })
    .from(schema.salesOrderLines)
    .innerJoin(
      schema.salesOrders,
      eq(schema.salesOrders.id, schema.salesOrderLines.salesOrderId),
    )
    .where(inArray(schema.salesOrders.status, [...OPEN_SO_STATUSES]))
    .groupBy(schema.salesOrderLines.productId);
  return new Map(rows.map((r) => [r.productId, r.reserved]));
});

export const transfers = cache(async (): Promise<Transfer[]> => {
  const pg = getDb();
  const [docs, lineRows] = await Promise.all([
    pg.select().from(schema.transfers).orderBy(schema.transfers.id),
    pg.select().from(schema.transferLines).orderBy(schema.transferLines.seq),
  ]);

  const linesByTransfer = groupBy(lineRows, (r) => r.transferId);
  return docs.map((doc) => ({
    ...doc,
    // Drop the identity PK and parent FK; the nullable `to_location_id` column
    // stays as `string | null`, which is what `TransferLine` already declares.
    lines: (linesByTransfer.get(doc.id) ?? []).map(({ seq, transferId, ...line }) => line),
  }));
});

/**
 * In-transit quantity per Product: `sum(shipped - received)` across the lines
 * of every open Transfer — the in-transit balance projected from open Document
 * state, per ADR-0002 and CONTEXT.md ("In Transit" is derived from open
 * Documents, never from Movements).
 *
 * The read-phase stock screens still render the seeded `stock_rows.in_transit`
 * projection; the write path (ticket 09) is what rebuilds that projection, and
 * this is the query it is rebuilt from.
 */
export const inTransitByProduct = cache(async (): Promise<Map<string, number>> => {
  const rows = await getDb()
    .select({
      productId: schema.transferLines.productId,
      inTransit: sql<number>`sum(${schema.transferLines.shipped} - ${schema.transferLines.received})::int`,
    })
    .from(schema.transferLines)
    .innerJoin(schema.transfers, eq(schema.transfers.id, schema.transferLines.transferId))
    .where(inArray(schema.transfers.status, [...OPEN_TRANSFER_STATUSES]))
    .groupBy(schema.transferLines.productId);
  return new Map(rows.map((r) => [r.productId, r.inTransit]));
});

export interface TransferRow extends Transfer {
  /** Requested quantity across every line. */
  units: number;
  /** Despatched-so-far quantity across every line — what has actually left the source. */
  shippedUnits: number;
  /** Booked-in-so-far quantity across every line. */
  receivedUnits: number;
}

/**
 * Transfers joined with their own line totals. A transfer's in-transit
 * quantity — shipped but not yet received — is derived from this open
 * document state, so screens read it here rather than re-summing
 * `t.lines` themselves.
 */
export async function transferRows(): Promise<TransferRow[]> {
  return (await transfers()).map((t) => ({
    ...t,
    units: t.lines.reduce((s, l) => s + l.quantity, 0),
    shippedUnits: t.lines.reduce((s, l) => s + l.shipped, 0),
    receivedUnits: t.lines.reduce((s, l) => s + l.received, 0),
  }));
}

export const adjustments = cache(async (): Promise<Adjustment[]> => {
  const pg = getDb();
  const [docs, lineRows] = await Promise.all([
    pg.select().from(schema.adjustments).orderBy(schema.adjustments.id),
    pg.select().from(schema.adjustmentLines).orderBy(schema.adjustmentLines.seq),
  ]);

  const linesByAdjustment = groupBy(lineRows, (r) => r.adjustmentId);
  return docs.map((doc) => ({
    ...doc,
    lines: (linesByAdjustment.get(doc.id) ?? []).map(({ seq, adjustmentId, ...line }) => line),
  }));
});

export const stockCounts = cache(async (): Promise<StockCount[]> => {
  const pg = getDb();
  const [docs, lineRows] = await Promise.all([
    pg.select().from(schema.stockCounts).orderBy(schema.stockCounts.id),
    pg.select().from(schema.countLines).orderBy(schema.countLines.seq),
  ]);

  const linesByCount = groupBy(lineRows, (r) => r.stockCountId);
  return docs.map((doc) => ({
    ...doc,
    lines: (linesByCount.get(doc.id) ?? []).map(({ seq, stockCountId, ...line }) => line),
  }));
});

export const returns = cache(async (): Promise<ReturnDoc[]> => {
  const pg = getDb();
  const [docs, lines] = await Promise.all([
    pg.select().from(schema.returns).orderBy(schema.returns.id),
    pg.select().from(schema.returnLines).orderBy(schema.returnLines.seq),
  ]);

  const linesByReturn = groupBy(lines, (r) => r.returnId);
  return docs.map((doc) => ({
    ...doc,
    lines: (linesByReturn.get(doc.id) ?? []).map(({ seq, returnId, ...line }) => line),
  }));
});

/**
 * The Movement ledger, newest first. `seq` is the generated insert order and
 * the seed loads the generator's already-newest-first array in order, so
 * `ORDER BY seq` reproduces it. Strip the column back off — callers expect the
 * bare `Movement` shape.
 */
export const movements = cache(async (): Promise<Movement[]> => {
  const rows = await getDb().select().from(schema.movements).orderBy(schema.movements.seq);
  return rows.map(({ seq, ...movement }) => movement);
});
