/**
 * Inventory reads.
 *
 * Everything derives from `db.stockRows` so the product page, the stock table
 * and the dashboard KPI can never disagree about how much of something exists.
 *
 * Every function that reads the dataset is asynchronous — phase 2 replaces the
 * bodies with real queries. The lookup maps and `summaryOf` below are private
 * synchronous helpers over the once-built in-memory index; they are an
 * implementation detail of the current bodies, not part of the surface.
 */

import { db } from "@/lib/data/store";
import { daysUntil } from "@/lib/format";
import type {
  Category,
  Customer,
  Product,
  StockHealth,
  StockLocation,
  StockRow,
  StockSummary,
  Supplier,
  User,
  Warehouse,
} from "@/lib/types";

/** Pure classification, no dataset input — stays synchronous. */
export function healthOf(available: number, reorderPoint: number): StockHealth {
  if (available <= 0) return "out-of-stock";
  if (available < reorderPoint * 0.4) return "critical";
  if (available < reorderPoint) return "low";
  if (reorderPoint > 0 && available > reorderPoint * 6) return "overstock";
  return "healthy";
}

export const HEALTH_ORDER: StockHealth[] = [
  "out-of-stock",
  "critical",
  "low",
  "healthy",
  "overstock",
];

function buildIndex() {
  const rowsByProduct = new Map<string, StockRow[]>();
  for (const row of db.stockRows) {
    const list = rowsByProduct.get(row.productId) ?? [];
    list.push(row);
    rowsByProduct.set(row.productId, list);
  }

  const summaries = new Map<string, StockSummary>();
  for (const product of db.products) {
    const rows = rowsByProduct.get(product.id) ?? [];
    let onHand = 0, reserved = 0, damaged = 0, incoming = 0, inTransit = 0;
    for (const row of rows) {
      onHand += row.onHand;
      reserved += row.reserved;
      damaged += row.damaged;
      incoming += row.incoming;
      inTransit += row.inTransit;
    }
    const available = Math.max(0, onHand - reserved - damaged);
    summaries.set(product.id, {
      productId: product.id,
      onHand,
      reserved,
      damaged,
      incoming,
      inTransit,
      available,
      value: Math.round(onHand * product.unitCost * 100) / 100,
      health: healthOf(available, product.reorderPoint),
      warehouseCount: rows.length,
    });
  }

  return { rowsByProduct, summaries };
}

const index = buildIndex();

const productByIdMap = new Map(db.products.map((p) => [p.id, p]));
const productBySkuMap = new Map(db.products.map((p) => [p.sku, p]));
const warehouseByIdMap = new Map(db.warehouses.map((w) => [w.id, w]));
const locationByIdMap = new Map(db.locations.map((l) => [l.id, l]));
const supplierByIdMap = new Map(db.suppliers.map((s) => [s.id, s]));
const customerByIdMap = new Map(db.customers.map((c) => [c.id, c]));
const userByIdMap = new Map(db.users.map((u) => [u.id, u]));
const categoryByIdMap = new Map(db.categories.map((c) => [c.id, c]));

const EMPTY_SUMMARY: Omit<StockSummary, "productId"> = {
  onHand: 0, reserved: 0, damaged: 0, incoming: 0, inTransit: 0,
  available: 0, value: 0, health: "out-of-stock", warehouseCount: 0,
};

/** Current body's synchronous read of the pre-built summary index. */
function summaryOf(productId: string): StockSummary {
  return index.summaries.get(productId) ?? { productId, ...EMPTY_SUMMARY };
}

export async function productById(id: string): Promise<Product | undefined> {
  return productByIdMap.get(id);
}

export async function productBySku(sku: string): Promise<Product | undefined> {
  return productBySkuMap.get(sku);
}

export async function warehouseById(id: string): Promise<Warehouse | undefined> {
  return warehouseByIdMap.get(id);
}

export async function locationById(id: string): Promise<StockLocation | undefined> {
  return locationByIdMap.get(id);
}

export async function supplierById(id: string): Promise<Supplier | undefined> {
  return supplierByIdMap.get(id);
}

export async function customerById(id: string): Promise<Customer | undefined> {
  return customerByIdMap.get(id);
}

export async function userById(id: string): Promise<User | undefined> {
  return userByIdMap.get(id);
}

export async function categoryById(id: string): Promise<Category | undefined> {
  return categoryByIdMap.get(id);
}

export async function summaryFor(productId: string): Promise<StockSummary> {
  return summaryOf(productId);
}

export async function stockRowsFor(productId: string): Promise<StockRow[]> {
  return index.rowsByProduct.get(productId) ?? [];
}

export async function allStockRows(): Promise<StockRow[]> {
  return db.stockRows;
}

export async function allSummaries(): Promise<StockSummary[]> {
  return [...index.summaries.values()];
}

/* -------------------------------------------------------------- joins ---- */

export interface ProductRow extends Product {
  categoryName: string;
  supplierName: string;
  stock: StockSummary;
}

let productRowsCache: ProductRow[] | null = null;

export async function productRows(): Promise<ProductRow[]> {
  if (productRowsCache) return productRowsCache;
  productRowsCache = db.products.map((p) => ({
    ...p,
    categoryName: categoryByIdMap.get(p.categoryId)?.name ?? "—",
    supplierName: supplierByIdMap.get(p.primarySupplierId)?.name ?? "—",
    stock: summaryOf(p.id),
  }));
  return productRowsCache;
}

export interface StockLevelRow {
  id: string;
  productId: string;
  sku: string;
  name: string;
  categoryName: string;
  /** Health of the SKU overall — reorder points are per product, not per bin. */
  productAvailable: number;
  productStatus: string;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  locationCode: string;
  onHand: number;
  reserved: number;
  damaged: number;
  available: number;
  incoming: number;
  inTransit: number;
  reorderPoint: number;
  unitCost: number;
  value: number;
  health: StockHealth;
  expiresAt: string | null;
  daysToExpiry: number | null;
  lotNumber: string | null;
  lastCountedAt: string | null;
}

let stockLevelCache: StockLevelRow[] | null = null;

export async function stockLevelRows(): Promise<StockLevelRow[]> {
  if (stockLevelCache) return stockLevelCache;
  stockLevelCache = db.stockRows.map((row, i) => {
    const product = productByIdMap.get(row.productId)!;
    const warehouse = warehouseByIdMap.get(row.warehouseId)!;
    const location = locationByIdMap.get(row.locationId);
    const available = Math.max(0, row.onHand - row.reserved - row.damaged);
    const summary = summaryOf(row.productId);
    return {
      id: `${row.productId}:${row.warehouseId}:${i}`,
      productId: row.productId,
      sku: product.sku,
      name: product.name,
      categoryName: categoryByIdMap.get(product.categoryId)?.name ?? "—",
      productAvailable: summary.available,
      productStatus: product.status,
      warehouseId: warehouse.id,
      warehouseCode: warehouse.code,
      warehouseName: warehouse.name,
      locationCode: location?.code ?? "—",
      onHand: row.onHand,
      reserved: row.reserved,
      damaged: row.damaged,
      available,
      incoming: row.incoming,
      inTransit: row.inTransit,
      reorderPoint: product.reorderPoint,
      unitCost: product.unitCost,
      value: Math.round(row.onHand * product.unitCost * 100) / 100,
      health: summary.health,
      expiresAt: row.expiresAt,
      daysToExpiry: daysUntil(row.expiresAt),
      lotNumber: row.lotNumber,
      lastCountedAt: row.lastCountedAt,
    };
  });
  return stockLevelCache;
}

/* ------------------------------------------------------------ rollups ---- */

export async function totalInventoryValue(): Promise<number> {
  return Math.round([...index.summaries.values()].reduce((s, x) => s + x.value, 0));
}

export async function healthCounts(): Promise<Record<StockHealth, number>> {
  const out: Record<StockHealth, number> = {
    healthy: 0, low: 0, critical: 0, "out-of-stock": 0, overstock: 0,
  };
  for (const s of index.summaries.values()) {
    const product = productByIdMap.get(s.productId);
    if (product?.status !== "active") continue;
    out[s.health]++;
  }
  return out;
}

export async function valueByCategory(): Promise<{ name: string; value: number; skus: number }[]> {
  const acc = new Map<string, { value: number; skus: number }>();
  for (const p of db.products) {
    const name = categoryByIdMap.get(p.categoryId)?.name ?? "—";
    const cur = acc.get(name) ?? { value: 0, skus: 0 };
    cur.value += summaryOf(p.id).value;
    cur.skus += 1;
    acc.set(name, cur);
  }
  return [...acc.entries()]
    .map(([name, v]) => ({ name, value: Math.round(v.value), skus: v.skus }))
    .sort((a, b) => b.value - a.value);
}

export interface WarehouseRollup extends Warehouse {
  managerName: string;
  skuCount: number;
  unitCount: number;
  inventoryValue: number;
  utilization: number;
  locationCount: number;
  openTransfers: number;
}

export async function warehouseRollups(): Promise<WarehouseRollup[]> {
  return db.warehouses.map((w) => {
    const rows = db.stockRows.filter((r) => r.warehouseId === w.id);
    const skus = new Set(rows.map((r) => r.productId));
    let value = 0;
    let units = 0;
    for (const row of rows) {
      const p = productByIdMap.get(row.productId)!;
      value += row.onHand * p.unitCost;
      units += row.onHand;
    }
    return {
      ...w,
      managerName: userByIdMap.get(w.managerId)?.name ?? "—",
      skuCount: skus.size,
      unitCount: units,
      inventoryValue: Math.round(value),
      utilization: w.usedPallets / w.capacityPallets,
      locationCount: db.locations.filter((l) => l.warehouseId === w.id).length,
      openTransfers: db.transfers.filter(
        (t) =>
          (t.fromWarehouseId === w.id || t.toWarehouseId === w.id) &&
          !["received", "cancelled"].includes(t.status),
      ).length,
    };
  });
}

export async function locationsFor(warehouseId: string): Promise<StockLocation[]> {
  return db.locations.filter((l) => l.warehouseId === warehouseId);
}

/* ------------------------------------------------------------- filters --- */

export const STOCK_VIEWS = {
  all: {
    label: "All stock",
    description: "Every stock record across all warehouses, at every site and bin.",
  },
  "low-stock": {
    label: "Low stock",
    description:
      "SKUs whose total available quantity has fallen below their reorder point, shown per location so you can see where the remaining stock is.",
  },
  critical: { label: "Critical", description: "Under 40% of the reorder point." },
  "out-of-stock": { label: "Out of stock", description: "Nothing available to allocate." },
  overstock: { label: "Overstock", description: "More than 6× the reorder point — capital sitting still." },
  expiring: { label: "Expiring", description: "Lots reaching their expiry date within 30 days." },
} as const;

export type StockViewKey = keyof typeof STOCK_VIEWS;

/** Pure filter over an already-fetched array — no dataset input, stays synchronous. */
export function applyStockView(rows: StockLevelRow[], view: StockViewKey): StockLevelRow[] {
  // The health views are operational queues: a discontinued SKU running low is
  // not something anyone acts on, so it stays out of them. "All stock" is the
  // complete record and filters nothing.
  const active = () => rows.filter((r) => r.productStatus === "active");

  switch (view) {
    case "low-stock":
      return active().filter((r) => r.health === "low" || r.health === "critical");
    case "critical":
      return active().filter((r) => r.health === "critical");
    case "out-of-stock":
      return active().filter((r) => r.health === "out-of-stock");
    case "overstock":
      return active().filter((r) => r.health === "overstock");
    case "expiring":
      return rows.filter((r) => r.daysToExpiry !== null && r.daysToExpiry <= 30);
    default:
      return rows;
  }
}

export async function movementsFor(productId: string) {
  return db.movements.filter((m) => m.productId === productId);
}
