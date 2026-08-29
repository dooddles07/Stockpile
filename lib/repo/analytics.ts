/**
 * Analytics rollups.
 *
 * Everything here derives from the same ledger and document tables the
 * operational screens read, so a number on a report and the same number on a
 * list page cannot drift apart.
 *
 * Ticket 07: the bodies now read Postgres. The ledger-wide rollups — turnover,
 * dead stock, product and category performance, category spend — are computed
 * as SQL aggregates rather than by fetching rows and summing them, because on
 * these screens the alternative is pulling a large fraction of the movement
 * and order-line tables into the request. The two per-entity scorecards
 * (`supplierScorecards`, `warehousePerformance`) stay in application code over
 * the already-Postgres-backed document accessors: each computes a dozen
 * heterogeneous figures per row over a few hundred documents, and expressing
 * that as one query buys nothing.
 */

import { eq, notInArray, sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { DAY_MS, NOW } from "@/lib/data/rng";
import {
  adjustments as allAdjustments,
  purchaseOrders as allPurchaseOrders,
  returns as allReturns,
  salesOrders as allSalesOrders,
  stockCounts as allStockCounts,
  transfers as allTransfers,
} from "./documents";
import {
  categories as allCategories,
  customers as allCustomers,
  indexById,
  products as allProducts,
  suppliers as allSuppliers,
} from "./reference";
import { allSummaries, totalInventoryValue, warehouseRollups } from "./inventory";
import type { StockSummary } from "@/lib/types";

const round = (n: number) => Math.round(n * 100) / 100;

async function summaryMap(): Promise<Map<string, StockSummary>> {
  return new Map((await allSummaries()).map((s) => [s.productId, s]));
}

/** Statuses excluded from every sales rollup: nothing was really sold. */
const DEAD_SO_STATUSES = ["cancelled", "draft"] as const;
/** Statuses excluded from every purchasing rollup: spend not committed. */
const DEAD_PO_STATUSES = ["cancelled", "draft"] as const;

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
export async function valuationRows(): Promise<ValuationRow[]> {
  const [summaries, products, categoryById, purchaseOrders] = await Promise.all([
    summaryMap(),
    allProducts(),
    indexById(allCategories),
    allPurchaseOrders(),
  ]);

  const receiptsByProduct = new Map<string, { qty: number; price: number; ts: string }[]>();
  for (const po of purchaseOrders) {
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

  return products
    .map((product) => {
      const stock = summaries.get(product.id)!;
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
        category: categoryById.get(product.categoryId)?.name ?? "—",
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

const YEAR_AGO_ISO = new Date(NOW.getTime() - 365 * DAY_MS).toISOString();

let turnoverCache: TurnoverRow[] | null = null;

export async function turnoverRows(): Promise<TurnoverRow[]> {
  if (turnoverCache) return turnoverCache;

  const [summaries, products, categoryById, ledger] = await Promise.all([
    summaryMap(),
    allProducts(),
    indexById(allCategories),
    // One aggregate per product: 12-month sale units and cost from the ledger,
    // plus the timestamp of its most recent movement of any type.
    getDb()
      .select({
        productId: schema.movements.productId,
        units: sql<number>`coalesce(sum(case when ${schema.movements.type} = 'sale' and ${schema.movements.ts} >= ${YEAR_AGO_ISO} then abs(${schema.movements.qtyChange}) else 0 end), 0)::int`,
        cost: sql<number>`coalesce(sum(case when ${schema.movements.type} = 'sale' and ${schema.movements.ts} >= ${YEAR_AGO_ISO} then abs(${schema.movements.valueChange}) else 0 end), 0)::float8`,
        lastMoved: sql<string | null>`max(${schema.movements.ts})`,
      })
      .from(schema.movements)
      .groupBy(schema.movements.productId),
  ]);

  const soldByProduct = new Map(ledger.map((r) => [r.productId, r]));

  turnoverCache = products
    .map((product) => {
      const stock = summaries.get(product.id)!;
      const s = soldByProduct.get(product.id) ?? { units: 0, cost: 0, lastMoved: null as string | null };
      const stockValue = stock.value;
      const moved = s.lastMoved ? new Date(s.lastMoved).getTime() : null;

      // Turns = cost of goods sold ÷ the value sitting on the shelf.
      const turns = stockValue > 0 ? s.cost / stockValue : 0;
      const dailyRate = s.units / 365;

      return {
        productId: product.id,
        sku: product.sku,
        name: product.shortName,
        category: categoryById.get(product.categoryId)?.name ?? "—",
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

/** Stock with value on the shelf that has not moved in `days`. */
export async function deadStockRows(days = 180): Promise<TurnoverRow[]> {
  return (await turnoverRows())
    .filter(
      (r) =>
        r.stockValue > 0 &&
        (r.daysSinceMovement === null || r.daysSinceMovement >= days),
    )
    .sort((a, b) => b.stockValue - a.stockValue);
}

/** Ageing buckets by how long since the SKU last moved. */
export async function agingBuckets() {
  const buckets = [
    { label: "0–30 days", min: 0, max: 30 },
    { label: "31–60 days", min: 31, max: 60 },
    { label: "61–90 days", min: 61, max: 90 },
    { label: "91–180 days", min: 91, max: 180 },
    { label: "Over 180 days", min: 181, max: Infinity },
  ];

  const rows = (await turnoverRows()).filter((r) => r.stockValue > 0);

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

export async function productPerformance(): Promise<ProductPerformanceRow[]> {
  if (performanceCache) return performanceCache;

  const categoryById = await indexById(allCategories);

  // Units, revenue, cost and order count per product, straight from the sales
  // order lines — cost is quantity valued at the product's standard unit cost.
  const rows = await getDb()
    .select({
      productId: schema.salesOrderLines.productId,
      sku: schema.products.sku,
      name: schema.products.shortName,
      categoryId: schema.products.categoryId,
      units: sql<number>`sum(${schema.salesOrderLines.quantity})::int`,
      revenue: sql<number>`sum(${schema.salesOrderLines.lineTotal})::float8`,
      cost: sql<number>`sum(${schema.salesOrderLines.quantity} * ${schema.products.unitCost})::float8`,
      orders: sql<number>`count(distinct ${schema.salesOrderLines.salesOrderId})::int`,
    })
    .from(schema.salesOrderLines)
    .innerJoin(schema.salesOrders, eq(schema.salesOrders.id, schema.salesOrderLines.salesOrderId))
    .innerJoin(schema.products, eq(schema.products.id, schema.salesOrderLines.productId))
    .where(notInArray(schema.salesOrders.status, [...DEAD_SO_STATUSES]))
    .groupBy(
      schema.salesOrderLines.productId,
      schema.products.sku,
      schema.products.shortName,
      schema.products.categoryId,
    );

  performanceCache = rows
    .map((r) => {
      const margin = r.revenue - r.cost;
      return {
        productId: r.productId,
        sku: r.sku,
        name: r.name,
        category: categoryById.get(r.categoryId)?.name ?? "—",
        unitsSold: r.units,
        revenue: round(r.revenue),
        cost: round(r.cost),
        margin: round(margin),
        marginPct: r.revenue > 0 ? margin / r.revenue : 0,
        orders: r.orders,
      };
    })
    .sort((a, b) => b.revenue - a.revenue || a.productId.localeCompare(b.productId));

  return performanceCache;
}

export async function categoryPerformance() {
  const acc = new Map<string, { revenue: number; margin: number; units: number; skus: Set<string> }>();
  for (const row of await productPerformance()) {
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

export async function topCustomers(limit = 10) {
  const pg = getDb();
  // Per-order unit totals, kept in a subquery so joining them to sales_orders
  // for the customer rollup does not fan out `sum(total)`.
  const perOrderUnits = pg
    .select({
      salesOrderId: schema.salesOrderLines.salesOrderId,
      units: sql<number>`sum(${schema.salesOrderLines.quantity})::int`.as("line_units"),
    })
    .from(schema.salesOrderLines)
    .groupBy(schema.salesOrderLines.salesOrderId)
    .as("per_order_units");

  const [customerById, rows] = await Promise.all([
    indexById(allCustomers),
    pg
      .select({
        customerId: schema.salesOrders.customerId,
        revenue: sql<number>`sum(${schema.salesOrders.total})::float8`,
        orders: sql<number>`count(*)::int`,
        units: sql<number>`coalesce(sum(${perOrderUnits.units}), 0)::int`,
      })
      .from(schema.salesOrders)
      .leftJoin(perOrderUnits, eq(perOrderUnits.salesOrderId, schema.salesOrders.id))
      .where(notInArray(schema.salesOrders.status, [...DEAD_SO_STATUSES]))
      .groupBy(schema.salesOrders.customerId),
  ]);

  return rows
    .map((v) => ({
      id: v.customerId,
      name: customerById.get(v.customerId)?.name ?? "—",
      code: customerById.get(v.customerId)?.code ?? "—",
      revenue: Math.round(v.revenue),
      orders: v.orders,
      units: v.units,
      averageOrder: Math.round(v.revenue / Math.max(1, v.orders)),
    }))
    .sort((a, b) => b.revenue - a.revenue || a.id.localeCompare(b.id))
    .slice(0, limit);
}

/* ------------------------------------------------------ purchasing rollups */

export async function supplierScorecards() {
  const [suppliers, purchaseOrders, returns] = await Promise.all([
    allSuppliers(),
    allPurchaseOrders(),
    allReturns(),
  ]);

  return suppliers
    .map((supplier) => {
      const orders = purchaseOrders.filter((p) => p.supplierId === supplier.id);
      const settled = orders.filter((p) => ["received", "closed"].includes(p.status));
      const onTime = settled.filter(
        (p) => p.receivedAt && new Date(p.receivedAt).getTime() <= new Date(p.expectedAt).getTime(),
      );
      const open = orders.filter((p) =>
        ["submitted", "approved", "ordered", "partially-received"].includes(p.status),
      );
      const overdue = open.filter((p) => new Date(p.expectedAt).getTime() < NOW.getTime());
      const supplierReturns = returns.filter(
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
        returns: supplierReturns.length,
        returnValue: Math.round(supplierReturns.reduce((s, r) => s + r.refundTotal, 0)),
      };
    })
    .sort((a, b) => b.spend - a.spend);
}

export async function spendByCategory() {
  const [categoryById, rows] = await Promise.all([
    indexById(allCategories),
    getDb()
      .select({
        categoryId: schema.products.categoryId,
        value: sql<number>`sum(${schema.purchaseOrderLines.lineTotal})::float8`,
      })
      .from(schema.purchaseOrderLines)
      .innerJoin(
        schema.purchaseOrders,
        eq(schema.purchaseOrders.id, schema.purchaseOrderLines.purchaseOrderId),
      )
      .innerJoin(schema.products, eq(schema.products.id, schema.purchaseOrderLines.productId))
      .where(notInArray(schema.purchaseOrders.status, [...DEAD_PO_STATUSES]))
      .groupBy(schema.products.categoryId),
  ]);

  return rows
    .map((r) => ({ name: categoryById.get(r.categoryId)?.name ?? "—", value: Math.round(r.value) }))
    .sort((a, b) => b.value - a.value);
}

/* ------------------------------------------------------- warehouse rollups */

export async function warehousePerformance() {
  const [rollups, purchaseOrders, salesOrders, stockCounts, transfers, adjustmentDocs] =
    await Promise.all([
      warehouseRollups(),
      allPurchaseOrders(),
      allSalesOrders(),
      allStockCounts(),
      allTransfers(),
      allAdjustments(),
    ]);

  return rollups.map((w) => {
    const receipts = purchaseOrders.filter(
      (p) => p.warehouseId === w.id && ["received", "closed"].includes(p.status),
    );
    const onTimeReceipts = receipts.filter(
      (p) => p.receivedAt && new Date(p.receivedAt).getTime() <= new Date(p.expectedAt).getTime(),
    );

    const orders = salesOrders.filter((o) => o.warehouseId === w.id);
    const shipped = orders.filter((o) => o.shippedAt);
    const onTimeShipped = shipped.filter(
      (o) => new Date(o.shippedAt!).getTime() <= new Date(o.promisedAt).getTime(),
    );

    const counts = stockCounts.filter(
      (c) => c.warehouseId === w.id && ["approved", "applied"].includes(c.status),
    );
    const accuracy =
      counts.length > 0 ? counts.reduce((s, c) => s + c.accuracyPct, 0) / counts.length / 100 : null;

    const transfersOut = transfers.filter((t) => t.fromWarehouseId === w.id);
    const transfersIn = transfers.filter((t) => t.toWarehouseId === w.id);

    const adjustments = adjustmentDocs.filter(
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

/* ---------------------------------------------------------------- summary */

export async function inventoryHeadline() {
  const summaries = await allSummaries();
  const value = await totalInventoryValue();
  const dead = await deadStockRows();
  const turnover = await turnoverRows();
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
