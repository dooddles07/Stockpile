/**
 * Inventory reads.
 *
 * Phase 2, ticket 02: the bodies now query Postgres. The signatures are
 * unchanged from phase 1 — every function that reads the dataset is still
 * asynchronous and returns the same shape, so only this file moves and the
 * recorded Playwright assertions still hold.
 *
 * The three screen-shaped functions — `productRows`, `stockLevelRows`,
 * `warehouseRollups` — are each a single joined query. Integer quantities are
 * summed in SQL (exact); the money arithmetic stays in JS, unchanged, so no
 * rendered value shifts. The primitive lookups (`productById`, `summaryFor`, …)
 * share `load()`, one batched read of the five tables per request via React
 * `cache`.
 *
 * Users and Movements are not tables yet, so the few functions that need them
 * still read the generated dataset. Transfers moved to Postgres in ticket 05;
 * `warehouseRollups` reads its open-transfer count through `documents.transfers`.
 */

import { cache } from "react";

import { eq, getTableColumns, sql } from "drizzle-orm";

import { db } from "@/lib/data/store";
import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { daysUntil } from "@/lib/format";
import { transfers as allTransfers } from "./documents";
import { customers as allCustomers, indexById, suppliers as allSuppliers } from "./reference";
import type { StockViewKey } from "./stock-views";
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

const byId = <T extends { id: string }>(xs: readonly T[]) =>
  new Map(xs.map((x) => [x.id, x]));

function buildIndex(stockRows: StockRow[], products: Product[]) {
  const rowsByProduct = new Map<string, StockRow[]>();
  for (const row of stockRows) {
    const list = rowsByProduct.get(row.productId) ?? [];
    list.push(row);
    rowsByProduct.set(row.productId, list);
  }

  const summaries = new Map<string, StockSummary>();
  for (const product of products) {
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

type StockIndex = ReturnType<typeof buildIndex>;

/**
 * The five migrated tables plus the derived index and lookup maps, fetched
 * once per request. Ordered by id (stock_rows by its identity column) so
 * iteration matches the generator's original order, which several recorded
 * assertions depend on.
 */
const load = cache(async () => {
  const pg = getDb();
  const [products, stockRows, warehouses, locations, categories] = await Promise.all([
    pg.select().from(schema.products).orderBy(schema.products.id),
    pg.select().from(schema.stockRows).orderBy(schema.stockRows.seq),
    pg.select().from(schema.warehouses).orderBy(schema.warehouses.id),
    pg.select().from(schema.locations).orderBy(schema.locations.id),
    pg.select().from(schema.categories).orderBy(schema.categories.id),
  ]);

  return {
    products,
    stockRows,
    warehouses,
    locations,
    index: buildIndex(stockRows, products),
    productByIdMap: byId(products),
    productBySkuMap: new Map(products.map((p) => [p.sku, p])),
    warehouseByIdMap: byId(warehouses),
    locationByIdMap: byId(locations),
    categoryByIdMap: byId(categories),
  };
});

// Suppliers moved to Postgres in ticket 03, Customers in ticket 04; each
// indexed per request via `cache`. Users are not a table yet — still the dataset.
const supplierIndex = cache(() => indexById(allSuppliers));
const customerIndex = cache(() => indexById(allCustomers));
const userByIdMap = new Map(db.users.map((u) => [u.id, u]));

const EMPTY_SUMMARY: Omit<StockSummary, "productId"> = {
  onHand: 0, reserved: 0, damaged: 0, incoming: 0, inTransit: 0,
  available: 0, value: 0, health: "out-of-stock", warehouseCount: 0,
};

function summaryOf(index: StockIndex, productId: string): StockSummary {
  return index.summaries.get(productId) ?? { productId, ...EMPTY_SUMMARY };
}

export async function productById(id: string): Promise<Product | undefined> {
  return (await load()).productByIdMap.get(id);
}

export async function productBySku(sku: string): Promise<Product | undefined> {
  return (await load()).productBySkuMap.get(sku);
}

export async function warehouseById(id: string): Promise<Warehouse | undefined> {
  return (await load()).warehouseByIdMap.get(id);
}

export async function locationById(id: string): Promise<StockLocation | undefined> {
  return (await load()).locationByIdMap.get(id);
}

export async function supplierById(id: string): Promise<Supplier | undefined> {
  return (await supplierIndex()).get(id);
}

export async function customerById(id: string): Promise<Customer | undefined> {
  return (await customerIndex()).get(id);
}

export async function userById(id: string): Promise<User | undefined> {
  return userByIdMap.get(id);
}

export async function categoryById(id: string): Promise<Category | undefined> {
  return (await load()).categoryByIdMap.get(id);
}

export async function summaryFor(productId: string): Promise<StockSummary> {
  return summaryOf((await load()).index, productId);
}

export async function stockRowsFor(productId: string): Promise<StockRow[]> {
  return (await load()).index.rowsByProduct.get(productId) ?? [];
}

export async function allStockRows(): Promise<StockRow[]> {
  return (await load()).stockRows;
}

export async function allSummaries(): Promise<StockSummary[]> {
  return [...(await load()).index.summaries.values()];
}

/* -------------------------------------------------------------- joins ---- */

export interface ProductRow extends Product {
  categoryName: string;
  supplierName: string;
  stock: StockSummary;
}

/** One query: products joined to their category and their stock-row totals. */
export const productRows = cache(async (): Promise<ProductRow[]> => {
  const pg = getDb();
  const supplierById = await supplierIndex();
  const agg = pg
    .select({
      productId: schema.stockRows.productId,
      onHand: sql<number>`sum(${schema.stockRows.onHand})::int`.as("agg_on_hand"),
      reserved: sql<number>`sum(${schema.stockRows.reserved})::int`.as("agg_reserved"),
      damaged: sql<number>`sum(${schema.stockRows.damaged})::int`.as("agg_damaged"),
      incoming: sql<number>`sum(${schema.stockRows.incoming})::int`.as("agg_incoming"),
      inTransit: sql<number>`sum(${schema.stockRows.inTransit})::int`.as("agg_in_transit"),
      warehouseCount: sql<number>`count(*)::int`.as("agg_wc"),
    })
    .from(schema.stockRows)
    .groupBy(schema.stockRows.productId)
    .as("agg");

  const rows = await pg
    .select({
      ...getTableColumns(schema.products),
      categoryName: schema.categories.name,
      aggOnHand: agg.onHand,
      aggReserved: agg.reserved,
      aggDamaged: agg.damaged,
      aggIncoming: agg.incoming,
      aggInTransit: agg.inTransit,
      aggWc: agg.warehouseCount,
    })
    .from(schema.products)
    .innerJoin(schema.categories, eq(schema.categories.id, schema.products.categoryId))
    .leftJoin(agg, eq(agg.productId, schema.products.id))
    .orderBy(schema.products.id);

  return rows.map((r) => {
    const { categoryName, aggOnHand, aggReserved, aggDamaged, aggIncoming, aggInTransit, aggWc, ...product } = r;
    const onHand = aggOnHand ?? 0;
    const reserved = aggReserved ?? 0;
    const damaged = aggDamaged ?? 0;
    const available = Math.max(0, onHand - reserved - damaged);
    return {
      ...product,
      categoryName,
      supplierName: supplierById.get(product.primarySupplierId)?.name ?? "—",
      stock: {
        productId: product.id,
        onHand,
        reserved,
        damaged,
        incoming: aggIncoming ?? 0,
        inTransit: aggInTransit ?? 0,
        available,
        value: Math.round(onHand * product.unitCost * 100) / 100,
        health: healthOf(available, product.reorderPoint),
        warehouseCount: aggWc ?? 0,
      },
    };
  });
});

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

/** One query: every stock row joined to its product, warehouse and location. */
export const stockLevelRows = cache(async (): Promise<StockLevelRow[]> => {
  const pg = getDb();
  const rows = await pg
    .select({
      productId: schema.stockRows.productId,
      warehouseId: schema.stockRows.warehouseId,
      onHand: schema.stockRows.onHand,
      reserved: schema.stockRows.reserved,
      damaged: schema.stockRows.damaged,
      incoming: schema.stockRows.incoming,
      inTransit: schema.stockRows.inTransit,
      expiresAt: schema.stockRows.expiresAt,
      lotNumber: schema.stockRows.lotNumber,
      lastCountedAt: schema.stockRows.lastCountedAt,
      sku: schema.products.sku,
      name: schema.products.name,
      productStatus: schema.products.status,
      reorderPoint: schema.products.reorderPoint,
      unitCost: schema.products.unitCost,
      warehouseCode: schema.warehouses.code,
      warehouseName: schema.warehouses.name,
      locationCode: schema.locations.code,
      categoryName: schema.categories.name,
    })
    .from(schema.stockRows)
    .innerJoin(schema.products, eq(schema.products.id, schema.stockRows.productId))
    .innerJoin(schema.warehouses, eq(schema.warehouses.id, schema.stockRows.warehouseId))
    .innerJoin(schema.locations, eq(schema.locations.id, schema.stockRows.locationId))
    .innerJoin(schema.categories, eq(schema.categories.id, schema.products.categoryId))
    .orderBy(schema.stockRows.seq);

  // available + health are SKU-wide (reorder points are per product): sum the
  // product's rows first, exactly as the phase 1 index did.
  const totals = new Map<string, { onHand: number; reserved: number; damaged: number }>();
  for (const r of rows) {
    const t = totals.get(r.productId) ?? { onHand: 0, reserved: 0, damaged: 0 };
    t.onHand += r.onHand;
    t.reserved += r.reserved;
    t.damaged += r.damaged;
    totals.set(r.productId, t);
  }

  return rows.map((r, i) => {
    const t = totals.get(r.productId)!;
    const productAvailable = Math.max(0, t.onHand - t.reserved - t.damaged);
    const available = Math.max(0, r.onHand - r.reserved - r.damaged);
    return {
      id: `${r.productId}:${r.warehouseId}:${i}`,
      productId: r.productId,
      sku: r.sku,
      name: r.name,
      categoryName: r.categoryName,
      productAvailable,
      productStatus: r.productStatus,
      warehouseId: r.warehouseId,
      warehouseCode: r.warehouseCode,
      warehouseName: r.warehouseName,
      locationCode: r.locationCode,
      onHand: r.onHand,
      reserved: r.reserved,
      damaged: r.damaged,
      available,
      incoming: r.incoming,
      inTransit: r.inTransit,
      reorderPoint: r.reorderPoint,
      unitCost: r.unitCost,
      value: Math.round(r.onHand * r.unitCost * 100) / 100,
      health: healthOf(productAvailable, r.reorderPoint),
      expiresAt: r.expiresAt,
      daysToExpiry: daysUntil(r.expiresAt),
      lotNumber: r.lotNumber,
      lastCountedAt: r.lastCountedAt,
    };
  });
});

/* ------------------------------------------------------------ rollups ---- */

export async function totalInventoryValue(): Promise<number> {
  const s = await load();
  return Math.round([...s.index.summaries.values()].reduce((acc, x) => acc + x.value, 0));
}

export async function healthCounts(): Promise<Record<StockHealth, number>> {
  const s = await load();
  const out: Record<StockHealth, number> = {
    healthy: 0, low: 0, critical: 0, "out-of-stock": 0, overstock: 0,
  };
  for (const summary of s.index.summaries.values()) {
    const product = s.productByIdMap.get(summary.productId);
    if (product?.status !== "active") continue;
    out[summary.health]++;
  }
  return out;
}

export async function valueByCategory(): Promise<{ name: string; value: number; skus: number }[]> {
  const s = await load();
  const acc = new Map<string, { value: number; skus: number }>();
  for (const p of s.products) {
    const name = s.categoryByIdMap.get(p.categoryId)?.name ?? "—";
    const cur = acc.get(name) ?? { value: 0, skus: 0 };
    cur.value += summaryOf(s.index, p.id).value;
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

/** One query: each warehouse with its stock totals and location count. */
export const warehouseRollups = cache(async (): Promise<WarehouseRollup[]> => {
  const pg = getDb();
  const [transfers, rows] = await Promise.all([
    allTransfers(),
    pg
      .select({
        ...getTableColumns(schema.warehouses),
        unitCount: sql<number>`coalesce(sum(${schema.stockRows.onHand}), 0)::int`.as("unit_count"),
        skuCount: sql<number>`count(distinct ${schema.stockRows.productId})::int`.as("sku_count"),
        inventoryValue: sql<number>`coalesce(round(sum(${schema.stockRows.onHand} * ${schema.products.unitCost})), 0)::int`.as("inventory_value"),
        locationCount: sql<number>`(select count(*) from ${schema.locations} where ${schema.locations.warehouseId} = ${schema.warehouses.id})::int`.as("location_count"),
      })
      .from(schema.warehouses)
      .leftJoin(schema.stockRows, eq(schema.stockRows.warehouseId, schema.warehouses.id))
      .leftJoin(schema.products, eq(schema.products.id, schema.stockRows.productId))
      .groupBy(schema.warehouses.id)
      .orderBy(schema.warehouses.id),
  ]);

  return rows.map((r) => {
    const { unitCount, skuCount, inventoryValue, locationCount, ...warehouse } = r;
    return {
      ...warehouse,
      managerName: userByIdMap.get(warehouse.managerId)?.name ?? "—",
      skuCount,
      unitCount,
      inventoryValue,
      utilization: warehouse.usedPallets / warehouse.capacityPallets,
      locationCount,
      openTransfers: transfers.filter(
        (t) =>
          (t.fromWarehouseId === warehouse.id || t.toWarehouseId === warehouse.id) &&
          !["received", "cancelled"].includes(t.status),
      ).length,
    };
  });
});

export async function locationsFor(warehouseId: string): Promise<StockLocation[]> {
  return (await load()).locations.filter((l) => l.warehouseId === warehouseId);
}

/* ------------------------------------------------------------- filters --- */

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
