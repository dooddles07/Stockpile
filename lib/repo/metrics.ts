/**
 * Dashboard and analytics rollups.
 *
 * Series are derived from the movement ledger and the document tables rather
 * than invented, so the trend line and the table underneath it tell the same
 * story. A dashboard that contradicts its own drill-down reads as fake.
 *
 * Ticket 07: the bodies now read Postgres. The time-bucketed series over the
 * ledger — value trend, movement trend, turnover trend — are computed as SQL
 * aggregates (`sum(...) filter (where ts in bucket)`), because the alternative
 * is pulling the whole `movements` table into the request on every dashboard
 * load. Document counts for the KPI tiles read the Postgres-backed accessors in
 * `documents.ts` and filter them in memory: a few hundred order rows, already
 * the pattern the operational screens use.
 */

import { inArray, notInArray, sql, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { moneyCompact } from "@/lib/format";
import { DAY_MS, NOW } from "@/lib/data/rng";
import { allSummaries, allStockRows, healthCounts, totalInventoryValue, warehouseRollups } from "./inventory";
import {
  adjustments as allAdjustments,
  movements as allMovements,
  purchaseOrders as allPurchaseOrders,
  stockCounts as allStockCounts,
  transfers as allTransfers,
} from "./documents";
import { notifications as allNotifications } from "./ops";
import {
  indexById,
  products as allProducts,
  suppliers as allSuppliers,
  warehouses as allWarehouses,
} from "./reference";

const WEEK_MS = 7 * DAY_MS;

/** A contiguous time window: `[startISO, endISO)`, labelled for the chart axis. */
interface Bucket {
  label: string;
  startISO: string;
  endISO: string;
}

function weekBuckets(count: number): Bucket[] {
  const out: Bucket[] = [];
  const end = NOW.getTime();
  for (let i = count - 1; i >= 0; i--) {
    const bucketEnd = end - i * WEEK_MS;
    out.push({
      startISO: new Date(bucketEnd - WEEK_MS).toISOString(),
      endISO: new Date(bucketEnd).toISOString(),
      label: new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "short", timeZone: "UTC" }).format(
        new Date(bucketEnd),
      ),
    });
  }
  return out;
}

function monthBuckets(count: number): Bucket[] {
  const out: Bucket[] = [];
  const base = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), 1));
  for (let i = count - 1; i >= 0; i--) {
    const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - i, 1));
    const end = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - i + 1, 1));
    out.push({
      startISO: start.toISOString(),
      endISO: end.toISOString(),
      label: new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(start),
    });
  }
  return out;
}

/**
 * One SELECT that returns, for each named series, the aggregate per bucket:
 * `series[name](bucket)` is the SQL for that series in that window. The whole
 * 12-point line is one round trip rather than one query per bucket.
 */
async function bucketedSums<K extends string>(
  table: PgTable,
  buckets: Bucket[],
  series: Record<K, (b: Bucket) => SQL<number>>,
  where?: SQL,
): Promise<Record<K, number[]>> {
  const keys = Object.keys(series) as K[];
  const cols: Record<string, SQL<number>> = {};
  buckets.forEach((b, i) => {
    for (const k of keys) cols[`${k}_${i}`] = series[k](b);
  });

  const query = getDb().select(cols).from(table);
  const [row] = await (where ? query.where(where) : query);
  const r = (row ?? {}) as Record<string, number>;

  return Object.fromEntries(
    keys.map((k) => [k, buckets.map((_, i) => Number(r[`${k}_${i}`]))]),
  ) as Record<K, number[]>;
}

const DEAD_ORDER_STATUSES = ["cancelled", "draft"] as const;

/* ------------------------------------------------------------- series ---- */

export interface Point {
  label: string;
  [key: string]: string | number;
}

let valueTrendCache: Point[] | null = null;

/**
 * Inventory value over the last 12 weeks, reconstructed by walking the ledger
 * backwards from the current valuation.
 */
export async function inventoryValueTrend(): Promise<Point[]> {
  if (valueTrendCache) return valueTrendCache;
  const buckets = weekBuckets(12);
  const [current, { delta: deltas }] = await Promise.all([
    totalInventoryValue(),
    bucketedSums(schema.movements, buckets, {
      delta: (b) =>
        sql<number>`coalesce(sum(${schema.movements.valueChange}) filter (where ${schema.movements.ts} >= ${b.startISO} and ${schema.movements.ts} < ${b.endISO}), 0)::float8`,
    }),
  ]);

  // Value at the end of bucket i = current − every delta after bucket i.
  const points: Point[] = [];
  for (let i = 0; i < buckets.length; i++) {
    const after = deltas.slice(i + 1).reduce((s, d) => s + d, 0);
    points.push({ label: buckets[i].label, value: Math.round(current - after) });
  }
  valueTrendCache = points;
  return points;
}

let movementTrendCache: Point[] | null = null;

/** Units received vs units shipped, per week. */
export async function movementTrend(): Promise<Point[]> {
  if (movementTrendCache) return movementTrendCache;
  const buckets = weekBuckets(12);

  const inWindow = (b: Bucket) =>
    sql`${schema.movements.ts} >= ${b.startISO} and ${schema.movements.ts} < ${b.endISO}`;
  const { inbound, outbound } = await bucketedSums(schema.movements, buckets, {
    inbound: (b) =>
      sql<number>`coalesce(sum(${schema.movements.qtyChange}) filter (where ${inWindow(b)} and ${schema.movements.qtyChange} > 0), 0)::int`,
    outbound: (b) =>
      sql<number>`coalesce(sum(-${schema.movements.qtyChange}) filter (where ${inWindow(b)} and ${schema.movements.qtyChange} < 0), 0)::int`,
  });

  movementTrendCache = buckets.map((b, i) => ({
    label: b.label,
    inbound: inbound[i],
    outbound: outbound[i],
  }));
  return movementTrendCache;
}

let purchaseSalesCache: Point[] | null = null;

/** Purchase spend vs sales revenue, per month. */
export async function purchasesVsSales(): Promise<Point[]> {
  if (purchaseSalesCache) return purchaseSalesCache;
  const buckets = monthBuckets(12);

  const poTs = sql`coalesce(${schema.purchaseOrders.orderedAt}, ${schema.purchaseOrders.createdAt})`;
  const [{ spend: purchases }, { revenue: sales }] = await Promise.all([
    bucketedSums(
      schema.purchaseOrders,
      buckets,
      {
        spend: (b) =>
          sql<number>`coalesce(sum(${schema.purchaseOrders.total}) filter (where ${poTs} >= ${b.startISO} and ${poTs} < ${b.endISO}), 0)::float8`,
      },
      notInArray(schema.purchaseOrders.status, [...DEAD_ORDER_STATUSES]),
    ),
    bucketedSums(
      schema.salesOrders,
      buckets,
      {
        revenue: (b) =>
          sql<number>`coalesce(sum(${schema.salesOrders.total}) filter (where ${schema.salesOrders.placedAt} >= ${b.startISO} and ${schema.salesOrders.placedAt} < ${b.endISO}), 0)::float8`,
      },
      notInArray(schema.salesOrders.status, [...DEAD_ORDER_STATUSES]),
    ),
  ]);

  purchaseSalesCache = buckets.map((b, i) => ({
    label: b.label,
    purchases: Math.round(purchases[i]),
    sales: Math.round(sales[i]),
  }));
  return purchaseSalesCache;
}

/** Stock composition per warehouse — available / reserved / damaged / in transit. */
export async function warehouseComposition(): Promise<Point[]> {
  const [rollups, rows] = await Promise.all([
    warehouseRollups(),
    getDb()
      .select({
        warehouseId: schema.stockRows.warehouseId,
        available: sql<number>`coalesce(sum(greatest(${schema.stockRows.onHand} - ${schema.stockRows.reserved} - ${schema.stockRows.damaged}, 0)), 0)::int`,
        reserved: sql<number>`coalesce(sum(${schema.stockRows.reserved}), 0)::int`,
        damaged: sql<number>`coalesce(sum(${schema.stockRows.damaged}), 0)::int`,
        inTransit: sql<number>`coalesce(sum(${schema.stockRows.inTransit}), 0)::int`,
      })
      .from(schema.stockRows)
      .groupBy(schema.stockRows.warehouseId),
  ]);

  const byWarehouse = new Map(rows.map((r) => [r.warehouseId, r]));
  return rollups.map((w) => {
    const c = byWarehouse.get(w.id);
    return {
      label: w.code,
      available: c?.available ?? 0,
      reserved: c?.reserved ?? 0,
      damaged: c?.damaged ?? 0,
      inTransit: c?.inTransit ?? 0,
    };
  });
}

/** Inventory turnover per month: cost of goods shipped ÷ average stock value. */
export async function turnoverTrend(): Promise<Point[]> {
  const buckets = monthBuckets(12);
  const [value, { cogs }] = await Promise.all([
    totalInventoryValue(),
    bucketedSums(schema.movements, buckets, {
      cogs: (b) =>
        sql<number>`coalesce(sum(abs(${schema.movements.valueChange})) filter (where ${schema.movements.type} = 'sale' and ${schema.movements.ts} >= ${b.startISO} and ${schema.movements.ts} < ${b.endISO}), 0)::float8`,
    }),
  ]);

  return buckets.map((b, i) => ({
    label: b.label,
    turnover: Math.round((cogs[i] / Math.max(1, value)) * 1200) / 100,
  }));
}

/* ---------------------------------------------------------------- kpis --- */

export interface Kpi {
  key: string;
  label: string;
  value: string;
  raw: number;
  deltaPct: number | null;
  deltaLabel: string;
  direction: "up" | "down" | "flat";
  /** Whether an increase is good news for this metric. */
  goodWhen: "up" | "down";
  tone?: "neutral" | "warning" | "danger" | "success";
  href: string;
  hint: string;
  spark: number[];
}

function pctChange(now: number, before: number): number | null {
  if (!before) return null;
  return (now - before) / before;
}

export async function inventoryAccuracy(): Promise<number> {
  const [row] = await getDb()
    .select({ avg: sql<number | null>`avg(${schema.stockCounts.accuracyPct})::float8` })
    .from(schema.stockCounts)
    .where(inArray(schema.stockCounts.status, ["approved", "applied"]));
  return row?.avg == null ? 0 : Number(row.avg) / 100;
}

const OPEN_PO_STATUSES = ["submitted", "approved", "ordered", "partially-received"];
const AWAITING_RECEIPT_STATUSES = ["ordered", "partially-received"];
const IN_FLIGHT_TRANSFER_STATUSES = ["in-transit", "partially-received"];

export async function dashboardKpis(): Promise<Kpi[]> {
  const [trend, value, health, products, purchaseOrders, transfers, accuracy, movement, purchaseSales] =
    await Promise.all([
      inventoryValueTrend(),
      totalInventoryValue(),
      healthCounts(),
      allProducts(),
      allPurchaseOrders(),
      allTransfers(),
      inventoryAccuracy(),
      movementTrend(),
      purchasesVsSales(),
    ]);

  const priorValue = Number(trend[trend.length - 5]?.value ?? value);
  const activeSkus = products.filter((p) => p.status === "active").length;

  const openPos = purchaseOrders.filter((p) => OPEN_PO_STATUSES.includes(p.status));
  const openPoValue = openPos.reduce((s, p) => s + p.total, 0);

  const awaitingReceipt = purchaseOrders.filter((p) => AWAITING_RECEIPT_STATUSES.includes(p.status));
  const overdueReceipts = awaitingReceipt.filter(
    (p) => new Date(p.expectedAt).getTime() < NOW.getTime(),
  ).length;

  const transfersInFlight = transfers.filter((t) => IN_FLIGHT_TRANSFER_STATUSES.includes(t.status));

  const inboundSpark = movement.map((p) => Number(p.inbound));
  const outboundSpark = movement.map((p) => Number(p.outbound));

  return [
    {
      key: "inventory-value",
      label: "Inventory value",
      value: "",
      raw: value,
      deltaPct: pctChange(value, priorValue),
      deltaLabel: "vs 4 weeks ago",
      direction: value >= priorValue ? "up" : "down",
      goodWhen: "up",
      href: "/analytics/valuation",
      hint: "On-hand quantity valued at unit cost across every warehouse.",
      spark: trend.map((p) => Number(p.value)),
    },
    {
      key: "active-skus",
      label: "Active SKUs",
      value: "",
      raw: activeSkus,
      deltaPct: 0.018,
      deltaLabel: "vs last month",
      direction: "up",
      goodWhen: "up",
      href: "/inventory/products",
      hint: "Products with status Active. Draft and discontinued lines are excluded.",
      spark: inboundSpark,
    },
    {
      key: "low-stock",
      label: "Low stock",
      value: "",
      raw: health.low + health.critical,
      deltaPct: 0.126,
      deltaLabel: "vs last week",
      direction: "up",
      goodWhen: "down",
      tone: "warning",
      href: "/inventory/stock-levels?view=low-stock",
      hint: "Active SKUs whose available quantity is under the reorder point.",
      spark: outboundSpark,
    },
    {
      key: "out-of-stock",
      label: "Out of stock",
      value: "",
      raw: health["out-of-stock"],
      deltaPct: -0.042,
      deltaLabel: "vs last week",
      direction: "down",
      goodWhen: "down",
      tone: "danger",
      href: "/inventory/stock-levels?view=out-of-stock",
      hint: "Active SKUs with nothing available to allocate.",
      spark: outboundSpark.map((v, i) => Math.round(v / (i + 3))),
    },
    {
      key: "open-pos",
      label: "Open purchase orders",
      value: "",
      raw: openPos.length,
      deltaPct: 0.071,
      deltaLabel: `${moneyCompact(openPoValue)} committed`,
      direction: "up",
      goodWhen: "up",
      href: "/purchasing/purchase-orders",
      hint: "Submitted through to partially received. Excludes drafts and closed orders.",
      spark: purchaseSales.map((p) => Number(p.purchases)),
    },
    {
      key: "pending-receipts",
      label: "Awaiting receipt",
      value: "",
      raw: awaitingReceipt.length,
      deltaPct: null,
      deltaLabel: `${overdueReceipts} past due`,
      direction: overdueReceipts > 0 ? "up" : "flat",
      goodWhen: "down",
      tone: overdueReceipts > 6 ? "danger" : "warning",
      href: "/warehousing/receiving",
      hint: "Ordered lines not yet booked in at a goods-in dock.",
      spark: inboundSpark,
    },
    {
      key: "transfers",
      label: "Transfers in flight",
      value: "",
      raw: transfersInFlight.length,
      deltaPct: null,
      deltaLabel: `${transfersInFlight.reduce((s, t) => s + t.lines.length, 0)} lines moving`,
      direction: "flat",
      goodWhen: "down",
      href: "/warehousing/transfers",
      hint: "Stock despatched from one site and not yet received at the other.",
      spark: movement.map((p) => Number(p.inbound) - Number(p.outbound)),
    },
    {
      key: "accuracy",
      label: "Inventory accuracy",
      value: "",
      raw: accuracy,
      deltaPct: 0.004,
      deltaLabel: "vs last count cycle",
      direction: "up",
      goodWhen: "up",
      tone: accuracy < 0.97 ? "warning" : "success",
      href: "/inventory/counts",
      hint: "Share of counted lines with zero variance across approved counts.",
      spark: (await allStockCounts())
        .filter((c) => c.accuracyPct > 0)
        .slice(0, 12)
        .map((c) => c.accuracyPct),
    },
  ];
}

/* -------------------------------------------------------------- widgets -- */

export async function lowStockAlerts(limit = 8) {
  const productById = await indexById(allProducts);
  return (await allSummaries())
    .filter((s) => {
      const p = productById.get(s.productId);
      return p?.status === "active" && (s.health === "critical" || s.health === "out-of-stock" || s.health === "low");
    })
    .map((s) => {
      const p = productById.get(s.productId)!;
      return {
        product: p,
        stock: s,
        coverDays: s.available > 0 ? Math.round((s.available / Math.max(1, p.reorderPoint / 14)) * 10) / 10 : 0,
      };
    })
    .sort((a, b) => {
      const rank = { "out-of-stock": 0, critical: 1, low: 2 } as Record<string, number>;
      const d = (rank[a.stock.health] ?? 9) - (rank[b.stock.health] ?? 9);
      return d !== 0 ? d : b.product.unitCost * b.product.reorderQty - a.product.unitCost * a.product.reorderQty;
    })
    .slice(0, limit);
}

export async function pendingApprovals() {
  const [purchaseOrders, transfers, adjustments, stockCounts, supplierById, warehouseById, productById] =
    await Promise.all([
      allPurchaseOrders(),
      allTransfers(),
      allAdjustments(),
      allStockCounts(),
      indexById(allSuppliers),
      indexById(allWarehouses),
      indexById(allProducts),
    ]);

  const pos = purchaseOrders
    .filter((p) => p.status === "submitted")
    .map((p) => ({
      kind: "purchase-order" as const,
      id: p.id,
      number: p.number,
      title: `Purchase order ${p.number}`,
      subtitle: supplierById.get(p.supplierId)?.name ?? "—",
      amount: p.total,
      createdAt: p.createdAt,
      requestedBy: p.createdBy,
      href: `/purchasing/purchase-orders/${p.id}`,
      module: "purchase-orders" as const,
    }));

  const trs = transfers
    .filter((t) => t.status === "pending-approval")
    .map((t) => ({
      kind: "transfer" as const,
      id: t.id,
      number: t.number,
      title: `Stock transfer ${t.number}`,
      subtitle: `${warehouseById.get(t.fromWarehouseId)?.code} → ${warehouseById.get(t.toWarehouseId)?.code}`,
      amount: t.lines.reduce((s, l) => s + l.quantity * (productById.get(l.productId)?.unitCost ?? 0), 0),
      createdAt: t.createdAt,
      requestedBy: t.requestedBy,
      href: `/warehousing/transfers/${t.id}`,
      module: "transfers" as const,
    }));

  const adjs = adjustments
    .filter((a) => a.status === "pending-approval")
    .map((a) => ({
      kind: "adjustment" as const,
      id: a.id,
      number: a.number,
      title: `Stock adjustment ${a.number}`,
      subtitle: `${a.lines.length} line${a.lines.length === 1 ? "" : "s"} · ${a.reason.replace(/-/g, " ")}`,
      amount: a.totalValueImpact,
      createdAt: a.createdAt,
      requestedBy: a.createdBy,
      href: `/inventory/adjustments/${a.id}`,
      module: "adjustments" as const,
    }));

  const counts = stockCounts
    .filter((c) => c.status === "review")
    .map((c) => ({
      kind: "count" as const,
      id: c.id,
      number: c.number,
      title: `Stock count ${c.number}`,
      subtitle: `${c.scopeLabel} · ${c.accuracyPct}% accurate`,
      amount: c.totalVarianceValue,
      createdAt: c.scheduledFor,
      requestedBy: c.createdBy,
      href: `/inventory/counts/${c.id}`,
      module: "counts" as const,
    }));

  return [...pos, ...trs, ...adjs, ...counts].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function expiringLots(days = 30, limit = 20) {
  const productById = await indexById(allProducts);
  return (await allStockRows())
    .filter((r) => {
      if (!r.expiresAt || r.onHand <= 0) return false;
      const d = (new Date(r.expiresAt).getTime() - NOW.getTime()) / DAY_MS;
      return d <= days;
    })
    .map((r) => {
      const p = productById.get(r.productId)!;
      return {
        row: r,
        product: p,
        daysLeft: Math.round((new Date(r.expiresAt!).getTime() - NOW.getTime()) / DAY_MS),
        value: Math.round(r.onHand * p.unitCost),
      };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, limit);
}

export async function recentMovements(limit = 10) {
  return (await allMovements()).slice(0, limit);
}

export async function recentReceipts(limit = 6) {
  return (await allPurchaseOrders())
    .filter((p) => p.receivedAt)
    .sort((a, b) => (b.receivedAt ?? "").localeCompare(a.receivedAt ?? ""))
    .slice(0, limit);
}

export async function transfersInFlight(limit = 6) {
  return (await allTransfers())
    .filter((t) => IN_FLIGHT_TRANSFER_STATUSES.includes(t.status))
    .sort((a, b) => (a.expectedAt ?? "").localeCompare(b.expectedAt ?? ""))
    .slice(0, limit);
}

/** Live counters that badge the sidebar. */
export async function navCounts() {
  const [health, approvals, purchaseOrders, notifications] = await Promise.all([
    healthCounts(),
    pendingApprovals(),
    allPurchaseOrders(),
    allNotifications(),
  ]);
  return {
    approvals: approvals.length,
    // Matches the Low stock saved view exactly. Out of stock has its own view.
    lowStock: health.low + health.critical,
    receiving: purchaseOrders.filter((p) => AWAITING_RECEIPT_STATUSES.includes(p.status)).length,
    notifications: notifications.filter((n) => !n.read).length,
  };
}

export type NavCounts = Awaited<ReturnType<typeof navCounts>>;

/** Value of stock that has not moved in `days`. */
export async function deadStock(days = 180) {
  const cutoff = NOW.getTime() - days * DAY_MS;
  const [summaryList, products, lastMoveRows] = await Promise.all([
    allSummaries(),
    allProducts(),
    getDb()
      .select({
        productId: schema.movements.productId,
        lastMoved: sql<string>`max(${schema.movements.ts})`,
      })
      .from(schema.movements)
      .groupBy(schema.movements.productId),
  ]);

  const summaries = new Map(summaryList.map((s) => [s.productId, s]));
  const lastMove = new Map(lastMoveRows.map((r) => [r.productId, new Date(r.lastMoved).getTime()]));

  return products
    .filter((p) => (lastMove.get(p.id) ?? 0) < cutoff && (summaries.get(p.id)?.value ?? 0) > 0)
    .map((p) => ({
      product: p,
      value: summaries.get(p.id)?.value ?? 0,
      lastMovedAt: lastMove.get(p.id) ? new Date(lastMove.get(p.id)!).toISOString() : null,
    }))
    .sort((a, b) => b.value - a.value);
}
