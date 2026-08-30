/**
 * The one guarantee ticket 10 needs that Playwright cannot express.
 *
 * The e2e suite proves a permitted operator records an adjustment and a
 * forbidden one is stopped at the page's render gate. But ADR-0004 puts the
 * real check in the domain function, not the UI: "a user whose Role forbids the
 * action is refused even when reaching it directly". A browser test always goes
 * through the form, so it can only ever exercise the render gate. This calls
 * `recordAdjustment` directly, as automation or a future REST caller would, and
 * asserts the choke point refuses it and writes nothing.
 *
 * Run with `npm run check:adjustments` against a migrated, seeded database; CI
 * runs it right after `check:stock`. Its own Pool under plain Node, same as the
 * seed and `stock.checks.ts` — `lib/db/client.ts` is `server-only`.
 */

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { Pool, neonConfig } from "@neondatabase/serverless";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";

import { hydrateRoles, can } from "@/lib/auth/permissions";
import * as schema from "@/lib/db/schema";
import { recordAdjustment } from "@/lib/domain/adjustments";
import { StockChangeError, type Actor } from "@/lib/domain/stock";

type Db = NeonDatabase<typeof schema>;

async function eventCount(db: Db): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.events);
  return row?.n ?? 0;
}

/** A seeded actor whose Role cannot create adjustments, and one who can. */
async function actorForRole(db: Db, role: string): Promise<Actor> {
  const [user] = await db
    .select({ id: schema.users.id, name: schema.users.name, role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.role, role as Actor["role"]))
    .limit(1);
  if (!user) throw new Error(`checks: no seeded user with role "${role}"`);
  return user;
}

async function pickHolding(db: Db) {
  const [row] = await db
    .select()
    .from(schema.stockRows)
    .where(and(isNull(schema.stockRows.lotNumber), gt(schema.stockRows.onHand, 5)))
    .orderBy(schema.stockRows.seq)
    .limit(1);
  if (!row) throw new Error("checks: no un-lotted holding with on-hand > 5");
  return row;
}

async function forbiddenIsRefusedAndWritesNothing(db: Db): Promise<void> {
  // A role that can view adjustments but not create them (seed: Auditor is
  // read-export across the transaction record).
  const forbidden = await actorForRole(db, "auditor");
  assert.equal(
    can(forbidden.role, "adjustments", "create"),
    false,
    "precondition: the chosen role must not be able to create adjustments",
  );

  const row = await pickHolding(db);
  const before = await eventCount(db);

  await assert.rejects(
    () =>
      recordAdjustment(
        forbidden,
        {
          productId: row.productId,
          warehouseId: row.warehouseId,
          locationId: row.locationId,
          lotNumber: null,
          reason: "count-error",
          quantityDelta: -1,
          note: "direct call, no form",
        },
        db,
      ),
    (err: unknown) =>
      err instanceof StockChangeError && err.code === "forbidden",
    "recordAdjustment must throw StockChangeError('forbidden') for a role without adjustments.create",
  );

  const after = await eventCount(db);
  assert.equal(after, before, `a refused adjustment appended ${after - before} event(s); expected 0`);

  console.log(`  forbidden: ${forbidden.role} refused directly, event stream unchanged (${after})`);
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  neonConfig.webSocketConstructor = ws;

  const pool = new Pool({ connectionString, max: 5 });
  try {
    const db = drizzle({ client: pool, schema });
    hydrateRoles(await db.select().from(schema.roles));

    console.log("adjustment checks:");
    await forbiddenIsRefusedAndWritesNothing(db);
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
