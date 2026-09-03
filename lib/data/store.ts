/**
 * The Stockpile dataset.
 *
 * Generated once per process from a fixed seed. Everything downstream reads
 * from `db` — pages never generate their own numbers, so a product's stock
 * rows, its movement ledger and its dashboard KPI all agree with each other.
 */

import {
  BRANDS,
  CARRIERS,
  CATEGORY_SEEDS,
  CUSTOMER_SEEDS,
  DEVICES,
  PAYMENT_TERMS,
  PEOPLE,
  PRODUCT_SEEDS,
  SUPPLIER_SEEDS,
  WAREHOUSE_SEEDS,
  type CategorySlug,
} from "./catalog";
import { NOW, Rng, daysFromNow, id } from "./rng";
import { ALL_MODULE_KEYS } from "@/lib/auth/permissions";
import type {
  Adjustment,
  AdjustmentLine,
  AdjustmentReason,
  AdjustmentStatus,
  AppNotification,
  ApprovalEvent,
  Attachment,
  AuditEntry,
  AutomationRule,
  AutomationRun,
  Category,
  CountLine,
  CountStatus,
  CountType,
  Customer,
  ItemCondition,
  Movement,
  MovementType,
  OrderLine,
  POStatus,
  Product,
  PurchaseOrder,
  ReturnDoc,
  ReturnLine,
  ReturnStatus,
  Role,
  RoleRow,
  SOStatus,
  SalesOrder,
  StockCount,
  StockLocation,
  StockRow,
  Supplier,
  Transfer,
  TransferLine,
  TransferStatus,
  User,
  Warehouse,
} from "@/lib/types";

const r = new Rng(0x5706c17e);

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const money = (n: number) => Math.round(n * 100) / 100;

/**
 * Timestamp for something that has already happened.
 *
 * Clamped to the past: a receipt dated next week, or a "recently received"
 * order showing "in 1 month", is the fastest way to make a dataset read fake.
 */
const ago = (daysAgo: number) => daysFromNow(-Math.max(0.05, daysAgo));

/* ------------------------------------------------------------------ users */

const ROLE_PLAN: { role: Role; count: number; department: string }[] = [
  { role: "super-admin", count: 2, department: "IT Operations" },
  { role: "inventory-manager", count: 5, department: "Inventory Control" },
  { role: "warehouse-staff", count: 16, department: "Warehouse Operations" },
  { role: "purchasing-manager", count: 5, department: "Procurement" },
  { role: "sales-manager", count: 5, department: "Sales" },
  { role: "finance", count: 3, department: "Finance" },
  { role: "auditor", count: 2, department: "Compliance" },
];

const users: User[] = [];
{
  let n = 0;
  for (const plan of ROLE_PLAN) {
    for (let i = 0; i < plan.count; i++) {
      const name = PEOPLE[n % PEOPLE.length];
      const email = `${slugify(name).replace(/-/g, ".")}@stockpile.co`;
      const lastLoginDays = r.float(0, 21);
      users.push({
        id: id("USR", n + 1, 3),
        name,
        email,
        role: plan.role,
        department: plan.department,
        status: r.weighted([
          ["active", 88],
          ["invited", 7],
          ["suspended", 5],
        ]),
        lastLoginAt: r.bool(0.92) ? daysFromNow(-lastLoginDays) : null,
        createdAt: daysFromNow(-r.int(60, 1500)),
        warehouseId: null,
        phone: `+1 ${r.int(200, 989)} ${r.int(200, 999)} ${String(r.int(0, 9999)).padStart(4, "0")}`,
        twoFactor: r.bool(0.64),
      });
      n++;
    }
  }
}

const byRole = (role: Role) => users.filter((u) => u.role === role);
const pickUser = (role: Role) => r.pick(byRole(role)).id;

/* ----------------------------------------------------------------- roles */

/**
 * The role rows, formerly the hardcoded `ROLES` array plus `MATRIX` in
 * `lib/auth/permissions.ts` (ADR-0004). `sortOrder` fixes the column and
 * switcher order those arrays used to imply by position. Static, not
 * RNG-driven — a role's permissions are a fixture, not sample data.
 */
const roles: RoleRow[] = [
  {
    id: "super-admin",
    label: "Super Admin",
    summary: "Unrestricted access to every module and setting.",
    responsibilities: ["System configuration", "Users and roles", "Integrations", "All operational modules"],
    sortOrder: 0,
    permissions: Object.fromEntries(ALL_MODULE_KEYS.map((m) => [m, "manage"])) as RoleRow["permissions"],
  },
  {
    id: "inventory-manager",
    label: "Inventory Manager",
    summary: "Owns stock accuracy across every site.",
    responsibilities: ["Stock levels", "Warehouses and transfers", "Adjustments and counts", "Inventory reporting"],
    sortOrder: 1,
    permissions: {
      dashboard: "read-export", approvals: "approve",
      products: "write", categories: "write", stock: "write",
      movements: "read-export", adjustments: "approve", counts: "approve",
      warehouses: "write", locations: "write", transfers: "approve",
      receiving: "write", fulfillment: "read",
      "purchase-orders": "read-export", suppliers: "read", "purchase-returns": "read",
      "sales-orders": "read", customers: "read", "sales-returns": "read",
      analytics: "read-export", valuation: "read-export", reports: "read-export",
      users: "none", roles: "none", audit: "read",
      automation: "read", integrations: "none", settings: "read",
    },
  },
  {
    id: "warehouse-staff",
    label: "Warehouse Staff",
    summary: "Executes the physical work on the floor.",
    responsibilities: ["Receiving", "Picking and packing", "Transfer execution", "Counting"],
    sortOrder: 2,
    permissions: {
      dashboard: "read", approvals: "none",
      products: "read", categories: "read", stock: "read",
      movements: "read", adjustments: "write", counts: "write",
      warehouses: "read", locations: "read", transfers: "write",
      receiving: "write", fulfillment: "write",
      "purchase-orders": "read", suppliers: "none", "purchase-returns": "none",
      "sales-orders": "read", customers: "none", "sales-returns": "none",
      analytics: "none", valuation: "none", reports: "none",
      users: "none", roles: "none", audit: "none",
      automation: "none", integrations: "none", settings: "none",
    },
  },
  {
    id: "purchasing-manager",
    label: "Purchasing Manager",
    summary: "Owns supply, cost and supplier relationships.",
    responsibilities: ["Purchase orders", "Suppliers", "Goods receiving", "Purchase returns"],
    sortOrder: 3,
    permissions: {
      dashboard: "read-export", approvals: "approve",
      products: "read-export", categories: "read", stock: "read-export",
      movements: "read", adjustments: "read", counts: "none",
      warehouses: "read", locations: "read", transfers: "read",
      receiving: "write", fulfillment: "none",
      "purchase-orders": "approve", suppliers: "approve", "purchase-returns": "approve",
      "sales-orders": "none", customers: "none", "sales-returns": "none",
      analytics: "read-export", valuation: "read-export", reports: "read-export",
      users: "none", roles: "none", audit: "none",
      automation: "read", integrations: "none", settings: "read",
    },
  },
  {
    id: "sales-manager",
    label: "Sales Manager",
    summary: "Owns demand, orders and customer outcomes.",
    responsibilities: ["Sales orders", "Customers", "Fulfillment", "Sales returns"],
    sortOrder: 4,
    permissions: {
      dashboard: "read-export", approvals: "read",
      products: "read-export", categories: "read", stock: "read",
      movements: "none", adjustments: "none", counts: "none",
      warehouses: "read", locations: "none", transfers: "none",
      receiving: "none", fulfillment: "write",
      "purchase-orders": "none", suppliers: "none", "purchase-returns": "none",
      "sales-orders": "approve", customers: "write", "sales-returns": "approve",
      analytics: "read-export", valuation: "none", reports: "read-export",
      users: "none", roles: "none", audit: "none",
      automation: "read", integrations: "none", settings: "read",
    },
  },
  {
    id: "finance",
    label: "Finance",
    summary: "Values the inventory and reconciles the cost of it.",
    responsibilities: ["Inventory valuation", "Purchase costs", "Financial reporting", "Export"],
    sortOrder: 5,
    permissions: {
      dashboard: "read-export", approvals: "read",
      products: "read-export", categories: "read", stock: "read-export",
      movements: "read-export", adjustments: "read-export", counts: "read-export",
      warehouses: "read-export", locations: "read", transfers: "read-export",
      receiving: "read", fulfillment: "read",
      "purchase-orders": "read-export", suppliers: "read-export", "purchase-returns": "read-export",
      "sales-orders": "read-export", customers: "read-export", "sales-returns": "read-export",
      analytics: "read-export", valuation: "read-export", reports: "write",
      users: "none", roles: "none", audit: "read-export",
      automation: "none", integrations: "none", settings: "read",
    },
  },
  {
    id: "auditor",
    label: "Auditor",
    summary: "Read-only across the transaction record. Cannot change anything.",
    responsibilities: ["Inventory movements", "Adjustments", "Audit logs", "Transaction history"],
    sortOrder: 6,
    permissions: {
      dashboard: "read", approvals: "read",
      products: "read-export", categories: "read", stock: "read-export",
      movements: "read-export", adjustments: "read-export", counts: "read-export",
      warehouses: "read", locations: "read", transfers: "read-export",
      receiving: "read", fulfillment: "read",
      "purchase-orders": "read-export", suppliers: "read", "purchase-returns": "read-export",
      "sales-orders": "read-export", customers: "read", "sales-returns": "read-export",
      analytics: "read", valuation: "read-export", reports: "read-export",
      users: "read", roles: "read", audit: "read-export",
      automation: "read", integrations: "read", settings: "read",
    },
  },
];

/* ------------------------------------------------------------- categories */

const categories: Category[] = CATEGORY_SEEDS.map((c, i) => ({
  id: id("CAT", i + 1, 3),
  name: c.name,
  slug: c.slug,
  parentId: null,
  description: c.description,
}));

const categoryBySlug = new Map(categories.map((c) => [c.slug, c]));

/* ------------------------------------------------------------- warehouses */

const warehouseManagers = r.shuffle(byRole("inventory-manager"));

const warehouses: Warehouse[] = WAREHOUSE_SEEDS.map((w, i) => ({
  id: id("WH", i + 1, 2),
  code: w.code,
  name: w.name,
  type: w.type,
  addressLine: w.addressLine,
  city: w.city,
  region: w.region,
  country: w.country,
  managerId: warehouseManagers[i % warehouseManagers.length].id,
  capacityPallets: w.capacityPallets,
  usedPallets: Math.round(w.capacityPallets * r.float(0.42, 0.93)),
  status: i === 4 ? "maintenance" : "operational",
  openedAt: new Date(w.openedAt).toISOString(),
  timezone: w.timezone,
}));

// Warehouse staff are assigned to a site; managers roam.
users.forEach((u, i) => {
  if (u.role === "warehouse-staff") {
    u.warehouseId = warehouses[i % warehouses.length].id;
  }
});

/* -------------------------------------------------------------- locations */

const ZONES = ["A", "B", "C", "D"];
const locations: StockLocation[] = [];
{
  let n = 0;
  for (const wh of warehouses) {
    const zoneCount = wh.type === "retail" ? 2 : wh.type === "cold" ? 3 : 4;
    for (let z = 0; z < zoneCount; z++) {
      const zone = ZONES[z];
      const aisleCount = wh.type === "retail" ? 2 : 3;
      for (let a = 1; a <= aisleCount; a++) {
        const aisle = String(a).padStart(2, "0");
        for (let rack = 1; rack <= 3; rack++) {
          const bin = String(r.int(1, 4)).padStart(2, "0");
          n++;
          const capacity = r.int(240, 1400);
          locations.push({
            id: id("LOC", n, 4),
            warehouseId: wh.id,
            code: `${zone}-${aisle}-${String(rack).padStart(2, "0")}-${bin}`,
            zone,
            aisle,
            rack: String(rack).padStart(2, "0"),
            bin,
            type: r.weighted([
              ["bin", 52],
              ["shelf", 26],
              ["floor", 12],
              ["staging", 7],
              ["quarantine", 3],
            ]),
            capacityUnits: capacity,
            occupiedUnits: Math.round(capacity * r.float(0.15, 0.98)),
            restricted: r.bool(0.08),
          });
        }
      }
    }
  }
}

const locationsByWarehouse = new Map<string, StockLocation[]>();
for (const loc of locations) {
  const list = locationsByWarehouse.get(loc.warehouseId) ?? [];
  list.push(loc);
  locationsByWarehouse.set(loc.warehouseId, list);
}

/* -------------------------------------------------------------- suppliers */

const suppliers: Supplier[] = SUPPLIER_SEEDS.map((s, i) => {
  const contact = PEOPLE[(i * 5 + 3) % PEOPLE.length];
  const onTime = r.round(0.72, 0.995, 4);
  return {
    id: id("SUP", i + 1, 3),
    code: `S-${String(1000 + i * 7).padStart(4, "0")}`,
    name: s.name,
    contactName: contact,
    email: `${slugify(contact).split("-")[0]}@${slugify(s.name).split("-").slice(0, 2).join("")}.com`,
    phone: `+1 ${r.int(200, 989)} ${r.int(200, 999)} ${String(r.int(0, 9999)).padStart(4, "0")}`,
    addressLine: `${r.int(12, 9800)} ${r.pick(["Industrial Way", "Commerce Drive", "Harbour Road", "Enterprise Park", "Foundry Lane", "Trade Street"])}`,
    city: s.city,
    country: s.country,
    paymentTerms: r.pick(PAYMENT_TERMS),
    currency: "USD",
    leadTimeDays: r.int(3, 42),
    onTimeRate: onTime,
    fulfillmentRate: r.round(Math.min(0.999, onTime + 0.04), 0.999, 4),
    defectRate: r.round(0.001, 0.062, 4),
    totalSpend: 0,
    openOrders: 0,
    status: r.weighted([
      ["active", 86],
      ["on-hold", 9],
      ["inactive", 5],
    ]),
    since: daysFromNow(-r.int(180, 2900)),
    categories: [...s.cats],
  };
});

const suppliersByCategory = new Map<string, Supplier[]>();
for (const sup of suppliers) {
  for (const cat of sup.categories) {
    const list = suppliersByCategory.get(cat) ?? [];
    list.push(sup);
    suppliersByCategory.set(cat, list);
  }
}

/* -------------------------------------------------------------- customers */

const customers: Customer[] = CUSTOMER_SEEDS.map((c, i) => {
  const contact = PEOPLE[(i * 3 + 11) % PEOPLE.length];
  const creditLimit = r.int(5, 90) * 1000;
  return {
    id: id("CUS", i + 1, 3),
    code: `C-${String(2000 + i * 13).padStart(4, "0")}`,
    name: c.name,
    type: c.type,
    contactName: contact,
    email: `orders@${slugify(c.name).split("-").slice(0, 2).join("")}.com`,
    phone: `+1 ${r.int(200, 989)} ${r.int(200, 999)} ${String(r.int(0, 9999)).padStart(4, "0")}`,
    city: c.city,
    country: c.country,
    creditLimit,
    outstanding: money(creditLimit * r.float(0, 0.78)),
    totalOrders: 0,
    totalSpend: 0,
    status: r.weighted([
      ["active", 88],
      ["on-hold", 7],
      ["inactive", 5],
    ]),
    since: daysFromNow(-r.int(120, 2600)),
  };
});

/* --------------------------------------------------------------- products */

const products: Product[] = [];
{
  let n = 0;
  for (const seed of CATEGORY_SEEDS) {
    const slug = seed.slug as CategorySlug;
    const category = categoryBySlug.get(slug)!;
    const pool = suppliersByCategory.get(slug) ?? suppliers;

    for (const p of PRODUCT_SEEDS[slug]) {
      for (const variant of p.variants) {
        n++;
        const unitCost = money(r.float(p.cost[0], p.cost[1]));
        const margin = r.float(p.margin[0], p.margin[1]);
        const sellPrice = money(unitCost / (1 - margin));
        const brand = r.pick(BRANDS);
        const primary = r.pick(pool);
        const extra = r.sample(
          pool.filter((s) => s.id !== primary.id),
          r.int(0, 2),
        );
        const reorderPoint = r.weighted([
          [r.int(8, 40), 40],
          [r.int(40, 140), 40],
          [r.int(140, 420), 20],
        ]);
        const createdAt = daysFromNow(-r.int(45, 1400));

        products.push({
          id: id("PRD", n, 4),
          sku: `${seed.prefix}-${p.code}-${String(100 + n).padStart(3, "0")}`,
          name: `${brand} ${p.base} — ${variant}`,
          shortName: `${p.base} ${variant}`,
          categoryId: category.id,
          brand,
          description: `${p.base} (${variant}) supplied by ${primary.name}. ${seed.description}`,
          barcode: `5${String(r.int(0, 99999999999)).padStart(11, "0")}${r.int(0, 9)}`,
          unit: p.unit,
          unitCost,
          sellPrice,
          status: r.weighted([
            ["active", 87],
            ["draft", 5],
            ["discontinued", 6],
            ["archived", 2],
          ]),
          primarySupplierId: primary.id,
          supplierIds: [primary.id, ...extra.map((s) => s.id)],
          reorderPoint,
          reorderQty: Math.round(reorderPoint * r.float(1.4, 3.2)),
          leadTimeDays: primary.leadTimeDays,
          weightKg: money(r.float(0.05, 46)),
          dimensionsCm: `${r.int(4, 120)}×${r.int(4, 90)}×${r.int(2, 70)}`,
          batchTracked: p.batch ?? false,
          serialTracked: p.serial ?? false,
          hasExpiry: p.expiry !== undefined,
          shelfLifeDays: p.expiry ?? null,
          hsCode: `${r.int(3000, 9600)}.${String(r.int(0, 99)).padStart(2, "0")}.${String(r.int(0, 99)).padStart(2, "0")}`,
          createdAt,
          updatedAt: daysFromNow(-r.float(0, 60)),
        });
      }
    }
  }
}

const productById = new Map(products.map((p) => [p.id, p]));
const activeProducts = products.filter((p) => p.status === "active");

/* ------------------------------------------------------------- stock rows */

const stockRows: StockRow[] = [];
for (const product of products) {
  const siteCount =
    product.status === "active"
      ? r.weighted([
          [1, 22],
          [2, 33],
          [3, 26],
          [4, 13],
          [5, 6],
        ])
      : r.int(1, 2);
  const sites = r.sample(warehouses, siteCount);

  // A slice of the catalogue is deliberately in trouble — an inventory tool
  // whose every row is healthy tells the operator nothing.
  const posture = r.weighted([
    ["healthy", 58],
    ["low", 17],
    ["critical", 8],
    ["out", 7],
    ["over", 10],
  ] as const);

  for (const site of sites) {
    const locs = locationsByWarehouse.get(site.id)!;
    const loc = r.pick(locs);
    const rp = product.reorderPoint;

    const onHand =
      posture === "out"
        ? 0
        : posture === "critical"
          ? r.int(1, Math.max(2, Math.floor(rp * 0.35)))
          : posture === "low"
            ? r.int(Math.floor(rp * 0.4), Math.max(2, rp))
            : posture === "over"
              ? r.int(rp * 6, rp * 14 + 40)
              : r.int(rp + 5, rp * 4 + 30);

    // Reserved and damaged are subsets of on-hand, never additions to it: a
    // location with nothing on the shelf cannot be holding a damaged unit.
    const reserved = onHand > 0 ? r.int(0, Math.floor(onHand * 0.28)) : 0;
    const damaged =
      onHand - reserved > 1 && r.bool(0.14)
        ? r.int(1, Math.max(1, Math.floor((onHand - reserved) * 0.05)))
        : 0;

    stockRows.push({
      productId: product.id,
      warehouseId: site.id,
      locationId: loc.id,
      onHand,
      reserved,
      damaged,
      incoming: r.bool(0.32) ? r.int(10, product.reorderQty) : 0,
      inTransit: r.bool(0.12) ? r.int(5, 120) : 0,
      lastCountedAt: r.bool(0.7) ? daysFromNow(-r.int(2, 210)) : null,
      expiresAt:
        product.hasExpiry && onHand > 0
          ? daysFromNow(
              r.weighted([
                [r.int(-18, 30), 20],
                [r.int(31, 120), 30],
                [r.int(121, product.shelfLifeDays ?? 365), 50],
              ]),
            )
          : null,
      lotNumber:
        product.batchTracked && onHand > 0
          ? `LOT-${r.int(2024, 2026)}-${String(r.int(1, 9999)).padStart(4, "0")}`
          : null,
    });
  }
}

/* ------------------------------------------------- what each site holds -- */

/**
 * Products actually held at each warehouse.
 *
 * Sales orders and transfers take stock *out* of a specific site, so their
 * lines have to come from what that site holds. Drawing from the whole
 * catalogue instead produces orders whose every line reads "0 on the shelf" at
 * the warehouse they are shipping from.
 */
const productsAtWarehouse = new Map<string, Product[]>();
{
  const seen = new Map<string, Set<string>>();
  for (const row of stockRows) {
    if (row.onHand <= 0) continue;
    const product = products.find((p) => p.id === row.productId);
    if (!product || product.status !== "active") continue;

    const ids = seen.get(row.warehouseId) ?? new Set<string>();
    if (ids.has(product.id)) continue;
    ids.add(product.id);
    seen.set(row.warehouseId, ids);

    const list = productsAtWarehouse.get(row.warehouseId) ?? [];
    list.push(product);
    productsAtWarehouse.set(row.warehouseId, list);
  }
}

/** Falls back to the full catalogue only if a site somehow holds nothing. */
const stockedAt = (warehouseId: string): Product[] => {
  const held = productsAtWarehouse.get(warehouseId);
  return held && held.length >= 8 ? held : activeProducts;
};

/* -------------------------------------------------------- purchase orders */

const PO_RECEIVED: POStatus[] = ["received", "closed"];

function buildLines(
  pool: Product[],
  count: number,
  priceOf: (p: Product) => number,
  // Stock is bought in case and pallet quantities and sold in smaller lots.
  // Without this the ledger drains and the value trend falls off a cliff.
  qtyScale = 1,
): OrderLine[] {
  return r.sample(pool, count).map((p, i) => {
    const quantity = Math.round(
      r.weighted([
        [r.int(2, 24), 45],
        [r.int(24, 160), 40],
        [r.int(160, 900), 15],
      ]) * qtyScale,
    );
    const unitPrice = money(priceOf(p));
    const discountPct = r.bool(0.28) ? r.round(2, 12, 1) : 0;
    const taxPct = r.pick([0, 5, 8.25, 20]);
    const net = quantity * unitPrice * (1 - discountPct / 100);
    return {
      id: id("LN", i + 1, 3),
      productId: p.id,
      sku: p.sku,
      name: p.name,
      quantity,
      fulfilled: 0,
      unitPrice,
      discountPct,
      taxPct,
      lineTotal: money(net * (1 + taxPct / 100)),
    };
  });
}

function totalsOf(lines: OrderLine[], shipping: number) {
  let subtotal = 0;
  let discountTotal = 0;
  let taxTotal = 0;
  for (const l of lines) {
    const gross = l.quantity * l.unitPrice;
    const disc = gross * (l.discountPct / 100);
    const net = gross - disc;
    subtotal += gross;
    discountTotal += disc;
    taxTotal += net * (l.taxPct / 100);
  }
  return {
    subtotal: money(subtotal),
    discountTotal: money(discountTotal),
    taxTotal: money(taxTotal),
    shipping: money(shipping),
    total: money(subtotal - discountTotal + taxTotal + shipping),
  };
}

/**
 * Age first, status second.
 *
 * Deriving the status from how old a document is (rather than picking a status
 * and then inventing a date) is what makes the twelve-month charts look like a
 * real order book: steady monthly volume, with only the last few days of work
 * still open. The other way round piles every in-flight order into this week
 * and puts a cliff at the right edge of every trend line.
 */
function skewedAge(span: number, recencyBias: number): number {
  return Math.floor(span * Math.pow(r.float(0, 1), recencyBias));
}

const purchaseOrders: PurchaseOrder[] = [];
for (let i = 0; i < 196; i++) {
  const supplier = r.pick(suppliers);
  const warehouse = r.pick(warehouses);
  const lead = supplier.leadTimeDays;
  const ageDays = skewedAge(340, 1.15);

  const status: POStatus =
    ageDays <= 1
      ? r.weighted([
          ["draft", 45],
          ["submitted", 55],
        ])
      : ageDays <= 4
        ? r.weighted([
            ["submitted", 35],
            ["approved", 45],
            ["ordered", 20],
          ])
        : ageDays <= lead
          ? r.weighted([
              ["ordered", 88],
              ["cancelled", 12],
            ])
          : ageDays <= lead + 8
            ? r.weighted([
                ["ordered", 30],
                ["partially-received", 50],
                ["received", 20],
              ])
            : ageDays <= lead + 45
              ? r.weighted([
                  ["received", 40],
                  ["closed", 38],
                  ["partially-received", 18],
                  ["cancelled", 4],
                ])
              : // Past the chase window everything is settled. A part-received
                // order left open for eight months is not an order book, it is
                // a bug — somebody would have closed it short or cancelled it.
                r.weighted([
                  ["received", 48],
                  ["closed", 48],
                  ["cancelled", 4],
                ]);

  const catPool = activeProducts.filter((p) =>
    supplier.categories.includes(categories.find((c) => c.id === p.categoryId)!.slug),
  );
  const pool = catPool.length >= 6 ? catPool : activeProducts;
  const lines = buildLines(pool, r.int(1, 9), (p) => p.unitCost * r.float(0.93, 1.06), 2.4);

  const createdAt = ago(ageDays);
  const ordered = status === "draft" || status === "submitted" ? null : ago(ageDays - r.int(0, 3));
  const expectedAgo = ageDays - lead + r.int(-6, 4);
  const settledExpectedAgo = Math.max(1, expectedAgo);
  const expectedAt = daysFromNow(
    -(PO_RECEIVED.includes(status) ? settledExpectedAgo : expectedAgo),
  );

  // Delivery timing is drawn from the supplier own on-time rate, so the rate
  // shown on their profile is the same fact as the dates on their orders.
  // Deriving the two independently made every completed order read as late
  // while the headline claimed 89% on time.
  const arrivedOnTime = r.bool(supplier.onTimeRate);
  const receivedAgo = arrivedOnTime
    ? settledExpectedAgo + r.int(0, 3)
    : Math.max(0.2, settledExpectedAgo - r.int(1, 9));

  for (const line of lines) {
    line.fulfilled = PO_RECEIVED.includes(status)
      ? line.quantity
      : status === "partially-received"
        ? r.int(1, Math.max(1, line.quantity - 1))
        : 0;
  }

  const shipping = money(r.float(0, 640));
  const t = totalsOf(lines, shipping);
  const createdBy = pickUser("purchasing-manager");
  const needsApproval = t.total > 5000;
  const approvedBy =
    status === "draft" || status === "submitted" || status === "cancelled"
      ? null
      : pickUser("purchasing-manager");

  const approvals: ApprovalEvent[] = [
    { id: id("APV", 1, 2), ts: createdAt, userId: createdBy, action: "created" },
  ];
  if (status !== "draft") {
    approvals.push({
      id: id("APV", 2, 2),
      ts: ago(ageDays - 0.4),
      userId: createdBy,
      action: "submitted",
      note: needsApproval ? "Above auto-approval threshold — routed for sign-off." : undefined,
    });
  }
  if (approvedBy) {
    approvals.push({
      id: id("APV", 3, 2),
      ts: ago(ageDays - 1.1),
      userId: approvedBy,
      action: "approved",
    });
  }
  if (status === "cancelled") {
    approvals.push({
      id: id("APV", 4, 2),
      ts: ago(ageDays - 2),
      userId: pickUser("purchasing-manager"),
      action: "rejected",
      note: r.pick([
        "Supplier could not confirm the delivery window.",
        "Duplicate of an order raised the same week.",
        "Budget hold on non-critical spend this quarter.",
      ]),
    });
  }

  const attachments: Attachment[] = r.bool(0.45)
    ? [
        {
          id: id("ATT", i + 1, 4),
          name: `${supplier.code}-quotation.pdf`,
          sizeKb: r.int(64, 2400),
          kind: "pdf",
          uploadedAt: createdAt,
          uploadedBy: createdBy,
        },
      ]
    : [];

  purchaseOrders.push({
    id: id("PO", i + 1, 4),
    number: `PO-${2026}-${String(1000 + i).padStart(4, "0")}`,
    supplierId: supplier.id,
    warehouseId: warehouse.id,
    status,
    createdAt,
    orderedAt: ordered,
    expectedAt,
    receivedAt: PO_RECEIVED.includes(status) ? ago(receivedAgo) : null,
    lines,
    ...t,
    currency: "USD",
    createdBy,
    approvedBy,
    approvals,
    notes: r.bool(0.4)
      ? r.pick([
          "Deliver to goods-in dock 3 before 14:00.",
          "Split shipment acceptable — confirm ASN for each leg.",
          "Pallets must be shrink-wrapped and labelled per site standard.",
          "Contract pricing applies; reject any surcharge lines.",
        ])
      : "",
    attachments,
    paymentTerms: supplier.paymentTerms,
  });
}

for (const po of purchaseOrders) {
  const sup = suppliers.find((s) => s.id === po.supplierId)!;
  if (po.status !== "cancelled" && po.status !== "draft") sup.totalSpend = money(sup.totalSpend + po.total);
  if (["submitted", "approved", "ordered", "partially-received"].includes(po.status)) sup.openOrders++;
}

/* ------------------------------------------------------------ sales orders */

const salesOrders: SalesOrder[] = [];
for (let i = 0; i < 430; i++) {
  const customer = r.pick(customers);
  const warehouse = r.pick(warehouses);
  const ageDays = skewedAge(340, 1.3);

  const status: SOStatus =
    ageDays < 1
      ? r.weighted([
          ["draft", 18],
          ["confirmed", 44],
          ["reserved", 38],
        ])
      : ageDays <= 2
        ? r.weighted([
            ["reserved", 22],
            ["picking", 42],
            ["packing", 30],
            ["backorder", 6],
          ])
        : ageDays <= 5
          ? r.weighted([
              ["packing", 16],
              ["shipped", 68],
              ["backorder", 12],
              ["cancelled", 4],
            ])
          : ageDays <= 13
            ? r.weighted([
                ["shipped", 48],
                ["delivered", 44],
                ["backorder", 5],
                ["cancelled", 3],
              ])
            : r.weighted([
                ["delivered", 94],
                ["cancelled", 6],
              ]);

  const lines = buildLines(
    stockedAt(warehouse.id),
    r.int(1, 7),
    (p) => p.sellPrice * r.float(0.9, 1.02),
  );
  const placedAt = ago(ageDays);

  const shipped = ["shipped", "delivered"].includes(status);
  for (const line of lines) {
    line.fulfilled = shipped
      ? line.quantity
      : status === "backorder"
        ? r.int(0, Math.max(0, line.quantity - 1))
        : ["picking", "packing"].includes(status)
          ? r.int(0, line.quantity)
          : 0;
  }

  const shipping = money(r.float(0, 180));
  const t = totalsOf(lines, shipping);

  salesOrders.push({
    id: id("SO", i + 1, 4),
    number: `SO-${2026}-${String(4000 + i).padStart(4, "0")}`,
    customerId: customer.id,
    warehouseId: warehouse.id,
    status,
    paymentStatus:
      status === "cancelled"
        ? "refunded"
        : r.weighted([
            ["paid", 58],
            ["unpaid", 24],
            ["partial", 15],
            ["refunded", 3],
          ]),
    fulfillmentStatus: shipped
      ? "fulfilled"
      : status === "backorder" || ["picking", "packing"].includes(status)
        ? "partial"
        : "unfulfilled",
    channel: r.weighted([
      ["web", 34],
      ["edi", 22],
      ["phone", 18],
      ["pos", 14],
      ["marketplace", 12],
    ]),
    placedAt,
    promisedAt: daysFromNow(-(ageDays - r.int(2, 14))),
    shippedAt: shipped ? ago(ageDays - Math.min(ageDays, r.int(1, 4))) : null,
    lines,
    ...t,
    currency: "USD",
    createdBy: pickUser("sales-manager"),
    carrier: shipped ? r.pick(CARRIERS) : null,
    trackingNumber: shipped ? `1Z${String(r.int(100000000, 999999999))}${r.int(10, 99)}` : null,
    shipToCity: customer.city,
    notes: r.bool(0.24)
      ? r.pick([
          "Customer requires delivery note signed on arrival.",
          "Do not split — ship complete only.",
          "Gate access code required for the loading bay.",
        ])
      : "",
  });
}

for (const so of salesOrders) {
  const c = customers.find((x) => x.id === so.customerId)!;
  if (so.status !== "cancelled" && so.status !== "draft") {
    c.totalOrders++;
    c.totalSpend = money(c.totalSpend + so.total);
  }
}

/* ---------------------------------------------------------------- transfers */

const TRANSFER_MIX: readonly (readonly [TransferStatus, number])[] = [
  ["draft", 8],
  ["pending-approval", 13],
  ["approved", 10],
  ["in-transit", 20],
  ["partially-received", 9],
  ["received", 35],
  ["cancelled", 5],
];

const TRANSFER_REASONS = [
  "Rebalancing stock ahead of a regional promotion",
  "Replenishing a site that fell below its reorder point",
  "Consolidating slow-moving stock into the main DC",
  "Moving inventory out of a site scheduled for maintenance",
  "Covering a confirmed sales order the destination cannot fill",
];

const transfers: Transfer[] = [];
for (let i = 0; i < 52; i++) {
  const status = r.weighted(TRANSFER_MIX);
  const [from, to] = r.sample(warehouses, 2);
  const picks = r.sample(stockedAt(from.id), r.int(1, 8));
  const ageDays = ["draft", "pending-approval", "approved"].includes(status)
    ? r.int(0, 10)
    : status === "in-transit"
      ? r.int(1, 9)
      : status === "partially-received"
        ? r.int(5, 26)
        : r.int(6, 180);

  const lines: TransferLine[] = picks.map((p, n) => {
    const quantity = r.int(4, 320);
    const shipped = ["in-transit", "partially-received", "received"].includes(status) ? quantity : 0;
    const received =
      status === "received"
        ? quantity
        : status === "partially-received"
          ? r.int(1, Math.max(1, quantity - 1))
          : 0;
    return {
      id: id("TL", n + 1, 3),
      productId: p.id,
      sku: p.sku,
      name: p.name,
      quantity,
      shipped,
      received,
      fromLocationId: r.pick(locationsByWarehouse.get(from.id)!).id,
      toLocationId: received > 0 ? r.pick(locationsByWarehouse.get(to.id)!).id : null,
    };
  });

  const requestedBy = pickUser("inventory-manager");
  const approvedBy = ["draft", "pending-approval", "cancelled"].includes(status)
    ? null
    : pickUser("inventory-manager");

  const approvals: ApprovalEvent[] = [
    { id: id("APV", 1, 2), ts: ago(ageDays), userId: requestedBy, action: "created" },
  ];
  if (status !== "draft") {
    approvals.push({ id: id("APV", 2, 2), ts: ago(ageDays - 0.2), userId: requestedBy, action: "submitted" });
  }
  if (approvedBy) {
    approvals.push({ id: id("APV", 3, 2), ts: ago(ageDays - 0.8), userId: approvedBy, action: "approved" });
  }

  transfers.push({
    id: id("TR", i + 1, 3),
    number: `TR-${2026}-${String(200 + i).padStart(3, "0")}`,
    fromWarehouseId: from.id,
    toWarehouseId: to.id,
    status,
    createdAt: ago(ageDays),
    approvedAt: approvedBy ? ago(ageDays - 0.8) : null,
    shippedAt: ["in-transit", "partially-received", "received"].includes(status)
      ? ago(ageDays - r.int(1, 3))
      : null,
    expectedAt: daysFromNow(-(ageDays - r.int(3, 12))),
    receivedAt: status === "received" ? ago(ageDays - r.int(4, 10)) : null,
    lines,
    requestedBy,
    approvedBy,
    approvals,
    carrier: ["in-transit", "partially-received", "received"].includes(status) ? r.pick(CARRIERS) : null,
    trackingNumber: ["in-transit", "partially-received", "received"].includes(status)
      ? `TRK${r.int(1000000, 9999999)}`
      : null,
    reason: r.pick(TRANSFER_REASONS),
    notes: "",
  });
}

/* -------------------------------------------------------------- adjustments */

const ADJ_REASONS: readonly (readonly [AdjustmentReason, number])[] = [
  ["damaged", 24],
  ["count-error", 21],
  ["lost", 14],
  ["found", 11],
  ["expired", 10],
  ["manual-correction", 9],
  ["internal-use", 8],
  ["other", 3],
];

const ADJUSTMENT_NOTES: Record<AdjustmentReason, string[]> = {
  damaged: [
    "Found crushed under a fallen pallet during a rack inspection.",
    "Forklift damage at the goods-in dock; units unsellable.",
    "Water ingress from a roof leak in zone C.",
  ],
  lost: [
    "Not located after a full search of the pick face and reserve.",
    "Missing since the last put-away; no movement record found.",
    "Believed mis-shipped on an earlier order; unrecoverable.",
  ],
  found: [
    "Located behind a pallet in reserve during a cycle count.",
    "Unrecorded put-away from a receipt booked in short.",
    "Recovered from a quarantine bay after inspection passed.",
  ],
  expired: [
    "Shelf life passed while held in quarantine.",
    "Expiry date reached before the stock could be rotated.",
    "Failed a date check at pick; quarantined and written off.",
  ],
  "count-error": [
    "Cycle count variance confirmed by a second counter.",
    "Recount matched the physical quantity, not the system figure.",
    "Case-pack quantity was recorded as eaches at receipt.",
  ],
  "manual-correction": [
    "Mis-scanned at goods-in; corrected against the ASN.",
    "Duplicate receipt posted twice; the second one reversed.",
    "Quantity keyed against the wrong SKU and corrected.",
  ],
  "internal-use": [
    "Units consumed internally for a packing-line trial.",
    "Issued to the maintenance team for site repairs.",
    "Used as samples for a customer specification review.",
  ],
  other: [
    "Written off following an insurance claim.",
    "Disposed of under the site environmental policy.",
    "Adjustment agreed with Finance during a period close.",
  ],
};

const ADJ_STATUS: readonly (readonly [AdjustmentStatus, number])[] = [
  ["draft", 6],
  ["pending-approval", 18],
  ["approved", 10],
  ["rejected", 6],
  ["applied", 60],
];

const adjustments: Adjustment[] = [];
for (let i = 0; i < 96; i++) {
  const status = r.weighted(ADJ_STATUS);
  const reason = r.weighted(ADJ_REASONS);
  const warehouse = r.pick(warehouses);
  const picks = r.sample(stockedAt(warehouse.id), r.int(1, 5));
  const ageDays = ["draft", "pending-approval"].includes(status) ? r.int(0, 6) : r.int(1, 300);

  const lines: AdjustmentLine[] = picks.map((p, n) => {
    const before = r.int(4, 900);
    const positive = reason === "found";
    const delta = positive ? r.int(1, 40) : -r.int(1, Math.max(2, Math.floor(before * 0.2)));
    return {
      id: id("AL", n + 1, 3),
      productId: p.id,
      sku: p.sku,
      name: p.name,
      locationId: r.pick(locationsByWarehouse.get(warehouse.id)!).id,
      qtyBefore: before,
      qtyAfter: before + delta,
      delta,
      unitCost: p.unitCost,
      valueImpact: money(delta * p.unitCost),
      lotNumber: p.batchTracked ? `LOT-${r.int(2024, 2026)}-${String(r.int(1, 9999)).padStart(4, "0")}` : null,
    };
  });

  const totalValueImpact = money(lines.reduce((s, l) => s + l.valueImpact, 0));
  const createdBy = r.bool(0.55) ? pickUser("warehouse-staff") : pickUser("inventory-manager");
  // Anything moving more than $500 of value needs a second pair of eyes.
  const requiresApproval = Math.abs(totalValueImpact) > 500;
  const approvedBy = ["approved", "applied"].includes(status) ? pickUser("inventory-manager") : null;

  const approvals: ApprovalEvent[] = [
    { id: id("APV", 1, 2), ts: ago(ageDays), userId: createdBy, action: "created" },
  ];
  if (status !== "draft") {
    approvals.push({ id: id("APV", 2, 2), ts: ago(ageDays - 0.1), userId: createdBy, action: "submitted" });
  }
  if (approvedBy) {
    approvals.push({ id: id("APV", 3, 2), ts: ago(ageDays - 0.6), userId: approvedBy, action: "approved" });
  }
  if (status === "rejected") {
    approvals.push({
      id: id("APV", 4, 2),
      ts: ago(ageDays - 0.7),
      userId: pickUser("inventory-manager"),
      action: "rejected",
      note: "Recount requested before any write-off is posted.",
    });
  }

  adjustments.push({
    id: id("ADJ", i + 1, 4),
    number: `ADJ-${2026}-${String(300 + i).padStart(4, "0")}`,
    warehouseId: warehouse.id,
    reason,
    status,
    createdAt: ago(ageDays),
    appliedAt: status === "applied" ? ago(ageDays - 0.9) : null,
    lines,
    totalDelta: lines.reduce((s, l) => s + l.delta, 0),
    totalValueImpact,
    createdBy,
    approvedBy,
    approvals,
    // The note has to match the reason. A "count error" adjustment explained as
    // an internal-use write-off is exactly the kind of detail that makes a
    // dataset read as generated rather than recorded.
    note: r.pick(ADJUSTMENT_NOTES[reason]),
    requiresApproval,
  });
}

/* ------------------------------------------------------------ stock counts */

const COUNT_PLAN: { type: CountType; status: CountStatus }[] = [
  { type: "cycle", status: "in-progress" },
  { type: "cycle", status: "in-progress" },
  { type: "cycle", status: "review" },
  { type: "category", status: "review" },
  { type: "full", status: "scheduled" },
  { type: "cycle", status: "scheduled" },
  { type: "location", status: "scheduled" },
  { type: "spot", status: "approved" },
  { type: "cycle", status: "approved" },
  { type: "category", status: "applied" },
  { type: "cycle", status: "applied" },
  { type: "full", status: "applied" },
  { type: "location", status: "applied" },
  { type: "spot", status: "cancelled" },
];

const stockCounts: StockCount[] = COUNT_PLAN.map((plan, i) => {
  const warehouse = r.pick(warehouses);
  const picks = r.sample(stockedAt(warehouse.id), r.int(8, 28));
  const done = ["review", "approved", "applied"].includes(plan.status);
  const partial = plan.status === "in-progress";
  const staff = r.sample(byRole("warehouse-staff"), r.int(1, 3)).map((u) => u.id);

  const lines: CountLine[] = picks.map((p, n) => {
    const expected = r.int(10, 900);
    const counted =
      done || (partial && n < picks.length * 0.6)
        ? r.bool(0.94)
          ? expected
          : expected + r.int(-14, 14)
        : null;
    const variance = counted === null ? 0 : counted - expected;
    return {
      id: id("CL", n + 1, 3),
      productId: p.id,
      sku: p.sku,
      name: p.name,
      locationId: r.pick(locationsByWarehouse.get(warehouse.id)!).id,
      expected,
      counted,
      variance,
      varianceValue: money(variance * p.unitCost),
      countedBy: counted === null ? null : r.pick(staff),
      countedAt: counted === null ? null : daysFromNow(-r.int(0, 8)),
      recount: Math.abs(variance) > 8,
    };
  });

  const withCounts = lines.filter((l) => l.counted !== null);
  const accurate = withCounts.filter((l) => l.variance === 0).length;
  const ageDays =
    plan.status === "scheduled"
      ? -r.int(1, 18)
      : ["in-progress", "review"].includes(plan.status)
        ? r.int(1, 6)
        : r.int(8, 120);

  return {
    id: id("CNT", i + 1, 3),
    number: `CNT-${2026}-${String(50 + i).padStart(3, "0")}`,
    type: plan.type,
    warehouseId: warehouse.id,
    scopeLabel:
      plan.type === "full"
        ? "All zones"
        : plan.type === "category"
          ? r.pick(categories).name
          : plan.type === "location"
            ? `Zone ${r.pick(ZONES)}`
            : `${picks.length} SKUs`,
    status: plan.status,
    scheduledFor: daysFromNow(-ageDays),
    startedAt: plan.status === "scheduled" ? null : ago(ageDays - 0.2),
    completedAt: ["approved", "applied"].includes(plan.status) ? ago(ageDays - 1.4) : null,
    assignedTo: staff,
    lines,
    accuracyPct: withCounts.length ? Math.round((accurate / withCounts.length) * 1000) / 10 : 0,
    totalVarianceValue: money(lines.reduce((s, l) => s + l.varianceValue, 0)),
    createdBy: pickUser("inventory-manager"),
    approvedBy: ["approved", "applied"].includes(plan.status) ? pickUser("inventory-manager") : null,
  };
});

/* ----------------------------------------------------------------- returns */

const RETURN_STATUS: readonly (readonly [ReturnStatus, number])[] = [
  ["requested", 14],
  ["approved", 12],
  ["in-transit", 10],
  ["received", 14],
  ["inspected", 14],
  ["credited", 30],
  ["rejected", 6],
];

const SALES_RETURN_REASONS = [
  "Wrong item shipped",
  "Damaged in transit",
  "Customer ordered in error",
  "Faulty on arrival",
  "Over-shipment returned",
  "Specification mismatch",
];

const PURCHASE_RETURN_REASONS = [
  "Delivered against a cancelled line",
  "Failed goods-in inspection",
  "Short shelf life on arrival",
  "Supplier shipped the wrong variant",
  "Quantity over-delivered",
];

const returns: ReturnDoc[] = [];
{
  const shippedOrders = salesOrders.filter((o) => o.shippedAt);
  const receivedPos = purchaseOrders.filter((p) => PO_RECEIVED.includes(p.status));

  for (let i = 0; i < 44; i++) {
    const kind = r.bool(0.62) ? "sales" : "purchase";
    const source = kind === "sales" ? r.pick(shippedOrders) : r.pick(receivedPos);
    const status = r.weighted(RETURN_STATUS);
    const srcLines = r.sample(source.lines, r.int(1, Math.min(3, source.lines.length)));

    const lines: ReturnLine[] = srcLines.map((l, n) => {
      const quantity = r.int(1, Math.max(1, Math.floor(l.quantity * 0.4)));
      const condition = r.weighted<ItemCondition>([
        ["sellable", 44],
        ["damaged", 28],
        ["defective", 20],
        ["expired", 8],
      ]);
      return {
        id: id("RL", n + 1, 3),
        productId: l.productId,
        sku: l.sku,
        name: l.name,
        quantity,
        condition,
        restock: condition === "sellable",
        unitPrice: l.unitPrice,
        refundAmount: money(quantity * l.unitPrice),
      };
    });

    const restockValue = money(
      lines.filter((l) => l.restock).reduce((s, l) => s + l.quantity * l.unitPrice, 0),
    );
    const ageDays = ["requested", "approved", "in-transit"].includes(status)
      ? r.int(0, 12)
      : r.int(11, 200);

    returns.push({
      id: id("RET", i + 1, 3),
      number: `${kind === "sales" ? "SR" : "PR"}-${2026}-${String(100 + i).padStart(3, "0")}`,
      kind,
      partnerId: kind === "sales" ? (source as SalesOrder).customerId : (source as PurchaseOrder).supplierId,
      sourceOrderId: source.id,
      sourceOrderNumber: source.number,
      warehouseId: source.warehouseId,
      status,
      reason: r.pick(kind === "sales" ? SALES_RETURN_REASONS : PURCHASE_RETURN_REASONS),
      createdAt: ago(ageDays),
      resolvedAt: ["credited", "rejected"].includes(status) ? ago(ageDays - r.int(1, 9)) : null,
      lines,
      refundTotal: money(lines.reduce((s, l) => s + l.refundAmount, 0)),
      restockValue,
      createdBy: kind === "sales" ? pickUser("sales-manager") : pickUser("purchasing-manager"),
      note: "",
    });
  }
}

/* --------------------------------------------------------------- movements */

/**
 * The ledger. Rows are derived from the documents above so a movement always
 * points at a real PO/SO/TR/ADJ, plus filler traffic so the history has depth.
 */
const movements: Movement[] = [];
{
  let n = 0;
  const push = (
    ts: string,
    type: MovementType,
    productId: string,
    warehouseId: string,
    qtyChange: number,
    refType: string,
    refId: string,
    refNumber: string,
    userId: string,
    reason: string,
  ) => {
    const product = productById.get(productId);
    if (!product) return;
    const qtyBefore = r.int(Math.max(0, Math.abs(qtyChange)), Math.abs(qtyChange) + 900);
    n++;
    movements.push({
      id: id("MOV", n, 5),
      ts,
      type,
      productId,
      sku: product.sku,
      warehouseId,
      locationId: r.pick(locationsByWarehouse.get(warehouseId)!).id,
      qtyBefore,
      qtyChange,
      qtyAfter: qtyBefore + qtyChange,
      unitCost: product.unitCost,
      valueChange: money(qtyChange * product.unitCost),
      refType,
      refId,
      refNumber,
      userId,
      reason,
    });
  };

  for (const po of purchaseOrders) {
    if (!["partially-received", "received", "closed"].includes(po.status)) continue;
    for (const line of po.lines) {
      if (line.fulfilled <= 0) continue;
      push(
        po.receivedAt ?? ago(2),
        "purchase-receipt",
        line.productId,
        po.warehouseId,
        line.fulfilled,
        "purchase-order",
        po.id,
        po.number,
        pickUser("warehouse-staff"),
        "Goods received against purchase order",
      );
    }
  }

  for (const so of salesOrders) {
    if (!so.shippedAt) continue;
    for (const line of so.lines) {
      if (line.fulfilled <= 0) continue;
      push(
        so.shippedAt,
        "sale",
        line.productId,
        so.warehouseId,
        -line.fulfilled,
        "sales-order",
        so.id,
        so.number,
        pickUser("warehouse-staff"),
        "Shipped against sales order",
      );
    }
  }

  for (const tr of transfers) {
    for (const line of tr.lines) {
      if (line.shipped > 0 && tr.shippedAt) {
        push(tr.shippedAt, "transfer-out", line.productId, tr.fromWarehouseId, -line.shipped, "transfer", tr.id, tr.number, pickUser("warehouse-staff"), "Despatched on stock transfer");
      }
      if (line.received > 0 && tr.receivedAt) {
        push(tr.receivedAt, "transfer-in", line.productId, tr.toWarehouseId, line.received, "transfer", tr.id, tr.number, pickUser("warehouse-staff"), "Received from stock transfer");
      }
    }
  }

  for (const adj of adjustments) {
    if (adj.status !== "applied") continue;
    for (const line of adj.lines) {
      push(
        adj.appliedAt!,
        adj.reason === "damaged" ? "damage" : "adjustment",
        line.productId,
        adj.warehouseId,
        line.delta,
        "adjustment",
        adj.id,
        adj.number,
        adj.approvedBy ?? adj.createdBy,
        adj.note,
      );
    }
  }

  for (const cnt of stockCounts) {
    if (cnt.status !== "applied") continue;
    for (const line of cnt.lines) {
      if (!line.variance) continue;
      push(cnt.completedAt!, "count-correction", line.productId, cnt.warehouseId, line.variance, "stock-count", cnt.id, cnt.number, cnt.approvedBy ?? cnt.createdBy, "Variance posted from stock count");
    }
  }

  for (const ret of returns) {
    if (!["received", "inspected", "credited"].includes(ret.status)) continue;
    for (const line of ret.lines) {
      push(
        ret.resolvedAt ?? ret.createdAt,
        ret.kind === "sales" ? "return-in" : "return-out",
        line.productId,
        ret.warehouseId,
        ret.kind === "sales" ? line.quantity : -line.quantity,
        "return",
        ret.id,
        ret.number,
        pickUser("warehouse-staff"),
        ret.reason,
      );
    }
  }

  // Documents alone do not balance: a year of receipts and shipments nets out
  // to a number that has nothing to do with what is on the shelf today. Left
  // alone, walking the ledger back from today's valuation implies the business
  // held five times its current stock last autumn. So each product+site gets
  // the traffic that makes its year net out flat — sales after the receipts
  // that fed them, receipts before the shipments that emptied them.
  {
    const key = (m: { productId: string; warehouseId: string }) => `${m.productId}|${m.warehouseId}`;
    const booked = new Map<string, number>();
    const inbound = new Map<string, string[]>();
    const outbound = new Map<string, string[]>();
    for (const m of movements) {
      const k = key(m);
      booked.set(k, (booked.get(k) ?? 0) + m.qtyChange);
      const side = m.qtyChange > 0 ? inbound : outbound;
      const list = side.get(k) ?? [];
      list.push(m.ts);
      side.set(k, list);
    }

    // Stock with no history at all reads as a hole in the ledger — the shelf
    // says 84 and the history tab says nothing ever happened. Anything held
    // without a document behind it gets its opening arrival.
    for (const row of stockRows) {
      if (booked.has(key(row)) || row.onHand <= 0) continue;
      push(
        daysFromNow(-r.float(120, 340)),
        "purchase-receipt",
        row.productId,
        row.warehouseId,
        row.onHand,
        "purchase-order",
        "—",
        `PO-2025-${r.int(100, 999)}`,
        pickUser("warehouse-staff"),
        "Opening stock on hand",
      );
    }

    for (const [k, net] of booked) {
      if (net === 0) continue;
      const sells = net > 0;
      const total = Math.abs(net);
      const [productId, warehouseId] = k.split("|");
      const anchors = (sells ? inbound : outbound).get(k);
      const rows = Math.min(8, Math.max(1, Math.ceil(total / 150)));
      let left = total;

      for (let i = 0; i < rows; i++) {
        const take = i === rows - 1 ? left : Math.ceil(total / rows);
        left -= take;
        // Stock sells in the weeks after it lands and is replaced in the weeks
        // before it runs out. Sprinkling these evenly across the year instead
        // would leave whole months of one-way traffic.
        const anchor = anchors ? new Date(r.pick(anchors)).getTime() : NOW.getTime();
        const offset = r.float(1, 10) * 864e5;
        const ts = Math.min(
          NOW.getTime() - 864e5,
          sells ? anchor + offset : anchor - offset,
        );
        push(
          new Date(ts).toISOString(),
          sells ? "sale" : "purchase-receipt",
          productId,
          warehouseId,
          sells ? -take : take,
          sells ? "sales-order" : "purchase-order",
          "—",
          sells ? `SO-2025-${r.int(1000, 3999)}` : `PO-2025-${r.int(100, 999)}`,
          pickUser("warehouse-staff"),
          "Historic movement",
        );
      }
    }
  }

  // Filler traffic so older history is not sparse.
  // Balanced: filler exists to give older history depth, not to drain stock.
  const fillerTypes: readonly (readonly [MovementType, number])[] = [
    ["sale", 30],
    ["purchase-receipt", 30],
    ["transfer-out", 10],
    ["transfer-in", 10],
    ["adjustment", 12],
    ["damage", 8],
  ];
  // Filler only ever lands where the product is actually stocked — a movement
  // at a site the product has never been held at is a contradiction the
  // warehouses tab would expose.
  const stockedSites = new Map<string, string[]>();
  for (const row of stockRows) {
    const list = stockedSites.get(row.productId) ?? [];
    list.push(row.warehouseId);
    stockedSites.set(row.productId, list);
  }
  const target = 3400;
  while (movements.length < target) {
    const p = r.pick(activeProducts);
    const wh = { id: r.pick(stockedSites.get(p.id) ?? [r.pick(warehouses).id]) };
    const type = r.weighted(fillerTypes);
    const magnitude = r.int(1, 180);
    const outbound = ["sale", "transfer-out", "damage"].includes(type);
    push(
      daysFromNow(-r.float(0, 365)),
      type,
      p.id,
      wh.id,
      outbound ? -magnitude : magnitude,
      type === "sale" ? "sales-order" : type === "purchase-receipt" ? "purchase-order" : "adjustment",
      "—",
      type === "sale" ? `SO-2025-${r.int(1000, 3999)}` : `PO-2025-${r.int(100, 999)}`,
      pickUser("warehouse-staff"),
      "Historic movement",
    );
  }

  movements.sort((a, b) => b.ts.localeCompare(a.ts));

  /* The ledger is anchored to the stock it describes. Each product+warehouse
     chain is walked back from today's on-hand, so the newest row's "after" is
     the number every stock page shows, and each older row hands its "before"
     to the row beneath it. A running balance that argues with the stock table
     reads as fake however good the page looks. */
  const balanceKey = (m: { productId: string; warehouseId: string }) =>
    `${m.productId}|${m.warehouseId}`;
  const onHandByKey = new Map(stockRows.map((row) => [balanceKey(row), row.onHand]));
  const chains = () => {
    const map = new Map<string, Movement[]>();
    for (const m of movements) {
      const list = map.get(balanceKey(m)) ?? [];
      list.push(m); // movements are sorted newest first
      map.set(balanceKey(m), list);
    }
    return map;
  };

  // Where the documents book in more than the site now holds, walking back from
  // on-hand would drive the balance below zero. Absorb the surplus with historic
  // sales placed after the dip rather than shipping a negative shelf.
  for (const [key, chain] of chains()) {
    const anchor = onHandByKey.get(key) ?? 0;
    let balance = anchor;
    let deficit = 0;
    let latestDip = -1;
    for (let i = 0; i < chain.length; i++) {
      balance -= chain[i].qtyChange;
      if (balance < 0 && latestDip === -1) latestDip = i;
      if (balance < -deficit) deficit = -balance;
    }
    if (deficit <= 0) continue;

    // Sitting the absorption immediately after the most recent shortfall lifts
    // every older row by the deepest deficit, so the whole chain clears zero in
    // one pass while the rows above it keep the on-hand anchor.
    const from = new Date(chain[latestDip].ts).getTime() + 1000;
    const to = Math.max(
      from,
      latestDip === 0 ? NOW.getTime() : new Date(chain[latestDip - 1].ts).getTime(),
    );
    const [productId, warehouseId] = key.split("|");
    const rows = Math.min(6, Math.ceil(deficit / 250));
    let left = deficit;
    for (let i = 0; i < rows; i++) {
      const take = i === rows - 1 ? left : Math.ceil(deficit / rows);
      left -= take;
      push(
        new Date(from + r.float(0, 1) * (to - from)).toISOString(),
        "sale",
        productId,
        warehouseId,
        -take,
        "sales-order",
        "—",
        `SO-2025-${r.int(1000, 3999)}`,
        pickUser("warehouse-staff"),
        "Historic movement",
      );
    }
  }
  movements.sort((a, b) => b.ts.localeCompare(a.ts));

  for (const [key, chain] of chains()) {
    let balance = onHandByKey.get(key) ?? 0;
    for (const m of chain) {
      m.qtyAfter = balance;
      balance -= m.qtyChange;
      m.qtyBefore = balance;
    }
  }
}

/* ----------------------------------------------------------------- audit */

const AUDIT_TEMPLATES: {
  action: AuditEntry["action"];
  entity: string;
  field: string | null;
  make: () => [string, string];
}[] = [
  { action: "update", entity: "Product", field: "sellPrice", make: () => [`$${r.round(4, 900)}`, `$${r.round(4, 900)}`] },
  { action: "update", entity: "Product", field: "reorderPoint", make: () => [`${r.int(10, 300)}`, `${r.int(10, 300)}`] },
  { action: "update", entity: "Product", field: "status", make: () => ["active", r.pick(["discontinued", "draft", "archived"])] },
  { action: "approve", entity: "Purchase Order", field: "status", make: () => ["submitted", "approved"] },
  { action: "approve", entity: "Stock Adjustment", field: "status", make: () => ["pending-approval", "approved"] },
  { action: "reject", entity: "Stock Adjustment", field: "status", make: () => ["pending-approval", "rejected"] },
  { action: "update", entity: "Stock Transfer", field: "status", make: () => ["approved", "in-transit"] },
  { action: "permission-change", entity: "Role", field: "permissions", make: () => ["view, export", "view, export, approve"] },
  { action: "create", entity: "Supplier", field: null, make: () => ["", ""] },
  { action: "delete", entity: "Location", field: null, make: () => ["", ""] },
  { action: "export", entity: "Inventory Report", field: null, make: () => ["", ""] },
  { action: "login", entity: "Session", field: null, make: () => ["", ""] },
  { action: "update", entity: "Warehouse", field: "capacityPallets", make: () => [`${r.int(2000, 15000)}`, `${r.int(2000, 15000)}`] },
  { action: "update", entity: "User", field: "role", make: () => ["warehouse-staff", "inventory-manager"] },
];

const auditEntries: AuditEntry[] = [];
for (let i = 0; i < 900; i++) {
  const tpl = r.pick(AUDIT_TEMPLATES);
  const [before, after] = tpl.make();
  const label =
    tpl.entity === "Product"
      ? r.pick(products).sku
      : tpl.entity === "Purchase Order"
        ? r.pick(purchaseOrders).number
        : tpl.entity === "Stock Adjustment"
          ? r.pick(adjustments).number
          : tpl.entity === "Stock Transfer"
            ? r.pick(transfers).number
            : tpl.entity === "Supplier"
              ? r.pick(suppliers).name
              : tpl.entity === "Warehouse"
                ? r.pick(warehouses).code
                : tpl.entity === "User"
                  ? r.pick(users).name
                  : tpl.entity === "Location"
                    ? r.pick(locations).code
                    : "—";

  auditEntries.push({
    id: id("AUD", i + 1, 5),
    ts: daysFromNow(-r.float(0, 180)),
    userId: r.pick(users).id,
    action: tpl.action,
    entity: tpl.entity,
    entityId: id("REF", r.int(1, 900), 4),
    entityLabel: label,
    field: tpl.field,
    before: before || null,
    after: after || null,
    ip: `${r.int(10, 203)}.${r.int(0, 255)}.${r.int(0, 255)}.${r.int(1, 254)}`,
    device: r.pick(DEVICES),
  });
}
auditEntries.sort((a, b) => b.ts.localeCompare(a.ts));

/* --------------------------------------------------------- notifications */

const notifications: AppNotification[] = [
  { category: "stock", priority: "critical", title: "6 SKUs went out of stock at DC-01", body: "Northgate Distribution Center has six active SKUs at zero available. Two have open sales orders against them.", href: "/inventory/stock-levels?view=out-of-stock" },
  { category: "approval", priority: "high", title: "PO-2026-1043 is waiting on your approval", body: "Meridian Packaging Group · $18,420.60 · above the $5,000 sign-off threshold.", href: "/approvals" },
  { category: "expiry", priority: "high", title: "14 lots expire within 30 days", body: "Mostly nitrile gloves and surface disinfectant held at Harbor Cold Storage.", href: "/inventory/stock-levels?view=expiring" },
  { category: "receiving", priority: "normal", title: "Shipment arrived at goods-in dock 2", body: "TR-2026-214 from Cascade Distribution Center is ready to be checked in.", href: "/warehousing/receiving" },
  { category: "approval", priority: "high", title: "Stock adjustment ADJ-2026-0331 needs review", body: "Write-off of $2,140.00 across 3 lines, raised by warehouse staff.", href: "/inventory/adjustments" },
  { category: "integration", priority: "critical", title: "Accounting sync failed", body: "The nightly journal export returned 402 from the accounting connector at 02:14.", href: "/dashboard" },
  { category: "stock", priority: "normal", title: "38 SKUs dropped below their reorder point", body: "Purchase suggestions have been generated for 22 of them.", href: "/inventory/stock-levels?view=low-stock" },
  { category: "import", priority: "normal", title: "Supplier import finished with 7 warnings", body: "612 rows imported, 7 skipped for duplicate supplier codes.", href: "/purchasing/suppliers" },
  { category: "system", priority: "low", title: "Cycle count CNT-2026-0052 is due tomorrow", body: "Zone B at Southfield Distribution Center, 3 counters assigned.", href: "/inventory/counts" },
  { category: "approval", priority: "normal", title: "Transfer TR-2026-0221 awaiting approval", body: "1,240 units moving from DC-02 to FC-01 ahead of the autumn promotion.", href: "/approvals" },
  { category: "stock", priority: "high", title: "Overstock detected in 19 SKUs", body: "Holding more than 6× reorder point, roughly $84,000 of tied-up capital.", href: "/inventory/stock-levels?view=overstock" },
  { category: "receiving", priority: "normal", title: "PO-2026-1017 was short-delivered", body: "3 of 8 lines arrived under quantity. A discrepancy note is attached.", href: "/warehousing/receiving" },
].map((seed, i) => ({
  id: id("NTF", i + 1, 3),
  ts: daysFromNow(-r.float(0, 6)),
  read: i > 4 ? r.bool(0.6) : false,
  actorId: r.bool(0.5) ? r.pick(users).id : null,
  ...seed,
})) as AppNotification[];
notifications.sort((a, b) => b.ts.localeCompare(a.ts));

/* ------------------------------------------------------------- automation */

const automationRules: AutomationRule[] = [
  { name: "Low stock alert to inventory manager", trigger: "Available quantity falls below reorder point", conditions: ["Product status is Active", "Warehouse is any"], actions: ["Notify the site inventory manager", "Add to the reorder task queue"], scope: "All warehouses" },
  { name: "Auto-draft purchase suggestion", trigger: "Available quantity falls below reorder point", conditions: ["Product has a primary supplier", "No open PO covering the shortfall"], actions: ["Create a draft purchase order line", "Group by supplier"], scope: "All warehouses" },
  { name: "Expiry warning at 30 days", trigger: "Lot expiry date is within 30 days", conditions: ["On-hand quantity is greater than 0"], actions: ["Notify the warehouse manager", "Flag the lot for quarantine review"], scope: "Harbor Cold Storage" },
  { name: "Escalate high-value adjustments", trigger: "Stock adjustment is submitted", conditions: ["Absolute value impact is over $500"], actions: ["Route to the inventory manager for approval", "Post to the audit log"], scope: "All warehouses" },
  { name: "Variance threshold breach", trigger: "Stock count moves to Review", conditions: ["Accuracy is below 97%"], actions: ["Notify the site manager", "Require a recount of variance lines"], scope: "All warehouses" },
  { name: "Notify supplier on approval", trigger: "Purchase order is approved", conditions: ["Supplier has an email contact"], actions: ["Email the purchase order to the supplier", "Set status to Ordered"], scope: "All suppliers" },
  { name: "Overdue delivery chase", trigger: "Expected delivery date passes", conditions: ["Purchase order is not fully received"], actions: ["Notify the purchasing manager", "Mark the order overdue"], scope: "All suppliers" },
  { name: "Weekly inventory report", trigger: "Every Monday at 07:00", conditions: [], actions: ["Generate the inventory valuation report", "Email it to Finance"], scope: "All warehouses" },
  { name: "Backorder on stockout", trigger: "Sales order cannot be fully reserved", conditions: ["Customer is not on credit hold"], actions: ["Set the order to Backorder", "Notify the sales manager"], scope: "All channels" },
  { name: "Auto-close received orders", trigger: "Purchase order is fully received", conditions: ["No open discrepancy notes"], actions: ["Set status to Closed", "Release the accrual to Finance"], scope: "All suppliers" },
  { name: "Quarantine failed inspections", trigger: "Goods receipt line is rejected", conditions: [], actions: ["Move the units to a quarantine location", "Open a purchase return"], scope: "All warehouses" },
  { name: "Dead stock review", trigger: "No movement for 180 days", conditions: ["On-hand value is over $250"], actions: ["Add to the dead stock report", "Notify the category owner"], scope: "All warehouses" },
].map((seed, i) => ({
  id: id("AUT", i + 1, 3),
  description: `${seed.trigger}. ${seed.actions.join(". ")}.`,
  enabled: i !== 7 && i !== 11,
  lastRunAt: r.bool(0.88) ? daysFromNow(-r.float(0, 5)) : null,
  runCount: r.int(4, 4200),
  successRate: r.round(0.86, 1, 4),
  createdBy: pickUser("super-admin"),
  ...seed,
}));

const automationRuns: AutomationRun[] = [];
{
  let n = 0;
  for (const rule of automationRules) {
    for (let i = 0; i < 6; i++) {
      n++;
      const outcome = r.weighted<AutomationRun["outcome"]>([
        ["success", 84],
        ["skipped", 11],
        ["failed", 5],
      ]);
      automationRuns.push({
        id: id("RUN", n, 4),
        ruleId: rule.id,
        ts: daysFromNow(-r.float(0, 14)),
        outcome,
        affected: outcome === "skipped" ? 0 : r.int(1, 240),
        durationMs: r.int(40, 9400),
        actorId: "system",
        message:
          outcome === "failed"
            ? "Downstream connector returned an error."
            : outcome === "skipped"
              ? "No records matched the conditions."
              : "Completed.",
      });
    }
  }
  automationRuns.sort((a, b) => b.ts.localeCompare(a.ts));
}

/* ------------------------------------------------------------------ export */

export const db = {
  users,
  roles,
  categories,
  warehouses,
  locations,
  suppliers,
  customers,
  products,
  stockRows,
  purchaseOrders,
  salesOrders,
  transfers,
  adjustments,
  stockCounts,
  returns,
  movements,
  auditEntries,
  notifications,
  automationRules,
  automationRuns,
  generatedAt: NOW.toISOString(),
};

export type Db = typeof db;
