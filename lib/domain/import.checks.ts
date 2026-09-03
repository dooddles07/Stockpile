/**
 * The guarantees ticket 14 needs that Playwright cannot express.
 *
 *  1. Authorization is in the domain function, not the wizard's page gate
 *     (ADR-0004). A browser test always goes through a page whose render gate
 *     already hid the kind, so it can only prove the gate. This calls
 *     `importRows` directly, as a REST caller or automation would, and asserts
 *     the domain refuses a Role without the kind's permission and writes
 *     nothing — for a reference kind and for opening stock.
 *
 *  2. A file is one transaction: a failure on any row imports nothing. This
 *     hands `importRows` a products file whose last row names a category that
 *     does not exist, and a stock file whose last row names an unknown SKU, and
 *     asserts that in both cases the earlier, valid rows leave no product, no
 *     Stock Row balance change and no Event behind.
 *
 * Run with `npm run check:import` against a migrated, seeded database; CI runs
 * it after `check:notifications`. Its own Pool under plain Node, same as the
 * seed and the other check scripts. Every mutation it attempts is meant to roll
 * back; a defensive `DELETE` of its throwaway SKUs runs regardless.
 */

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { Pool, neonConfig } from "@neondatabase/serverless";
import { and, eq, isNull, sql } from "drizzle-orm";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";

import { hydrateRoles, can } from "@/lib/auth/permissions";
import * as schema from "@/lib/db/schema";
import { ImportError, importRows } from "@/lib/domain/import";
import type { Actor } from "@/lib/domain/stock";

type Db = NeonDatabase<typeof schema>;

const SKU_PREFIX = "CHK-IMP-";

async function productCount(db: Db): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.products);
  return row?.n ?? 0;
}

async function eventCount(db: Db): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.events);
  return row?.n ?? 0;
}

async function actorForRole(db: Db, role: string): Promise<Actor> {
  const [user] = await db
    .select({ id: schema.users.id, name: schema.users.name, role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.role, role as Actor["role"]))
    .limit(1);
  if (!user) throw new Error(`checks: no seeded user with role "${role}"`);
  return user;
}

async function seededCategoryName(db: Db): Promise<string> {
  const [row] = await db.select({ name: schema.categories.name }).from(schema.categories).limit(1);
  if (!row) throw new Error("checks: no seeded categories");
  return row.name;
}

interface Holding {
  sku: string;
  warehouseCode: string;
  binCode: string;
  productId: string;
  warehouseId: string;
  locationId: string;
  onHand: number;
}

async function seededHolding(db: Db): Promise<Holding> {
  const [row] = await db
    .select({
      sku: schema.products.sku,
      warehouseCode: schema.warehouses.code,
      binCode: schema.locations.code,
      productId: schema.stockRows.productId,
      warehouseId: schema.stockRows.warehouseId,
      locationId: schema.stockRows.locationId,
      onHand: schema.stockRows.onHand,
    })
    .from(schema.stockRows)
    .innerJoin(schema.products, eq(schema.products.id, schema.stockRows.productId))
    .innerJoin(schema.warehouses, eq(schema.warehouses.id, schema.stockRows.warehouseId))
    .innerJoin(schema.locations, eq(schema.locations.id, schema.stockRows.locationId))
    .where(and(isNull(schema.stockRows.lotNumber), sql`${schema.stockRows.onHand} >= 5`))
    .limit(1);
  if (!row) throw new Error("checks: no un-lotted holding with stock to spare");
  return row;
}

async function onHandOf(db: Db, h: Holding): Promise<number> {
  const [row] = await db
    .select({ onHand: schema.stockRows.onHand })
    .from(schema.stockRows)
    .where(
      and(
        eq(schema.stockRows.productId, h.productId),
        eq(schema.stockRows.warehouseId, h.warehouseId),
        eq(schema.stockRows.locationId, h.locationId),
        isNull(schema.stockRows.lotNumber),
      ),
    );
  return row?.onHand ?? 0;
}

async function forbiddenRoleIsRefused(db: Db): Promise<void> {
  const forbidden = await actorForRole(db, "auditor");
  assert.equal(
    can(forbidden.role, "products", "create") || can(forbidden.role, "stock", "edit"),
    false,
    "precondition: the chosen role must be able to import neither products nor stock",
  );

  const category = await seededCategoryName(db);
  const holding = await seededHolding(db);

  const productsBefore = await productCount(db);
  const eventsBefore = await eventCount(db);

  await assert.rejects(
    () =>
      importRows(
        forbidden,
        "products",
        [{ sku: `${SKU_PREFIX}FORBID-1`, name: "Should never persist", category, unitCost: "5" }],
        db,
      ),
    (err: unknown) => err instanceof ImportError && err.code === "forbidden",
    "importRows(products) must throw ImportError('forbidden') for a role without products.create",
  );

  await assert.rejects(
    () =>
      importRows(
        forbidden,
        "stock",
        [
          {
            sku: holding.sku,
            warehouse: holding.warehouseCode,
            location: holding.binCode,
            quantity: String(holding.onHand + 3),
          },
        ],
        db,
      ),
    (err: unknown) => err instanceof ImportError && err.code === "forbidden",
    "importRows(stock) must throw ImportError('forbidden') for a role without stock.edit",
  );

  assert.equal(await productCount(db), productsBefore, "a refused import created a product");
  assert.equal(await eventCount(db), eventsBefore, "a refused import appended an Event");
  console.log(`  forbidden: ${forbidden.role} refused on products and stock, nothing written`);
}

async function lastRowInvalidLeavesFileUnwritten(db: Db): Promise<void> {
  const importer = await actorForRole(db, "super-admin");
  assert.equal(can(importer.role, "products", "create"), true, "precondition: importer can create products");
  assert.equal(can(importer.role, "stock", "edit"), true, "precondition: importer can edit stock");

  const category = await seededCategoryName(db);
  const holding = await seededHolding(db);

  // --- products: two clean rows, then a row naming a category that is not on file.
  const productsBefore = await productCount(db);
  await assert.rejects(
    () =>
      importRows(
        importer,
        "products",
        [
          { sku: `${SKU_PREFIX}A`, name: "Clean one", category, unitCost: "10" },
          { sku: `${SKU_PREFIX}B`, name: "Clean two", category, unitCost: "12" },
          { sku: `${SKU_PREFIX}C`, name: "Bad category", category: "No Such Category Exists", unitCost: "9" },
        ],
        db,
      ),
    (err: unknown) => err instanceof ImportError && err.code === "not-found",
    "importRows(products) must reject the file when its last row cannot be resolved",
  );
  assert.equal(
    await productCount(db),
    productsBefore,
    "the two clean product rows must not survive a file that fails on its last row",
  );
  const [leaked] = await db
    .select({ sku: schema.products.sku })
    .from(schema.products)
    .where(sql`${schema.products.sku} like ${`${SKU_PREFIX}%`}`);
  assert.equal(leaked, undefined, `a rolled-back import left product ${leaked?.sku ?? ""}`);

  // --- products again: a last row that repeats an on-file SKU. The reference
  // function's `conflict` is re-framed as ImportError, and the file still
  // writes nothing (the routine re-import path).
  await assert.rejects(
    () =>
      importRows(
        importer,
        "products",
        [
          { sku: `${SKU_PREFIX}D`, name: "Clean three", category, unitCost: "10" },
          { sku: holding.sku, name: "Duplicate of a seeded SKU", category, unitCost: "11" },
        ],
        db,
      ),
    (err: unknown) => err instanceof ImportError && err.code === "invalid",
    "importRows(products) must re-frame a reference conflict as ImportError and write nothing",
  );
  assert.equal(await productCount(db), productsBefore, "a file failing on a duplicate SKU wrote a product");

  // --- opening stock: one real correction, then a row naming an unknown SKU.
  const eventsBefore = await eventCount(db);
  const onHandBefore = await onHandOf(db, holding);
  await assert.rejects(
    () =>
      importRows(
        importer,
        "stock",
        [
          {
            sku: holding.sku,
            warehouse: holding.warehouseCode,
            location: holding.binCode,
            quantity: String(holding.onHand + 5),
          },
          {
            sku: `${SKU_PREFIX}NOT-A-SKU`,
            warehouse: holding.warehouseCode,
            location: holding.binCode,
            quantity: "1",
          },
        ],
        db,
      ),
    (err: unknown) => err instanceof ImportError && err.code === "not-found",
    "importRows(stock) must reject the file when its last row's SKU is unknown",
  );
  assert.equal(await onHandOf(db, holding), onHandBefore, "the first row's correction rolled back");
  assert.equal(await eventCount(db), eventsBefore, "no Event survived the failed stock import");

  console.log(
    "  atomic: products (bad category, duplicate SKU) and stock (unknown SKU) files each failing wrote nothing",
  );
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  neonConfig.webSocketConstructor = ws;

  const pool = new Pool({ connectionString, max: 5 });
  try {
    const db = drizzle({ client: pool, schema });
    hydrateRoles(await db.select().from(schema.roles));

    console.log("import checks:");
    await forbiddenRoleIsRefused(db);
    await lastRowInvalidLeavesFileUnwritten(db);
    console.log("ok");
  } finally {
    await pool.query(`DELETE FROM products WHERE sku LIKE '${SKU_PREFIX}%'`);
    await pool.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
