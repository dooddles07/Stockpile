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
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import type {
  ApprovalEvent,
  Attachment,
  Customer as CustomerModel,
  ItemCondition,
  LocationType,
  OrderLine,
  ProductStatus,
  SalesOrder as SalesOrderModel,
  Supplier as SupplierModel,
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

/* ------------------------------------------------ purchasing & suppliers ---
 *
 * Ticket 03. Suppliers are Reference Data — ordinary mutable rows, same
 * treatment as Warehouses above. Purchase Orders and Returns are Documents:
 * ADR-0002 makes them state machines, so `status` is a real Postgres enum the
 * database rejects an unknown value for, not a free-text column. `return_kind`
 * is an enum for the same reason a status is — a fixed, closed set the schema
 * should enforce — though it is a discriminator, not a state machine. Lines are
 * their own tables (`quantity` / `fulfilled` per line), keyed by an identity
 * `seq` because the dataset's line ids repeat across parents; the seed inserts
 * in array order so `ORDER BY seq` reproduces it.
 *
 * There is no `goods_receipts` table. A goods receipt in this phase is the
 * projection formed by a line's `fulfilled` quantity plus the order reaching
 * `partially-received` / `received` / `closed` — exactly what the phase-1
 * generator models, which carries no goods-receipt entity of its own. The
 * receipt as a recorded Event belongs to the write path (ticket 12).
 *
 * The incoming balance is projected from open Purchase Order state — never the
 * Movement ledger, which has no movement type that produces it (ADR-0002, spec
 * story 21). `documents.incomingByProduct` is the query: `sum(quantity -
 * fulfilled)` over the lines of Purchase Orders in `OPEN_PO_STATUSES`
 * (submitted / approved / ordered / partially-received — `draft` is
 * uncommitted, the rest are settled).
 */

export const poStatus = pgEnum("po_status", [
  "draft",
  "submitted",
  "approved",
  "ordered",
  "partially-received",
  "received",
  "closed",
  "cancelled",
]);

export const returnKind = pgEnum("return_kind", ["purchase", "sales"]);

export const returnStatus = pgEnum("return_status", [
  "requested",
  "approved",
  "in-transit",
  "received",
  "inspected",
  "credited",
  "rejected",
]);

export const suppliers = pgTable("suppliers", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  contactName: text("contact_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  addressLine: text("address_line").notNull(),
  city: text("city").notNull(),
  country: text("country").notNull(),
  paymentTerms: text("payment_terms").notNull(),
  currency: text("currency").notNull(),
  leadTimeDays: integer("lead_time_days").notNull(),
  onTimeRate: numeric("on_time_rate", { mode: "number" }).notNull(),
  fulfillmentRate: numeric("fulfillment_rate", { mode: "number" }).notNull(),
  defectRate: numeric("defect_rate", { mode: "number" }).notNull(),
  totalSpend: numeric("total_spend", { mode: "number" }).notNull(),
  openOrders: integer("open_orders").notNull(),
  status: text("status").$type<SupplierModel["status"]>().notNull(),
  since: text("since").notNull(),
  categories: jsonb("categories").$type<string[]>().notNull(),
});

export const purchaseOrders = pgTable("purchase_orders", {
  id: text("id").primaryKey(),
  number: text("number").notNull(),
  supplierId: text("supplier_id")
    .notNull()
    .references(() => suppliers.id),
  warehouseId: text("warehouse_id")
    .notNull()
    .references(() => warehouses.id),
  status: poStatus("status").notNull(),
  createdAt: text("created_at").notNull(),
  orderedAt: text("ordered_at"),
  expectedAt: text("expected_at").notNull(),
  receivedAt: text("received_at"),
  subtotal: numeric("subtotal", { mode: "number" }).notNull(),
  taxTotal: numeric("tax_total", { mode: "number" }).notNull(),
  discountTotal: numeric("discount_total", { mode: "number" }).notNull(),
  shipping: numeric("shipping", { mode: "number" }).notNull(),
  total: numeric("total", { mode: "number" }).notNull(),
  currency: text("currency").notNull(),
  createdBy: text("created_by").notNull(),
  approvedBy: text("approved_by"),
  approvals: jsonb("approvals").$type<ApprovalEvent[]>().notNull(),
  notes: text("notes").notNull(),
  attachments: jsonb("attachments").$type<Attachment[]>().notNull(),
  paymentTerms: text("payment_terms").notNull(),
});

export const purchaseOrderLines = pgTable("purchase_order_lines", {
  seq: integer("seq").generatedAlwaysAsIdentity().primaryKey(),
  purchaseOrderId: text("purchase_order_id")
    .notNull()
    .references(() => purchaseOrders.id),
  /** The dataset's own line id (`LN-001`); unique only within its order. */
  id: text("id").notNull(),
  productId: text("product_id")
    .notNull()
    .references(() => products.id),
  sku: text("sku").notNull(),
  name: text("name").notNull(),
  quantity: integer("quantity").notNull(),
  /** Received-so-far quantity: the goods-receipt projection for this line. */
  fulfilled: integer("fulfilled").notNull(),
  unitPrice: numeric("unit_price", { mode: "number" }).notNull(),
  discountPct: numeric("discount_pct", { mode: "number" }).notNull(),
  taxPct: numeric("tax_pct", { mode: "number" }).notNull(),
  lineTotal: numeric("line_total", { mode: "number" }).notNull(),
  note: text("note").$type<OrderLine["note"]>(),
});

export const returns = pgTable("returns", {
  id: text("id").primaryKey(),
  number: text("number").notNull(),
  kind: returnKind("kind").notNull(),
  /** A Supplier id for purchase returns, a Customer id for sales returns — no FK. */
  partnerId: text("partner_id").notNull(),
  sourceOrderId: text("source_order_id").notNull(),
  sourceOrderNumber: text("source_order_number").notNull(),
  warehouseId: text("warehouse_id")
    .notNull()
    .references(() => warehouses.id),
  status: returnStatus("status").notNull(),
  reason: text("reason").notNull(),
  createdAt: text("created_at").notNull(),
  resolvedAt: text("resolved_at"),
  refundTotal: numeric("refund_total", { mode: "number" }).notNull(),
  restockValue: numeric("restock_value", { mode: "number" }).notNull(),
  createdBy: text("created_by").notNull(),
  note: text("note").notNull(),
});

export const returnLines = pgTable("return_lines", {
  seq: integer("seq").generatedAlwaysAsIdentity().primaryKey(),
  returnId: text("return_id")
    .notNull()
    .references(() => returns.id),
  /** The dataset's own line id (`RL-001`); unique only within its return. */
  id: text("id").notNull(),
  productId: text("product_id")
    .notNull()
    .references(() => products.id),
  sku: text("sku").notNull(),
  name: text("name").notNull(),
  quantity: integer("quantity").notNull(),
  condition: text("condition").$type<ItemCondition>().notNull(),
  restock: boolean("restock").notNull(),
  unitPrice: numeric("unit_price", { mode: "number" }).notNull(),
  refundAmount: numeric("refund_amount", { mode: "number" }).notNull(),
});

/* ------------------------------------------------------ sales & customers ---
 *
 * Ticket 04, the mirror image of ticket 03's purchasing area. Customers are
 * Reference Data — ordinary mutable rows, same treatment as Suppliers — and
 * carry a `credit_limit` that is reference data, not a derived value. Sales
 * Orders are Documents: ADR-0002 makes them state machines, so `status` is a
 * real Postgres enum over the fulfilment progression the screens display
 * (draft -> confirmed -> reserved -> picking -> packing -> shipped ->
 * delivered, plus cancelled and backorder), not a free-text column.
 * `payment_status` and `fulfillment_status` are enums for the same reason —
 * fixed, closed sets the schema should enforce — though they track alongside
 * the state machine rather than being it. Lines are their own table
 * (`quantity` / `fulfilled` per line), keyed by an identity `seq` because the
 * dataset's line ids (`LN-001`) repeat across parents; the seed inserts in
 * array order so `ORDER BY seq` reproduces it.
 *
 * The reserved balance is projected from open Sales Order state — never the
 * Movement ledger (CONTEXT.md "Reserved", ADR-0002). `documents.reservedByProduct`
 * is the query: `sum(quantity - fulfilled)` over the lines of Sales Orders in
 * `OPEN_SO_STATUSES` — `confirmed` / `reserved` / `picking` / `packing`.
 * Excluded: `draft` (uncommitted), `shipped` / `delivered` (released as `sale`
 * Movements), `cancelled` (released), `backorder` (never held stock).
 */

export const soStatus = pgEnum("so_status", [
  "draft",
  "confirmed",
  "reserved",
  "picking",
  "packing",
  "shipped",
  "delivered",
  "cancelled",
  "backorder",
]);

export const paymentStatus = pgEnum("payment_status", ["unpaid", "partial", "paid", "refunded"]);

export const fulfillmentStatus = pgEnum("fulfillment_status", [
  "unfulfilled",
  "partial",
  "fulfilled",
  "returned",
]);

export const customers = pgTable("customers", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  type: text("type").$type<CustomerModel["type"]>().notNull(),
  contactName: text("contact_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  city: text("city").notNull(),
  country: text("country").notNull(),
  creditLimit: numeric("credit_limit", { mode: "number" }).notNull(),
  outstanding: numeric("outstanding", { mode: "number" }).notNull(),
  totalOrders: integer("total_orders").notNull(),
  totalSpend: numeric("total_spend", { mode: "number" }).notNull(),
  status: text("status").$type<CustomerModel["status"]>().notNull(),
  since: text("since").notNull(),
});

export const salesOrders = pgTable("sales_orders", {
  id: text("id").primaryKey(),
  number: text("number").notNull(),
  customerId: text("customer_id")
    .notNull()
    .references(() => customers.id),
  warehouseId: text("warehouse_id")
    .notNull()
    .references(() => warehouses.id),
  status: soStatus("status").notNull(),
  paymentStatus: paymentStatus("payment_status").notNull(),
  fulfillmentStatus: fulfillmentStatus("fulfillment_status").notNull(),
  channel: text("channel").$type<SalesOrderModel["channel"]>().notNull(),
  placedAt: text("placed_at").notNull(),
  promisedAt: text("promised_at").notNull(),
  shippedAt: text("shipped_at"),
  subtotal: numeric("subtotal", { mode: "number" }).notNull(),
  taxTotal: numeric("tax_total", { mode: "number" }).notNull(),
  discountTotal: numeric("discount_total", { mode: "number" }).notNull(),
  shipping: numeric("shipping", { mode: "number" }).notNull(),
  total: numeric("total", { mode: "number" }).notNull(),
  currency: text("currency").notNull(),
  createdBy: text("created_by").notNull(),
  carrier: text("carrier"),
  trackingNumber: text("tracking_number"),
  shipToCity: text("ship_to_city").notNull(),
  notes: text("notes").notNull(),
});

export const salesOrderLines = pgTable("sales_order_lines", {
  seq: integer("seq").generatedAlwaysAsIdentity().primaryKey(),
  salesOrderId: text("sales_order_id")
    .notNull()
    .references(() => salesOrders.id),
  /** The dataset's own line id (`LN-001`); unique only within its order. */
  id: text("id").notNull(),
  productId: text("product_id")
    .notNull()
    .references(() => products.id),
  sku: text("sku").notNull(),
  name: text("name").notNull(),
  quantity: integer("quantity").notNull(),
  /** Picked/shipped-so-far quantity; `quantity - fulfilled` is still reserved. */
  fulfilled: integer("fulfilled").notNull(),
  unitPrice: numeric("unit_price", { mode: "number" }).notNull(),
  discountPct: numeric("discount_pct", { mode: "number" }).notNull(),
  taxPct: numeric("tax_pct", { mode: "number" }).notNull(),
  lineTotal: numeric("line_total", { mode: "number" }).notNull(),
  note: text("note").$type<OrderLine["note"]>(),
});
