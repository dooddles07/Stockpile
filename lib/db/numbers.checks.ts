/**
 * The guarantees ticket 05 rests on, which Playwright cannot express.
 *
 *  1. Every seeded series continues rather than collides. After a seed run,
 *     `allocateDocumentNumber` for each Document type returns a number in the
 *     seeded shape whose counter is above every seeded one — the failure this
 *     ticket exists to prevent is a visitor's first creation duplicating a
 *     seeded number and hitting the new unique index on screen.
 *
 *  2. Two concurrent allocations of the same type return two different numbers.
 *     ADR-0010 puts every visitor on one shared account, so simultaneous
 *     creation is the normal case; this opens two transactions at once, holds
 *     both open across the allocation, and asserts the numbers differ.
 *
 *  3. A rolled-back creation leaves no Document and does not reuse its number.
 *     `nextval` deliberately does not roll back: the burned number is correct
 *     behaviour, and the next allocation must move past it rather than hand it
 *     out again.
 *
 * Run with `npm run check:numbers` against a migrated, seeded database. Its own
 * Pool under plain Node, same as the seed and the other check scripts —
 * `lib/db/client.ts` is `server-only`. It burns a handful of Document numbers
 * and writes no rows, so the database it leaves behind is the seeded one.
 */

import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { Pool, neonConfig } from "@neondatabase/serverless";
import { eq } from "drizzle-orm";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";

import {
  allocateDocumentNumber,
  counterOf,
  documentNumbers,
  highestNumber,
  NUMBER_YEAR,
  type DocumentNumberType,
} from "@/lib/db/numbers";
import * as schema from "@/lib/db/schema";

type Db = NeonDatabase<typeof schema>;

/** Rolls its transaction back, carrying the number it burned out with it. */
class RolledBack extends Error {
  constructor(readonly number: string) {
    super(`rolled back ${number}`);
  }
}

/** 1. Each type's next number is in the seeded shape and past the seeded max. */
async function continuesEachSeededSeries(db: Db): Promise<void> {
  for (const type of Object.keys(documentNumbers) as DocumentNumberType[]) {
    const spec = documentNumbers[type];
    const max = await highestNumber(db, type);
    const number = await allocateDocumentNumber(db, type);
    assert.match(
      number,
      new RegExp(`^${spec.prefix}-${NUMBER_YEAR}-[0-9]{${spec.pad},}$`),
      `${type}: "${number}" is not the seeded number shape`,
    );
    assert.ok(
      counterOf(number) > max,
      `${type}: allocated ${number}, but the seed already loaded counter ${max}`,
    );
  }
}

/**
 * 2. Two allocations that overlap in time get two different numbers. Each
 * transaction waits for the other to have allocated before it returns, so the
 * two genuinely overlap rather than running one after the other.
 */
async function concurrentAllocationsDiffer(db: Db): Promise<[string, string]> {
  let allocated = 0;
  const bothAllocated = Promise.withResolvers<void>();
  const allocate = async (): Promise<string> =>
    db.transaction(async (tx) => {
      const number = await allocateDocumentNumber(tx, "purchaseOrder");
      if (++allocated === 2) bothAllocated.resolve();
      await bothAllocated.promise;
      return number;
    });

  const [first, second] = await Promise.all([allocate(), allocate()]);
  assert.notEqual(first, second, `concurrent allocations both returned ${first}`);
  return [first, second];
}

/**
 * 3. A creation that rolls back leaves no Document, and its number is burned
 * rather than handed to the next caller.
 */
async function rollbackBurnsItsNumber(db: Db): Promise<[string, string]> {
  const [warehouse] = await db.select().from(schema.warehouses).limit(1);
  assert.ok(warehouse, "checks: no seeded warehouse");

  const burned = await db
    .transaction(async (tx) => {
      const number = await allocateDocumentNumber(tx, "adjustment");
      await tx.insert(schema.adjustments).values({
        id: `ADJ-CHECK-${number}`,
        number,
        warehouseId: warehouse.id,
        reason: "manual-correction",
        status: "draft",
        createdAt: new Date().toISOString(),
        totalDelta: 0,
        totalValueImpact: 0,
        createdBy: "check:numbers",
        approvals: [],
        note: "rollback check",
        requiresApproval: false,
      });
      throw new RolledBack(number);
    })
    .catch((err: unknown) => {
      if (err instanceof RolledBack) return err.number;
      throw err;
    });

  const survivors = await db
    .select()
    .from(schema.adjustments)
    .where(eq(schema.adjustments.number, burned));
  assert.equal(survivors.length, 0, `the rolled-back adjustment ${burned} was committed`);

  const next = await allocateDocumentNumber(db, "adjustment");
  assert.notEqual(next, burned, `${burned} was handed out again after its rollback`);
  assert.ok(counterOf(next) > counterOf(burned), `${next} did not move past the burned ${burned}`);
  return [burned, next];
}

async function run(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  neonConfig.webSocketConstructor = ws;

  const pool = new Pool({ connectionString });
  try {
    const db = drizzle({ client: pool, schema });

    await continuesEachSeededSeries(db);
    const [first, second] = await concurrentAllocationsDiffer(db);
    const [burned, next] = await rollbackBurnsItsNumber(db);

    console.log("check:numbers ok", { first, second, burned, next });
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  run()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
