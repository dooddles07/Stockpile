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
