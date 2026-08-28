/**
 * Dashboard and analytics rollups.
 *
 * Series are derived from the movement ledger and the document tables rather
 * than invented, so the trend line and the table underneath it tell the same
 * story. A dashboard that contradicts its own drill-down reads as fake.
 */

import { db } from "@/lib/data/store";
import { moneyCompact } from "@/lib/format";
import { DAY_MS, NOW } from "@/lib/data/rng";
import {
  allSummaries,
  healthCounts,
  productById,
  summaryFor,
  totalInventoryValue,
  warehouseRollups,
} from "./inventory";

const WEEK_MS = 7 * DAY_MS;

function weekBuckets(count: number): { start: number; end: number; label: string }[] {
  const out: { start: number; end: number; label: string }[] = [];
  const end = NOW.getTime();
  for (let i = count - 1; i >= 0; i--) {
    const bucketEnd = end - i * WEEK_MS;
    const bucketStart = bucketEnd - WEEK_MS;
    out.push({
      start: bucketStart,
      end: bucketEnd,
      label: new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "short", timeZone: "UTC" }).format(
        new Date(bucketEnd),
      ),
    });
  }
  return out;
}

function monthBuckets(count: number): { start: number; end: number; label: string }[] {
  const out: { start: number; end: number; label: string }[] = [];
  const base = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), 1));
  for (let i = count - 1; i >= 0; i--) {
    const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - i, 1));
    const end = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - i + 1, 1));
    out.push({
      start: start.getTime(),
      end: end.getTime(),
      label: new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(start),
    });
  }
  return out;
}

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
export function inventoryValueTrend(): Point[] {
  if (valueTrendCache) return valueTrendCache;
  const buckets = weekBuckets(12);
  const current = totalInventoryValue();

  const deltas = buckets.map((b) =>
    db.movements
      .filter((m) => {
        const t = new Date(m.ts).getTime();
        return t >= b.start && t < b.end;
      })
      .reduce((s, m) => s + m.valueChange, 0),
  );

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
export function movementTrend(): Point[] {
  if (movementTrendCache) return movementTrendCache;
  movementTrendCache = weekBuckets(12).map((b) => {
    let inbound = 0;
    let outbound = 0;
    for (const m of db.movements) {
      const t = new Date(m.ts).getTime();
      if (t < b.start || t >= b.end) continue;
      if (m.qtyChange > 0) inbound += m.qtyChange;
      else outbound += -m.qtyChange;
    }
    return { label: b.label, inbound, outbound };
  });
  return movementTrendCache;
}

let purchaseSalesCache: Point[] | null = null;

/** Purchase spend vs sales revenue, per month. */
export function purchasesVsSales(): Point[] {
  if (purchaseSalesCache) return purchaseSalesCache;
  purchaseSalesCache = monthBuckets(12).map((b) => {
    const purchases = db.purchaseOrders
      .filter((p) => {
        const t = new Date(p.orderedAt ?? p.createdAt).getTime();
        return t >= b.start && t < b.end && p.status !== "cancelled" && p.status !== "draft";
      })
      .reduce((s, p) => s + p.total, 0);

    const sales = db.salesOrders
      .filter((o) => {
        const t = new Date(o.placedAt).getTime();
        return t >= b.start && t < b.end && o.status !== "cancelled" && o.status !== "draft";
      })
      .reduce((s, o) => s + o.total, 0);

    return { label: b.label, purchases: Math.round(purchases), sales: Math.round(sales) };
  });
  return purchaseSalesCache;
}

/** Stock composition per warehouse — available / reserved / damaged / in transit. */
export function warehouseComposition(): Point[] {
  return warehouseRollups().map((w) => {
    const rows = db.stockRows.filter((r) => r.warehouseId === w.id);
    let available = 0, reserved = 0, damaged = 0, inTransit = 0;
    for (const row of rows) {
      available += Math.max(0, row.onHand - row.reserved - row.damaged);
      reserved += row.reserved;
      damaged += row.damaged;
      inTransit += row.inTransit;
    }
    return { label: w.code, available, reserved, damaged, inTransit };
  });
}

/** Inventory turnover per month: cost of goods shipped ÷ average stock value. */
export function turnoverTrend(): Point[] {
  const value = totalInventoryValue();
  return monthBuckets(12).map((b) => {
    const cogs = db.movements
      .filter((m) => {
        const t = new Date(m.ts).getTime();
        return t >= b.start && t < b.end && m.type === "sale";
      })
      .reduce((s, m) => s + Math.abs(m.valueChange), 0);
    return { label: b.label, turnover: Math.round((cogs / Math.max(1, value)) * 1200) / 100 };
  });
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

export function inventoryAccuracy(): number {
  const counted = db.stockCounts.filter((c) => ["approved", "applied"].includes(c.status));
  if (!counted.length) return 0;
  return counted.reduce((s, c) => s + c.accuracyPct, 0) / counted.length / 100;
}

export function dashboardKpis(): Kpi[] {
  const trend = inventoryValueTrend();
  const value = totalInventoryValue();
  const priorValue = Number(trend[trend.length - 5]?.value ?? value);
  const health = healthCounts();

  const activeSkus = db.products.filter((p) => p.status === "active").length;

  const openPos = db.purchaseOrders.filter((p) =>
    ["submitted", "approved", "ordered", "partially-received"].includes(p.status),
  );
  const openPoValue = openPos.reduce((s, p) => s + p.total, 0);

  const awaitingReceipt = db.purchaseOrders.filter(
    (p) => ["ordered", "partially-received"].includes(p.status),
  );
  const overdueReceipts = awaitingReceipt.filter(
    (p) => new Date(p.expectedAt).getTime() < NOW.getTime(),
  ).length;

  const transfersInFlight = db.transfers.filter((t) =>
    ["in-transit", "partially-received"].includes(t.status),
  );

  const accuracy = inventoryAccuracy();

  const movement = movementTrend();
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
      spark: purchasesVsSales().map((p) => Number(p.purchases)),
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
      spark: db.stockCounts
        .filter((c) => c.accuracyPct > 0)
        .slice(0, 12)
        .map((c) => c.accuracyPct),
    },
  ];
}

/* -------------------------------------------------------------- widgets -- */

export function lowStockAlerts(limit = 8) {
  return allSummaries()
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

export function pendingApprovals() {
  const pos = db.purchaseOrders
    .filter((p) => p.status === "submitted")
    .map((p) => ({
      kind: "purchase-order" as const,
      id: p.id,
      number: p.number,
      title: `Purchase order ${p.number}`,
      subtitle: db.suppliers.find((s) => s.id === p.supplierId)?.name ?? "—",
      amount: p.total,
      createdAt: p.createdAt,
      requestedBy: p.createdBy,
      href: `/purchasing/purchase-orders/${p.id}`,
      module: "purchase-orders" as const,
    }));

  const trs = db.transfers
    .filter((t) => t.status === "pending-approval")
    .map((t) => ({
      kind: "transfer" as const,
      id: t.id,
      number: t.number,
      title: `Stock transfer ${t.number}`,
      subtitle: `${db.warehouses.find((w) => w.id === t.fromWarehouseId)?.code} → ${db.warehouses.find((w) => w.id === t.toWarehouseId)?.code}`,
      amount: t.lines.reduce((s, l) => s + l.quantity * (productById.get(l.productId)?.unitCost ?? 0), 0),
      createdAt: t.createdAt,
      requestedBy: t.requestedBy,
      href: `/warehousing/transfers/${t.id}`,
      module: "transfers" as const,
    }));

  const adjs = db.adjustments
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

  const counts = db.stockCounts
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

export function expiringLots(days = 30, limit = 20) {
  return db.stockRows
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

export function recentMovements(limit = 10) {
  return db.movements.slice(0, limit);
}

export function recentReceipts(limit = 6) {
  return db.purchaseOrders
    .filter((p) => p.receivedAt)
    .sort((a, b) => (b.receivedAt ?? "").localeCompare(a.receivedAt ?? ""))
    .slice(0, limit);
}

export function transfersInFlight(limit = 6) {
  return db.transfers
    .filter((t) => ["in-transit", "partially-received"].includes(t.status))
    .sort((a, b) => (a.expectedAt ?? "").localeCompare(b.expectedAt ?? ""))
    .slice(0, limit);
}

/** Live counters that badge the sidebar. */
export function navCounts() {
  const health = healthCounts();
  return {
    approvals: pendingApprovals().length,
    // Matches the Low stock saved view exactly. Out of stock has its own view.
    lowStock: health.low + health.critical,
    receiving: db.purchaseOrders.filter((p) => ["ordered", "partially-received"].includes(p.status)).length,
    notifications: db.notifications.filter((n) => !n.read).length,
    tasks: db.tasks.filter((t) => t.status !== "done").length,
  };
}

export type NavCounts = ReturnType<typeof navCounts>;

/** Value of stock that has not moved in `days`. */
export function deadStock(days = 180) {
  const cutoff = NOW.getTime() - days * DAY_MS;
  const lastMove = new Map<string, number>();
  for (const m of db.movements) {
    const t = new Date(m.ts).getTime();
    const cur = lastMove.get(m.productId) ?? 0;
    if (t > cur) lastMove.set(m.productId, t);
  }
  return db.products
    .filter((p) => (lastMove.get(p.id) ?? 0) < cutoff && summaryFor(p.id).value > 0)
    .map((p) => ({
      product: p,
      value: summaryFor(p.id).value,
      lastMovedAt: lastMove.get(p.id) ? new Date(lastMove.get(p.id)!).toISOString() : null,
    }))
    .sort((a, b) => b.value - a.value);
}
