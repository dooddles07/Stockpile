/**
 * Analytics rollups.
 *
 * Everything here derives from the same ledger and document tables the
 * operational screens read, so a number on a report and the same number on a
 * list page cannot drift apart.
 *
 * Every function that reads the dataset exists twice during this phase: the
 * original body under a `Sync` suffix (still used by every current caller,
 * unchanged), and a clean async name that only wraps it.
 */

import { db } from "@/lib/data/store";
import { DAY_MS, NOW } from "@/lib/data/rng";
import {
  allSummariesSync,
  categoryByIdSync,
  customerByIdSync,
  productByIdSync,
  summaryForSync,
  totalInventoryValueSync,
  warehouseRollupsSync,
} from "./inventory";

const round = (n: number) => Math.round(n * 100) / 100;

/* ------------------------------------------------------------ valuation -- */

export type ValuationMethod = "avco" | "fifo";

export interface ValuationRow {
  productId: string;
  sku: string;
  name: string;
  category: string;
  onHand: number;
  unitCost: number;
  avcoValue: number;
  fifoValue: number;
  sellPrice: number;
  retailValue: number;
  marginValue: number;
}

/**
 * Stock valued two ways.
 *
 * AVCO uses the standard unit cost. FIFO walks the receipt history backwards
 * and values the on-hand quantity at the prices actually paid for the most
 * recent receipts — which is why the two differ when purchase prices move.
 */
export function valuationRowsSync(): ValuationRow[] {
  const receiptsByProduct = new Map<string, { qty: number; price: number; ts: string }[]>();
  for (const po of db.purchaseOrders) {
    if (!["partially-received", "received", "closed"].includes(po.status)) continue;
    for (const line of po.lines) {
      if (line.fulfilled <= 0) continue;
      const list = receiptsByProduct.get(line.productId) ?? [];
      list.push({
        qty: line.fulfilled,
        price: line.unitPrice,
        ts: po.receivedAt ?? po.createdAt,
      });
      receiptsByProduct.set(line.productId, list);
    }
  }

  return db.products
    .map((product) => {
      const stock = summaryForSync(product.id);
      if (stock.onHand <= 0) return null;

      // FIFO: the units still on hand are the most recently received ones.
      const receipts = (receiptsByProduct.get(product.id) ?? []).sort((a, b) =>
        b.ts.localeCompare(a.ts),
      );
      let remaining = stock.onHand;
      let fifoValue = 0;
      for (const receipt of receipts) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, receipt.qty);
        fifoValue += take * receipt.price;
        remaining -= take;
      }
      // Anything older than the recorded receipts falls back to standard cost.
      fifoValue += remaining * product.unitCost;

      const avcoValue = stock.onHand * product.unitCost;
      const retailValue = stock.onHand * product.sellPrice;

      return {
        productId: product.id,
        sku: product.sku,
        name: product.shortName,
        category: categoryByIdSync.get(product.categoryId)?.name ?? "—",
        onHand: stock.onHand,
        unitCost: product.unitCost,
        avcoValue: round(avcoValue),
        fifoValue: round(fifoValue),
        sellPrice: product.sellPrice,
        retailValue: round(retailValue),
        marginValue: round(retailValue - avcoValue),
      };
    })
    .filter((r): r is ValuationRow => r !== null)
    .sort((a, b) => b.avcoValue - a.avcoValue);
}

export async function valuationRows(): Promise<ValuationRow[]> {
  return valuationRowsSync();
}

/* ------------------------------------------------------------- turnover -- */

export interface TurnoverRow {
  productId: string;
  sku: string;
  name: string;
  category: string;
  onHand: number;
  stockValue: number;
  cogs12m: number;
  unitsSold12m: number;
  turns: number;
  daysOfCover: number | null;
  lastMovedAt: string | null;
  daysSinceMovement: number | null;
}

const YEAR_AGO = NOW.getTime() - 365 * DAY_MS;

let turnoverCache: TurnoverRow[] | null = null;

export function turnoverRowsSync(): TurnoverRow[] {
  if (turnoverCache) return turnoverCache;

  const sold = new Map<string, { units: number; cost: number }>();
  const lastMoved = new Map<string, number>();

  for (const m of db.movements) {
    const t = new Date(m.ts).getTime();
    if (t > (lastMoved.get(m.productId) ?? 0)) lastMoved.set(m.productId, t);
    if (m.type !== "sale" || t < YEAR_AGO) continue;
    const cur = sold.get(m.productId) ?? { units: 0, cost: 0 };
    cur.units += Math.abs(m.qtyChange);
    cur.cost += Math.abs(m.valueChange);
    sold.set(m.productId, cur);
  }

  turnoverCache = db.products
    .map((product) => {
      const stock = summaryForSync(product.id);
      const s = sold.get(product.id) ?? { units: 0, cost: 0 };
      const stockValue = stock.value;
      const moved = lastMoved.get(product.id) ?? null;

      // Turns = cost of goods sold ÷ the value sitting on the shelf.
      const turns = stockValue > 0 ? s.cost / stockValue : 0;
      const dailyRate = s.units / 365;

      return {
        productId: product.id,
        sku: product.sku,
        name: product.shortName,
        category: categoryByIdSync.get(product.categoryId)?.name ?? "—",
        onHand: stock.onHand,
        stockValue,
        cogs12m: round(s.cost),
        unitsSold12m: s.units,
        turns: round(turns),
        daysOfCover: dailyRate > 0 ? Math.round(stock.available / dailyRate) : null,
        lastMovedAt: moved ? new Date(moved).toISOString() : null,
        daysSinceMovement: moved ? Math.round((NOW.getTime() - moved) / DAY_MS) : null,
      };
    })
    .filter((r) => r.onHand > 0 || r.unitsSold12m > 0);

  return turnoverCache;
}

export async function turnoverRows(): Promise<TurnoverRow[]> {
  return turnoverRowsSync();
}

/** Stock with value on the shelf that has not moved in `days`. */
export function deadStockRowsSync(days = 180): TurnoverRow[] {
  return turnoverRowsSync()
    .filter(
      (r) =>
        r.stockValue > 0 &&
        (r.daysSinceMovement === null || r.daysSinceMovement >= days),
    )
    .sort((a, b) => b.stockValue - a.stockValue);
}

export async function deadStockRows(days = 180): Promise<TurnoverRow[]> {
  return deadStockRowsSync(days);
}

/** Ageing buckets by how long since the SKU last moved. */
export function agingBucketsSync() {
  const buckets = [
    { label: "0–30 days", min: 0, max: 30 },
    { label: "31–60 days", min: 31, max: 60 },
    { label: "61–90 days", min: 61, max: 90 },
    { label: "91–180 days", min: 91, max: 180 },
    { label: "Over 180 days", min: 181, max: Infinity },
  ];

  const rows = turnoverRowsSync().filter((r) => r.stockValue > 0);

  return buckets.map((b) => {
    const inBucket = rows.filter((r) => {
      const age = r.daysSinceMovement ?? Infinity;
      return age >= b.min && age <= b.max;
    });
    return {
      label: b.label,
      skus: inBucket.length,
      value: Math.round(inBucket.reduce((s, r) => s + r.stockValue, 0)),
      units: inBucket.reduce((s, r) => s + r.onHand, 0),
    };
  });
}

export async function agingBuckets() {
  return agingBucketsSync();
}

/* ---------------------------------------------------------- sales rollups */

export interface ProductPerformanceRow {
  productId: string;
  sku: string;
  name: string;
  category: string;
  unitsSold: number;
  revenue: number;
  cost: number;
  margin: number;
  marginPct: number;
  orders: number;
}

let performanceCache: ProductPerformanceRow[] | null = null;

export function productPerformanceSync(): ProductPerformanceRow[] {
  if (performanceCache) return performanceCache;

  const acc = new Map<string, { units: number; revenue: number; cost: number; orders: Set<string> }>();

  for (const order of db.salesOrders) {
    if (["cancelled", "draft"].includes(order.status)) continue;
    for (const line of order.lines) {
      const cur =
        acc.get(line.productId) ?? { units: 0, revenue: 0, cost: 0, orders: new Set<string>() };
      const product = productByIdSync.get(line.productId);
      cur.units += line.quantity;
      cur.revenue += line.lineTotal;
      cur.cost += line.quantity * (product?.unitCost ?? 0);
      cur.orders.add(order.id);
      acc.set(line.productId, cur);
    }
  }

  performanceCache = [...acc.entries()]
    .map(([productId, v]) => {
      const product = productByIdSync.get(productId);
      const margin = v.revenue - v.cost;
      return {
        productId,
        sku: product?.sku ?? "—",
        name: product?.shortName ?? "—",
        category: product ? (categoryByIdSync.get(product.categoryId)?.name ?? "—") : "—",
        unitsSold: v.units,
        revenue: round(v.revenue),
        cost: round(v.cost),
        margin: round(margin),
        marginPct: v.revenue > 0 ? margin / v.revenue : 0,
        orders: v.orders.size,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  return performanceCache;
}

export async function productPerformance(): Promise<ProductPerformanceRow[]> {
  return productPerformanceSync();
}

export function categoryPerformanceSync() {
  const acc = new Map<string, { revenue: number; margin: number; units: number; skus: Set<string> }>();
  for (const row of productPerformanceSync()) {
    const cur = acc.get(row.category) ?? { revenue: 0, margin: 0, units: 0, skus: new Set<string>() };
    cur.revenue += row.revenue;
    cur.margin += row.margin;
    cur.units += row.unitsSold;
    cur.skus.add(row.productId);
    acc.set(row.category, cur);
  }
  return [...acc.entries()]
    .map(([name, v]) => ({
      name,
      revenue: Math.round(v.revenue),
      margin: Math.round(v.margin),
      marginPct: v.revenue > 0 ? v.margin / v.revenue : 0,
      units: v.units,
      skus: v.skus.size,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

export async function categoryPerformance() {
  return categoryPerformanceSync();
}

export function topCustomersSync(limit = 10) {
  const acc = new Map<string, { revenue: number; orders: number; units: number }>();
  for (const order of db.salesOrders) {
    if (["cancelled", "draft"].includes(order.status)) continue;
    const cur = acc.get(order.customerId) ?? { revenue: 0, orders: 0, units: 0 };
    cur.revenue += order.total;
    cur.orders += 1;
    cur.units += order.lines.reduce((s, l) => s + l.quantity, 0);
    acc.set(order.customerId, cur);
  }
  return [...acc.entries()]
    .map(([id, v]) => ({
      id,
      name: customerByIdSync.get(id)?.name ?? "—",
      code: customerByIdSync.get(id)?.code ?? "—",
      revenue: Math.round(v.revenue),
      orders: v.orders,
      units: v.units,
      averageOrder: Math.round(v.revenue / Math.max(1, v.orders)),
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

export async function topCustomers(limit = 10) {
  return topCustomersSync(limit);
}

/* ------------------------------------------------------ purchasing rollups */

export function supplierScorecardsSync() {
  return db.suppliers
    .map((supplier) => {
      const orders = db.purchaseOrders.filter((p) => p.supplierId === supplier.id);
      const settled = orders.filter((p) => ["received", "closed"].includes(p.status));
      const onTime = settled.filter(
        (p) => p.receivedAt && new Date(p.receivedAt).getTime() <= new Date(p.expectedAt).getTime(),
      );
      const open = orders.filter((p) =>
        ["submitted", "approved", "ordered", "partially-received"].includes(p.status),
      );
      const overdue = open.filter((p) => new Date(p.expectedAt).getTime() < NOW.getTime());
      const returns = db.returns.filter(
        (r) => r.kind === "purchase" && r.partnerId === supplier.id,
      );

      const spend = orders
        .filter((p) => !["cancelled", "draft"].includes(p.status))
        .reduce((s, p) => s + p.total, 0);

      return {
        id: supplier.id,
        code: supplier.code,
        name: supplier.name,
        status: supplier.status,
        leadTimeDays: supplier.leadTimeDays,
        onTimeRate: supplier.onTimeRate,
        observedOnTime: settled.length > 0 ? onTime.length / settled.length : null,
        settledOrders: settled.length,
        defectRate: supplier.defectRate,
        spend: Math.round(spend),
        openOrders: open.length,
        overdueOrders: overdue.length,
        returns: returns.length,
        returnValue: Math.round(returns.reduce((s, r) => s + r.refundTotal, 0)),
      };
    })
    .sort((a, b) => b.spend - a.spend);
}

export async function supplierScorecards() {
  return supplierScorecardsSync();
}

export function spendByCategorySync() {
  const acc = new Map<string, number>();
  for (const po of db.purchaseOrders) {
    if (["cancelled", "draft"].includes(po.status)) continue;
    for (const line of po.lines) {
      const product = productByIdSync.get(line.productId);
      const name = product ? (categoryByIdSync.get(product.categoryId)?.name ?? "—") : "—";
      acc.set(name, (acc.get(name) ?? 0) + line.lineTotal);
    }
  }
  return [...acc.entries()]
    .map(([name, value]) => ({ name, value: Math.round(value) }))
    .sort((a, b) => b.value - a.value);
}

export async function spendByCategory() {
  return spendByCategorySync();
}

/* ------------------------------------------------------- warehouse rollups */

export function warehousePerformanceSync() {
  return warehouseRollupsSync().map((w) => {
    const receipts = db.purchaseOrders.filter(
      (p) => p.warehouseId === w.id && ["received", "closed"].includes(p.status),
    );
    const onTimeReceipts = receipts.filter(
      (p) => p.receivedAt && new Date(p.receivedAt).getTime() <= new Date(p.expectedAt).getTime(),
    );

    const orders = db.salesOrders.filter((o) => o.warehouseId === w.id);
    const shipped = orders.filter((o) => o.shippedAt);
    const onTimeShipped = shipped.filter(
      (o) => new Date(o.shippedAt!).getTime() <= new Date(o.promisedAt).getTime(),
    );

    const counts = db.stockCounts.filter(
      (c) => c.warehouseId === w.id && ["approved", "applied"].includes(c.status),
    );
    const accuracy =
      counts.length > 0 ? counts.reduce((s, c) => s + c.accuracyPct, 0) / counts.length / 100 : null;

    const transfersOut = db.transfers.filter((t) => t.fromWarehouseId === w.id);
    const transfersIn = db.transfers.filter((t) => t.toWarehouseId === w.id);

    const adjustments = db.adjustments.filter(
      (a) => a.warehouseId === w.id && a.status === "applied",
    );
    const shrinkage = adjustments
      .filter((a) => a.totalValueImpact < 0)
      .reduce((s, a) => s + Math.abs(a.totalValueImpact), 0);

    return {
      ...w,
      receipts: receipts.length,
      receivingOnTime: receipts.length > 0 ? onTimeReceipts.length / receipts.length : null,
      ordersShipped: shipped.length,
      shippingOnTime: shipped.length > 0 ? onTimeShipped.length / shipped.length : null,
      countAccuracy: accuracy,
      transfersOut: transfersOut.length,
      transfersIn: transfersIn.length,
      shrinkageValue: Math.round(shrinkage),
      shrinkageRate: w.inventoryValue > 0 ? shrinkage / w.inventoryValue : 0,
    };
  });
}

export async function warehousePerformance() {
  return warehousePerformanceSync();
}

/* ---------------------------------------------------------------- summary */

export function inventoryHeadlineSync() {
  const summaries = allSummariesSync();
  const value = totalInventoryValueSync();
  const dead = deadStockRowsSync();
  const turnover = turnoverRowsSync();
  const totalCogs = turnover.reduce((s, r) => s + r.cogs12m, 0);

  return {
    value,
    skus: summaries.filter((s) => s.onHand > 0).length,
    units: summaries.reduce((s, x) => s + x.onHand, 0),
    reserved: summaries.reduce((s, x) => s + x.reserved, 0),
    deadValue: dead.reduce((s, r) => s + r.stockValue, 0),
    deadSkus: dead.length,
    turns: value > 0 ? round(totalCogs / value) : 0,
    cogs12m: Math.round(totalCogs),
  };
}

export async function inventoryHeadline() {
  return inventoryHeadlineSync();
}
