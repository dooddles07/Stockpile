/**
 * Drizzle schema.
 *
 * Ticket 01 added the append-only `events` stream. Ticket 02 adds the first
 * reference and projection tables — Categories, Warehouses, Locations,
 * Products and Stock Rows — with real foreign keys between them (ADR-0003's
 * single database makes that possible; ADR-0001 means no tenant column).
 *
 * Column shapes mirror the interfaces in `lib/types.ts` exactly, and dates are
 * stored as ISO strings rather than `timestamp` columns: the whole app reads
 * them back as strings (`new Date(iso)`, `iso.localeCompare(...)`), and the
 * seed loads them verbatim from the generated dataset, so a round trip through
 * Postgres changes no rendered value.
 */

import {
  bigint,
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import type {
  LocationType,
  ProductStatus,
  Warehouse as WarehouseModel,
  WarehouseType,
} from "@/lib/types";

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Global append order; replay is a single-table scan by this column. */
  seq: bigint("seq", { mode: "number" }).generatedAlwaysAsIdentity(),
  type: text("type").notNull(),
  payload: jsonb("payload").notNull(),
  /** The Actor on whose authority the change was made (ADR-0004). */
  actorId: text("actor_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const categories = pgTable("categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  parentId: text("parent_id").references((): AnyPgColumn => categories.id),
  description: text("description").notNull(),
});

export const warehouses = pgTable("warehouses", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  type: text("type").$type<WarehouseType>().notNull(),
  addressLine: text("address_line").notNull(),
  city: text("city").notNull(),
  region: text("region").notNull(),
  country: text("country").notNull(),
  /** A User id (ADR-0004); Users are not a table in this ticket, so no FK. */
  managerId: text("manager_id").notNull(),
  capacityPallets: integer("capacity_pallets").notNull(),
  usedPallets: integer("used_pallets").notNull(),
  status: text("status").$type<WarehouseModel["status"]>().notNull(),
  openedAt: text("opened_at").notNull(),
  timezone: text("timezone").notNull(),
});

export const locations = pgTable("locations", {
  id: text("id").primaryKey(),
  warehouseId: text("warehouse_id")
    .notNull()
    .references(() => warehouses.id),
  code: text("code").notNull(),
  zone: text("zone").notNull(),
  aisle: text("aisle").notNull(),
  rack: text("rack").notNull(),
  bin: text("bin").notNull(),
  type: text("type").$type<LocationType>().notNull(),
  capacityUnits: integer("capacity_units").notNull(),
  occupiedUnits: integer("occupied_units").notNull(),
  restricted: boolean("restricted").notNull(),
});

export const products = pgTable("products", {
  id: text("id").primaryKey(),
  sku: text("sku").notNull().unique(),
  name: text("name").notNull(),
  shortName: text("short_name").notNull(),
  categoryId: text("category_id")
    .notNull()
    .references(() => categories.id),
  brand: text("brand").notNull(),
  description: text("description").notNull(),
  barcode: text("barcode").notNull(),
  unit: text("unit").notNull(),
  unitCost: numeric("unit_cost", { mode: "number" }).notNull(),
  sellPrice: numeric("sell_price", { mode: "number" }).notNull(),
  status: text("status").$type<ProductStatus>().notNull(),
  /** A Supplier id; Suppliers are not a table in this ticket, so no FK. */
  primarySupplierId: text("primary_supplier_id").notNull(),
  supplierIds: jsonb("supplier_ids").$type<string[]>().notNull(),
  reorderPoint: integer("reorder_point").notNull(),
  reorderQty: integer("reorder_qty").notNull(),
  leadTimeDays: integer("lead_time_days").notNull(),
  weightKg: numeric("weight_kg", { mode: "number" }).notNull(),
  dimensionsCm: text("dimensions_cm").notNull(),
  batchTracked: boolean("batch_tracked").notNull(),
  serialTracked: boolean("serial_tracked").notNull(),
  hasExpiry: boolean("has_expiry").notNull(),
  shelfLifeDays: integer("shelf_life_days"),
  hsCode: text("hs_code").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/**
 * Stock Rows — a projection, one row per product/warehouse/location holding.
 * `seq` is an identity column that fixes iteration order: the seed inserts the
 * generated rows in array order, so `ORDER BY seq` reproduces exactly the order
 * the in-memory generator built them in, which several recorded assertions
 * depend on.
 */
export const stockRows = pgTable("stock_rows", {
  seq: integer("seq").generatedAlwaysAsIdentity().primaryKey(),
  productId: text("product_id")
    .notNull()
    .references(() => products.id),
  warehouseId: text("warehouse_id")
    .notNull()
    .references(() => warehouses.id),
  locationId: text("location_id")
    .notNull()
    .references(() => locations.id),
  onHand: integer("on_hand").notNull(),
  reserved: integer("reserved").notNull(),
  damaged: integer("damaged").notNull(),
  incoming: integer("incoming").notNull(),
  inTransit: integer("in_transit").notNull(),
  lastCountedAt: text("last_counted_at"),
  expiresAt: text("expires_at"),
  lotNumber: text("lot_number"),
});
