/**
 * Documents and the movement ledger.
 *
 * Raw reads of the event-sourced document tables (Purchase Order, Sales
 * Order, Transfer, Adjustment, Stock Count, Return) plus the Movement
 * ledger, unjoined. See `reference.ts` for why these are raw lists rather
 * than screen-shaped joins.
 */

import { db } from "@/lib/data/store";
import type {
  Adjustment,
  Movement,
  PurchaseOrder,
  ReturnDoc,
  SalesOrder,
  StockCount,
  Transfer,
} from "@/lib/types";

export async function purchaseOrders(): Promise<PurchaseOrder[]> {
  return db.purchaseOrders;
}

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

export async function returns(): Promise<ReturnDoc[]> {
  return db.returns;
}

export async function movements(): Promise<Movement[]> {
  return db.movements;
}
