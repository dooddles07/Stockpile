import {
  agingBuckets,
  categoryPerformance,
  deadStockRows,
  productPerformance,
  spendByCategory,
  supplierScorecards,
  turnoverRows,
  valuationRows,
  warehousePerformance,
} from "./analytics";
import { healthCounts, stockLevelRows } from "./inventory";
import { db } from "@/lib/data/store";
import { NOW } from "@/lib/data/rng";
import { money, percent, qty } from "@/lib/format";
import { humanize } from "@/lib/status";
import type { ModuleKey } from "@/lib/types";

export type ReportGroup = "Inventory" | "Purchasing" | "Sales" | "Warehouse";

export interface ReportColumn {
  key: string;
  header: string;
  align?: "left" | "right";
  /** Pre-formatted for display; the raw value stays in the row for export. */
  format?: (value: unknown) => string;
}

export interface ReportDefinition {
  slug: string;
  name: string;
  group: ReportGroup;
  description: string;
  /** What decision this report is meant to support. */
  purpose: string;
  module: ModuleKey;
  columns: ReportColumn[];
  run: () => Record<string, unknown>[];
  /** Headline figures shown above the table. */
  summary?: (rows: Record<string, unknown>[]) => { label: string; value: string }[];
}

const asMoney = (v: unknown) => money(Number(v));
const asMoneyCents = (v: unknown) => money(Number(v), { cents: true });
const asQty = (v: unknown) => qty(Number(v));
const asPct = (v: unknown) => (v === null ? "—" : percent(Number(v), 1));
const asText = (v: unknown) => (v === null || v === undefined ? "—" : String(v));

export const REPORTS: ReportDefinition[] = [
  {
    slug: "inventory-valuation",
    name: "Inventory valuation",
    group: "Inventory",
    module: "valuation",
    description: "Every SKU holding stock, valued at cost and at retail.",
    purpose: "The figure that goes on the balance sheet, and the margin locked up in the shelf.",
    columns: [
      { key: "sku", header: "SKU" },
      { key: "name", header: "Product" },
      { key: "category", header: "Category" },
      { key: "onHand", header: "On hand", align: "right", format: asQty },
      { key: "unitCost", header: "Unit cost", align: "right", format: asMoneyCents },
      { key: "avcoValue", header: "Value (AVCO)", align: "right", format: asMoney },
      { key: "fifoValue", header: "Value (FIFO)", align: "right", format: asMoney },
      { key: "retailValue", header: "Retail value", align: "right", format: asMoney },
    ],
    run: () => valuationRows() as unknown as Record<string, unknown>[],
    summary: (rows) => [
      { label: "SKUs", value: qty(rows.length) },
      { label: "Units", value: qty(rows.reduce((s, r) => s + Number(r.onHand), 0)) },
      { label: "Value (AVCO)", value: money(rows.reduce((s, r) => s + Number(r.avcoValue), 0)) },
      { label: "Value (FIFO)", value: money(rows.reduce((s, r) => s + Number(r.fifoValue), 0)) },
    ],
  },
  {
    slug: "stock-levels",
    name: "Stock levels by location",
    group: "Inventory",
    module: "stock",
    description: "Every stock record, with the bin it sits in and its health.",
    purpose: "The working list for a stock take, or for answering where something is.",
    columns: [
      { key: "sku", header: "SKU" },
      { key: "name", header: "Product" },
      { key: "warehouseCode", header: "Site" },
      { key: "locationCode", header: "Bin" },
      { key: "onHand", header: "On hand", align: "right", format: asQty },
      { key: "reserved", header: "Reserved", align: "right", format: asQty },
      { key: "available", header: "Available", align: "right", format: asQty },
      { key: "health", header: "Health", format: (v) => humanize(String(v)) },
      { key: "value", header: "Value", align: "right", format: asMoney },
    ],
    run: () => stockLevelRows() as unknown as Record<string, unknown>[],
    summary: (rows) => [
      { label: "Records", value: qty(rows.length) },
      { label: "Units", value: qty(rows.reduce((s, r) => s + Number(r.onHand), 0)) },
      { label: "Value", value: money(rows.reduce((s, r) => s + Number(r.value), 0)) },
    ],
  },
  {
    slug: "low-stock",
    name: "Low stock and stockouts",
    group: "Inventory",
    module: "stock",
    description: "Active SKUs below their reorder point, worst first.",
    purpose: "The reorder list. Everything here is either costing sales or about to.",
    columns: [
      { key: "sku", header: "SKU" },
      { key: "name", header: "Product" },
      { key: "warehouseCode", header: "Site" },
      { key: "available", header: "Available", align: "right", format: asQty },
      { key: "reorderPoint", header: "Reorder at", align: "right", format: asQty },
      { key: "incoming", header: "Incoming", align: "right", format: asQty },
      { key: "health", header: "Health", format: (v) => humanize(String(v)) },
    ],
    run: () =>
      stockLevelRows()
        .filter(
          (r) =>
            r.productStatus === "active" &&
            ["low", "critical", "out-of-stock"].includes(r.health),
        )
        .sort((a, b) => a.available - b.available) as unknown as Record<string, unknown>[],
    summary: (rows) => {
      const health = healthCounts();
      return [
        { label: "Records", value: qty(rows.length) },
        { label: "Out of stock", value: qty(health["out-of-stock"]) },
        { label: "Critical", value: qty(health.critical) },
        { label: "Low", value: qty(health.low) },
      ];
    },
  },
  {
    slug: "inventory-turnover",
    name: "Inventory turnover",
    group: "Inventory",
    module: "analytics",
    description: "Turns and days of cover per SKU over the last twelve months.",
    purpose: "Separates stock that earns its shelf space from stock that occupies it.",
    columns: [
      { key: "sku", header: "SKU" },
      { key: "name", header: "Product" },
      { key: "category", header: "Category" },
      { key: "onHand", header: "On hand", align: "right", format: asQty },
      { key: "stockValue", header: "Stock value", align: "right", format: asMoney },
      { key: "unitsSold12m", header: "Sold (12m)", align: "right", format: asQty },
      { key: "cogs12m", header: "COGS (12m)", align: "right", format: asMoney },
      { key: "turns", header: "Turns", align: "right", format: (v) => Number(v).toFixed(2) },
      { key: "daysOfCover", header: "Days of cover", align: "right", format: asText },
    ],
    run: () =>
      turnoverRows().sort((a, b) => b.stockValue - a.stockValue) as unknown as Record<
        string,
        unknown
      >[],
  },
  {
    slug: "dead-stock",
    name: "Dead stock",
    group: "Inventory",
    module: "analytics",
    description: "Stock with value on the shelf and no movement in 180 days.",
    purpose: "Candidates for clearance, write-down or consolidation into one site.",
    columns: [
      { key: "sku", header: "SKU" },
      { key: "name", header: "Product" },
      { key: "category", header: "Category" },
      { key: "onHand", header: "On hand", align: "right", format: asQty },
      { key: "stockValue", header: "Value", align: "right", format: asMoney },
      { key: "daysSinceMovement", header: "Days since movement", align: "right", format: asText },
    ],
    run: () => deadStockRows() as unknown as Record<string, unknown>[],
    summary: (rows) => [
      { label: "SKUs", value: qty(rows.length) },
      { label: "Value", value: money(rows.reduce((s, r) => s + Number(r.stockValue), 0)) },
    ],
  },
  {
    slug: "stock-ageing",
    name: "Stock ageing",
    group: "Inventory",
    module: "analytics",
    description: "Value bucketed by how long since the SKU last moved.",
    purpose: "Shows how much of the stock value is genuinely working.",
    columns: [
      { key: "label", header: "Age" },
      { key: "skus", header: "SKUs", align: "right", format: asQty },
      { key: "units", header: "Units", align: "right", format: asQty },
      { key: "value", header: "Value", align: "right", format: asMoney },
    ],
    run: () => agingBuckets() as unknown as Record<string, unknown>[],
  },
  {
    slug: "supplier-performance",
    name: "Supplier performance",
    group: "Purchasing",
    module: "analytics",
    description: "On-time delivery, defects and spend per supplier.",
    purpose: "The scorecard for a supplier review or a contract renegotiation.",
    columns: [
      { key: "code", header: "Code" },
      { key: "name", header: "Supplier" },
      { key: "spend", header: "Spend", align: "right", format: asMoney },
      { key: "settledOrders", header: "Completed", align: "right", format: asQty },
      { key: "observedOnTime", header: "On time", align: "right", format: asPct },
      { key: "leadTimeDays", header: "Lead time", align: "right", format: (v) => `${v}d` },
      { key: "defectRate", header: "Defects", align: "right", format: (v) => percent(Number(v), 2) },
      { key: "overdueOrders", header: "Overdue", align: "right", format: asQty },
    ],
    run: () => supplierScorecards() as unknown as Record<string, unknown>[],
    summary: (rows) => [
      { label: "Suppliers", value: qty(rows.length) },
      { label: "Total spend", value: money(rows.reduce((s, r) => s + Number(r.spend), 0)) },
      {
        label: "Overdue orders",
        value: qty(rows.reduce((s, r) => s + Number(r.overdueOrders), 0)),
      },
    ],
  },
  {
    slug: "purchase-spend",
    name: "Purchase spend by category",
    group: "Purchasing",
    module: "analytics",
    description: "Where committed spend goes across the catalogue.",
    purpose: "Budget conversations start here.",
    columns: [
      { key: "name", header: "Category" },
      { key: "value", header: "Spend", align: "right", format: asMoney },
    ],
    run: () => spendByCategory() as unknown as Record<string, unknown>[],
  },
  {
    slug: "open-purchase-orders",
    name: "Open purchase orders",
    group: "Purchasing",
    module: "purchase-orders",
    description: "Everything placed and not yet fully received.",
    purpose: "The chase list, and the committed spend not yet on a shelf.",
    columns: [
      { key: "number", header: "Order" },
      { key: "supplier", header: "Supplier" },
      { key: "warehouse", header: "Into" },
      { key: "status", header: "Status", format: (v) => humanize(String(v)) },
      { key: "outstanding", header: "Outstanding units", align: "right", format: asQty },
      { key: "total", header: "Total", align: "right", format: asMoney },
      { key: "expected", header: "Expected" },
      { key: "daysLate", header: "Days late", align: "right", format: asText },
    ],
    run: () =>
      db.purchaseOrders
        .filter((p) =>
          ["submitted", "approved", "ordered", "partially-received"].includes(p.status),
        )
        .map((p) => {
          const late = Math.round(
            (NOW.getTime() - new Date(p.expectedAt).getTime()) / 86_400_000,
          );
          return {
            number: p.number,
            supplier: db.suppliers.find((s) => s.id === p.supplierId)?.name ?? "—",
            warehouse: db.warehouses.find((w) => w.id === p.warehouseId)?.code ?? "—",
            status: p.status,
            outstanding: p.lines.reduce((s, l) => s + (l.quantity - l.fulfilled), 0),
            total: p.total,
            expected: p.expectedAt.slice(0, 10),
            daysLate: late > 0 ? late : null,
          };
        })
        .sort((a, b) => (b.daysLate ?? -1) - (a.daysLate ?? -1)),
  },
  {
    slug: "product-performance",
    name: "Product performance",
    group: "Sales",
    module: "analytics",
    description: "Units, revenue and margin per SKU.",
    purpose: "Which products actually make money, as opposed to which sell a lot.",
    columns: [
      { key: "sku", header: "SKU" },
      { key: "name", header: "Product" },
      { key: "category", header: "Category" },
      { key: "unitsSold", header: "Units", align: "right", format: asQty },
      { key: "orders", header: "Orders", align: "right", format: asQty },
      { key: "revenue", header: "Revenue", align: "right", format: asMoney },
      { key: "margin", header: "Margin", align: "right", format: asMoney },
      { key: "marginPct", header: "Margin %", align: "right", format: (v) => percent(Number(v), 1) },
    ],
    run: () => productPerformance() as unknown as Record<string, unknown>[],
    summary: (rows) => [
      { label: "SKUs sold", value: qty(rows.length) },
      { label: "Revenue", value: money(rows.reduce((s, r) => s + Number(r.revenue), 0)) },
      { label: "Margin", value: money(rows.reduce((s, r) => s + Number(r.margin), 0)) },
    ],
  },
  {
    slug: "category-performance",
    name: "Category performance",
    group: "Sales",
    module: "analytics",
    description: "Revenue and margin rolled up by category.",
    purpose: "Range planning: which parts of the catalogue earn their place.",
    columns: [
      { key: "name", header: "Category" },
      { key: "skus", header: "SKUs", align: "right", format: asQty },
      { key: "units", header: "Units", align: "right", format: asQty },
      { key: "revenue", header: "Revenue", align: "right", format: asMoney },
      { key: "margin", header: "Margin", align: "right", format: asMoney },
      { key: "marginPct", header: "Margin %", align: "right", format: (v) => percent(Number(v), 1) },
    ],
    run: () => categoryPerformance() as unknown as Record<string, unknown>[],
  },
  {
    slug: "warehouse-performance",
    name: "Warehouse performance",
    group: "Warehouse",
    module: "analytics",
    description: "Capacity, accuracy, timeliness and shrinkage per site.",
    purpose: "The site review pack.",
    columns: [
      { key: "code", header: "Site" },
      { key: "city", header: "City" },
      { key: "utilization", header: "Capacity", align: "right", format: (v) => percent(Number(v), 0) },
      { key: "skuCount", header: "SKUs", align: "right", format: asQty },
      { key: "inventoryValue", header: "Value", align: "right", format: asMoney },
      { key: "countAccuracy", header: "Count accuracy", align: "right", format: asPct },
      { key: "shippingOnTime", header: "Shipped on time", align: "right", format: asPct },
      { key: "shrinkageValue", header: "Shrinkage", align: "right", format: asMoney },
    ],
    run: () => warehousePerformance() as unknown as Record<string, unknown>[],
  },
  {
    slug: "movement-ledger",
    name: "Movement ledger",
    group: "Warehouse",
    module: "movements",
    description: "Every recorded stock change, newest first.",
    purpose: "The audit trail. Every number in every other report reduces to these rows.",
    columns: [
      { key: "ts", header: "When" },
      { key: "type", header: "Movement", format: (v) => humanize(String(v)) },
      { key: "sku", header: "SKU" },
      { key: "warehouse", header: "Site" },
      { key: "qtyBefore", header: "Before", align: "right", format: asQty },
      { key: "qtyChange", header: "Change", align: "right", format: asQty },
      { key: "qtyAfter", header: "After", align: "right", format: asQty },
      { key: "refNumber", header: "Reference" },
      { key: "user", header: "User" },
    ],
    run: () =>
      db.movements.slice(0, 500).map((m) => ({
        ts: m.ts.slice(0, 16).replace("T", " "),
        type: m.type,
        sku: m.sku,
        warehouse: db.warehouses.find((w) => w.id === m.warehouseId)?.code ?? "—",
        qtyBefore: m.qtyBefore,
        qtyChange: m.qtyChange,
        qtyAfter: m.qtyAfter,
        refNumber: m.refNumber,
        user: db.users.find((u) => u.id === m.userId)?.name ?? "—",
      })),
    summary: () => [
      { label: "Ledger entries", value: qty(db.movements.length) },
      { label: "Shown", value: "500 most recent" },
    ],
  },
];

export function reportBySlug(slug: string): ReportDefinition | undefined {
  return REPORTS.find((r) => r.slug === slug);
}

export function reportGroups(): ReportGroup[] {
  return ["Inventory", "Purchasing", "Sales", "Warehouse"];
}

/** Used only for the "records" count on the report cards. */
export function reportSize(report: ReportDefinition): number {
  try {
    return report.run().length;
  } catch {
    return 0;
  }
}
