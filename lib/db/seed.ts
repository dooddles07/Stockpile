/**
 * Seed script — a first-class artifact, not throwaway migration code.
 *
 * Loads the generated dataset (lib/data/store.ts, deterministic from a fixed
 * seed) into the reference and projection tables ticket 02 added. Run it with
 * `npm run db:seed` against a database that already has the migrations applied.
 *
 * Safe to re-run: it truncates the five tables first, so a populated database
 * reaches the same known-good state. CI runs it before every Playwright suite,
 * and ADR-0010's daily demo reset is `import { seed }` and call it again.
 *
 * It only touches Categories, Warehouses, Locations, Products and Stock Rows.
 * Everything else still renders from the in-memory dataset until a later ticket
 * moves it.
 *
 * Its own Pool, not `lib/db/client.ts`: that module is `server-only` and this
 * runs under plain Node.
 */

import { fileURLToPath } from "node:url";

import { Pool, neonConfig } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";

import { db as dataset } from "@/lib/data/store";
import { categories, locations, products, stockRows, warehouses } from "@/lib/db/schema";

export async function seed() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  neonConfig.webSocketConstructor = ws;

  const pool = new Pool({ connectionString });
  try {
    const db = drizzle({ client: pool });

    // One statement: RESTART IDENTITY resets stock_rows.seq so a re-seed
    // reproduces the same seq values; CASCADE covers the foreign keys between
    // the five tables.
    await db.execute(
      sql`TRUNCATE TABLE ${stockRows}, ${products}, ${locations}, ${warehouses}, ${categories} RESTART IDENTITY CASCADE`,
    );

    // FK order: categories -> warehouses -> locations -> products -> stock_rows.
    // ponytail: one multi-row INSERT per table; chunk .values() if the dataset
    // ever approaches Postgres's 65535-parameter limit (~2k product rows).
    await db.insert(categories).values(dataset.categories);
    await db.insert(warehouses).values(dataset.warehouses);
    await db.insert(locations).values(dataset.locations);
    await db.insert(products).values(dataset.products);
    // stock_rows.seq is generated; insert in array order so ORDER BY seq later
    // reproduces the generator's iteration order.
    await db.insert(stockRows).values(dataset.stockRows);

    // Fail loud if a truncate or insert silently dropped rows.
    const checks = [
      ["categories", categories, dataset.categories.length],
      ["warehouses", warehouses, dataset.warehouses.length],
      ["locations", locations, dataset.locations.length],
      ["products", products, dataset.products.length],
      ["stock_rows", stockRows, dataset.stockRows.length],
    ] as const;
    const counts: Record<string, number> = {};
    for (const [name, table, expected] of checks) {
      const n = await db.$count(table);
      if (n !== expected) throw new Error(`seed: ${name} has ${n} rows, expected ${expected}`);
      counts[name] = n;
    }

    return counts;
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  seed()
    .then((counts) => {
      console.log("seeded", counts);
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
