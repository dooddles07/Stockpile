/**
 * Documents and the movement ledger.
 *
 * Raw reads of the event-sourced document tables (Purchase Order, Sales
 * Order, Transfer, Adjustment, Stock Count, Return) plus the Movement
 * ledger, unjoined. See `reference.ts` for why these are raw lists rather
 * than screen-shaped joins, and `inventory.ts` for the Sync/async pattern.
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

export function purchaseOrdersSync(): PurchaseOrder[] {
  return db.purchaseOrders;
}

export async function purchaseOrders(): Promise<PurchaseOrder[]> {
  return purchaseOrdersSync();
}

export function salesOrdersSync(): SalesOrder[] {
  return db.salesOrders;
}

export async function salesOrders(): Promise<SalesOrder[]> {
  return salesOrdersSync();
}

export function transfersSync(): Transfer[] {
  return db.transfers;
}

export async function transfers(): Promise<Transfer[]> {
  return transfersSync();
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

export function adjustmentsSync(): Adjustment[] {
  return db.adjustments;
}

export async function adjustments(): Promise<Adjustment[]> {
  return adjustmentsSync();
}

export function stockCountsSync(): StockCount[] {
  return db.stockCounts;
}

export async function stockCounts(): Promise<StockCount[]> {
  return stockCountsSync();
}

export function returnsSync(): ReturnDoc[] {
  return db.returns;
}

export async function returns(): Promise<ReturnDoc[]> {
  return returnsSync();
}

export function movementsSync(): Movement[] {
  return db.movements;
}

export async function movements(): Promise<Movement[]> {
  return movementsSync();
}
