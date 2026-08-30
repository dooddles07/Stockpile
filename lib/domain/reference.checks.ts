/**
 * The two guarantees ticket 11 needs that Playwright cannot express.
 *
 *  1. Authorization is in the domain function, not the form (ADR-0004). A
 *     browser test always goes through a page whose render gate already hid the
 *     form, so it can only ever prove the gate. This calls `createCategory` /
 *     `updateProduct` directly, as automation or a REST caller would, and
 *     asserts the domain refuses a Role without the permission and writes
 *     nothing.
 *
 *  2. Referential integrity is the database's job, not an app-level check
 *     someone remembered to write (ticket 11). This deletes a Category that has
 *     Products and a Warehouse that holds stock and asserts the foreign-key
 *     constraint rejects both, surfaced as `ReferenceWriteError("in-use")`.
 *
 * Run with `npm run check:reference` against a migrated, seeded database; CI
 * runs it right after `check:adjustments`. Its own Pool under plain Node, same
 * as the seed and the other check scripts — `lib/db/client.ts` is `server-only`.
 */

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { Pool, neonConfig } from "@neondatabase/serverless";
import { eq, inArray, sql } from "drizzle-orm";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";

import { hydrateRoles, can } from "@/lib/auth/permissions";
import * as schema from "@/lib/db/schema";
import {
  ReferenceWriteError,
  createCategory,
  deleteCategory,
  deleteWarehouse,
  updateProduct,
} from "@/lib/domain/reference";
import type { Actor } from "@/lib/domain/stock";

type Db = NeonDatabase<typeof schema>;

async function categoryCount(db: Db): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.categories);
  return row?.n ?? 0;
}

/** A seeded user for a role, so the check runs with a real Actor shape. */
async function actorForRole(db: Db, role: string): Promise<Actor> {
  const [user] = await db
    .select({ id: schema.users.id, name: schema.users.name, role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.role, role as Actor["role"]))
    .limit(1);
  if (!user) throw new Error(`checks: no seeded user with role "${role}"`);
  return user;
}

async function forbiddenRoleIsRefused(db: Db): Promise<void> {
  const forbidden = await actorForRole(db, "auditor");
  assert.equal(
    can(forbidden.role, "categories", "create") || can(forbidden.role, "products", "edit"),
    false,
    "precondition: the chosen role must not be able to write reference data",
  );

  const before = await categoryCount(db);

  await assert.rejects(
    () =>
      createCategory(
        forbidden,
        { name: "Checks — should never persist", parentId: null, description: "direct call, no form" },
        db,
      ),
    (err: unknown) => err instanceof ReferenceWriteError && err.code === "forbidden",
    "createCategory must throw ReferenceWriteError('forbidden') for a role without categories.create",
  );

  const [someProduct] = await db.select().from(schema.products).limit(1);
  if (!someProduct) throw new Error("checks: no seeded products");
  await assert.rejects(
    () =>
      updateProduct(
        forbidden,
        someProduct.id,
        {
          sku: someProduct.sku,
          name: someProduct.name,
          categoryId: someProduct.categoryId,
          brand: someProduct.brand,
          supplierId: someProduct.primarySupplierId,
          unit: someProduct.unit,
          barcode: someProduct.barcode,
          description: someProduct.description,
          unitCost: someProduct.unitCost,
          sellPrice: someProduct.sellPrice,
          reorderPoint: someProduct.reorderPoint,
          reorderQty: someProduct.reorderQty,
          leadTimeDays: someProduct.leadTimeDays,
          batchTracked: someProduct.batchTracked,
          serialTracked: someProduct.serialTracked,
          hasExpiry: someProduct.hasExpiry,
          shelfLifeDays: someProduct.shelfLifeDays ?? 0,
        },
        db,
      ),
    (err: unknown) => err instanceof ReferenceWriteError && err.code === "forbidden",
    "updateProduct must throw ReferenceWriteError('forbidden') for a role without products.edit",
  );

  const after = await categoryCount(db);
  assert.equal(after, before, `a refused write changed the category count by ${after - before}; expected 0`);

  console.log(`  forbidden: ${forbidden.role} refused on create and edit, nothing written (${after} categories)`);
}

async function foreignKeysProtectDependents(db: Db): Promise<void> {
  const admin = await actorForRole(db, "super-admin");
  assert.equal(can(admin.role, "categories", "delete"), true, "precondition: super-admin can delete");

  // A category that has at least one product filed under it.
  const [withProducts] = await db
    .select({ id: schema.categories.id })
    .from(schema.categories)
    .where(
      inArray(
        schema.categories.id,
        db.select({ id: schema.products.categoryId }).from(schema.products),
      ),
    )
    .limit(1);
  if (!withProducts) throw new Error("checks: no category has products");

  await assert.rejects(
    () => deleteCategory(admin, withProducts.id, db),
    (err: unknown) => err instanceof ReferenceWriteError && err.code === "in-use",
    "deleteCategory must be rejected by the products.category_id foreign key",
  );
  const [stillThere] = await db
    .select({ id: schema.categories.id })
    .from(schema.categories)
    .where(eq(schema.categories.id, withProducts.id));
  assert.ok(stillThere, "the category must still exist after the rejected delete");

  // A warehouse that holds stock.
  const [withStock] = await db
    .select({ id: schema.warehouses.id })
    .from(schema.warehouses)
    .where(
      inArray(
        schema.warehouses.id,
        db.select({ id: schema.stockRows.warehouseId }).from(schema.stockRows),
      ),
    )
    .limit(1);
  if (!withStock) throw new Error("checks: no warehouse holds stock");

  await assert.rejects(
    () => deleteWarehouse(admin, withStock.id, db),
    (err: unknown) => err instanceof ReferenceWriteError && err.code === "in-use",
    "deleteWarehouse must be rejected by a foreign key (stock_rows / locations / …)",
  );

  console.log(`  foreign keys: category ${withProducts.id} and warehouse ${withStock.id} refused deletion while depended on`);
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  neonConfig.webSocketConstructor = ws;

  const pool = new Pool({ connectionString, max: 5 });
  try {
    const db = drizzle({ client: pool, schema });
    hydrateRoles(await db.select().from(schema.roles));

    console.log("reference-data checks:");
    await forbiddenRoleIsRefused(db);
    await foreignKeysProtectDependents(db);
    console.log("ok");
  } finally {
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
