/**
 * The two guarantees ticket 06 needs that Playwright cannot express.
 *
 * The e2e suite proves a purchasing manager raises an order and finds it on its
 * detail page, and that a Role without `purchase-orders.create` never sees the
 * form. But ADR-0004 puts the real check in the domain function, not the UI, and
 * a browser test always goes through the form — so the direct refusal lives
 * here. So does atomicity: a creation that fails partway must leave no order, no
 * lines and no Event, and the browser has no way to fail a creation halfway
 * through.
 *
 * Run with `npm run check:purchasing` against a migrated, seeded database. Its
 * own Pool under plain Node, same as the seed and the other check scripts —
 * `lib/db/client.ts` is `server-only`.
 */

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { Pool, neonConfig } from "@neondatabase/serverless";
import { eq, sql } from "drizzle-orm";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";

import { hydrateRoles, can } from "@/lib/auth/permissions";
import * as schema from "@/lib/db/schema";
import { PurchaseOrderError, createPurchaseOrder } from "@/lib/domain/purchasing";
import type { Actor } from "@/lib/domain/stock";

type Db = NeonDatabase<typeof schema>;

/** Row counts of everything a creation writes, as one snapshot to compare. */
async function counts(db: Db): Promise<{ events: number; orders: number; lines: number }> {
  const [[events], [orders], [lines]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(schema.events),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.purchaseOrders),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.purchaseOrderLines),
  ]);
  return { events: events.n, orders: orders.n, lines: lines.n };
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

/** A supplier, a warehouse and a product any order in these checks can use. */
async function orderable(db: Db) {
  const [supplier] = await db.select().from(schema.suppliers).limit(1);
  const [warehouse] = await db.select().from(schema.warehouses).limit(1);
  const [product] = await db.select().from(schema.products).limit(1);
  if (!supplier || !warehouse || !product) throw new Error("checks: seed is missing reference data");
  return {
    supplierId: supplier.id,
    warehouseId: warehouse.id,
    shipping: 0,
    notes: "purchasing checks",
    lines: [{ productId: product.id, quantity: 3, unitPrice: 10, discountPct: 0, taxPct: 0 }],
  };
}

async function forbiddenIsRefusedAndWritesNothing(db: Db): Promise<void> {
  // Warehouse Staff read purchase orders; raising one is a purchasing job.
  const forbidden = await actorForRole(db, "warehouse-staff");
  assert.equal(
    can(forbidden.role, "purchase-orders", "create"),
    false,
    "precondition: the chosen role must not be able to create purchase orders",
  );

  const input = await orderable(db);
  const before = await counts(db);

  await assert.rejects(
    () => createPurchaseOrder(forbidden, input, db),
    (err: unknown) => err instanceof PurchaseOrderError && err.code === "forbidden",
    "createPurchaseOrder must throw PurchaseOrderError('forbidden') for a role without purchase-orders.create",
  );

  assert.deepEqual(
    await counts(db),
    before,
    "a refused creation wrote an order, a line or an event; expected none",
  );
  console.log(`  forbidden: ${forbidden.role} refused directly, nothing written`);
}

async function failedCreationLeavesNothing(db: Db): Promise<void> {
  const actor = await actorForRole(db, "purchasing-manager");
  assert.equal(
    can(actor.role, "purchase-orders", "create"),
    true,
    "precondition: the chosen role must be able to create purchase orders",
  );

  // Permitted, well-formed, and doomed: the warehouse does not exist, so the
  // foreign key rejects the order row — after the number is allocated and the
  // Event is appended. Everything but the burned number must roll back.
  const input = { ...(await orderable(db)), warehouseId: "WH-NO-SUCH-SITE" };
  const before = await counts(db);

  await assert.rejects(
    () => createPurchaseOrder(actor, input, db),
    "a creation against an unknown warehouse must fail",
  );

  assert.deepEqual(
    await counts(db),
    before,
    "a creation that failed partway left an order, a line or an event behind",
  );
  console.log("  atomic: a creation failing after the Event left no order, no lines, no event");
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  neonConfig.webSocketConstructor = ws;

  const pool = new Pool({ connectionString, max: 5 });
  try {
    const db = drizzle({ client: pool, schema });
    hydrateRoles(await db.select().from(schema.roles));

    console.log("purchase order checks:");
    await forbiddenIsRefusedAndWritesNothing(db);
    await failedCreationLeavesNothing(db);
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
