/**
 * Documents and the movement ledger.
 *
 * Raw reads of the event-sourced document tables (Purchase Order, Sales
 * Order, Transfer, Adjustment, Stock Count, Return) plus the Movement
 * ledger, unjoined. See `reference.ts` for why these are raw lists rather
 * than screen-shaped joins.
 *
 * Ticket 03 moved Purchase Orders and Returns onto Postgres. Each is two
 * queries — the parent rows and the line rows — stitched back into the nested
 * shape the screens expect, deduped per request via React `cache`.
 *
 * `incomingByProduct` is the incoming balance projected from open Purchase
 * Order state (ADR-0002, spec story 21): never from the Movement ledger, which
 * has no movement type that produces it.
 *
 * The remaining accessors still read the generated dataset until their ticket
 * (04 sales, 05 transfers, 10/15 adjustments and counts).
 */

import { cache } from "react";

import { eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/data/store";
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
      incoming: sql<number>`sum(${schema.purchaseOrderLines.quantity} - ${schema.purchaseOrderLines.fulfilled})::int`,
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

export async function salesOrders(): Promise<SalesOrder[]> {
  return db.salesOrders;
}

export async function transfers(): Promise<Transfer[]> {
  return db.transfers;
}

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

export async function adjustments(): Promise<Adjustment[]> {
  return db.adjustments;
}

export async function stockCounts(): Promise<StockCount[]> {
  return db.stockCounts;
}

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

export async function movements(): Promise<Movement[]> {
  return db.movements;
}
