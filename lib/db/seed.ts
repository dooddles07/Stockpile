/**
 * Seed script — a first-class artifact, not throwaway migration code.
 *
 * Loads the generated dataset (lib/data/store.ts, deterministic from a fixed
 * seed) into the reference and projection tables ticket 02 added. Run it with
 * `npm run db:seed` against a database that already has the migrations applied.
 *
 * Safe to re-run: it truncates the tables first, so a populated database
 * reaches the same known-good state. CI runs it before every Playwright suite,
 * and ADR-0010's daily demo reset is `import { seed }` and call it again.
 *
 * Ticket 02 loaded Categories, Warehouses, Locations, Products and Stock Rows.
 * Ticket 03 adds Suppliers, Purchase Orders and their lines, and Returns and
 * their lines. `returns` / `return_lines` hold BOTH kinds: `documents.returns()`
 * and `returnRows(kind)` are one shared function each, and the unmodified
 * Playwright suite covers the sales-returns screen too, so both kinds must load
 * now. Parallel ticket 04 (Sales & Customers) therefore does NOT create these
 * tables — it only re-points `returnRows`'s sales counterparty from
 * `reference.customers` (dataset) to a Postgres query. Everything else still
 * renders from the in-memory dataset until a later ticket moves it.
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
import {
  categories,
  locations,
  products,
  purchaseOrderLines,
  purchaseOrders,
  returnLines,
  returns,
  stockRows,
  suppliers,
  warehouses,
} from "@/lib/db/schema";

export async function seed() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  neonConfig.webSocketConstructor = ws;

  const pool = new Pool({ connectionString });
  try {
    const db = drizzle({ client: pool });

    // One statement: RESTART IDENTITY resets the generated `seq` columns so a
    // re-seed reproduces the same seq values; CASCADE covers the foreign keys
    // between the tables.
    await db.execute(
      sql`TRUNCATE TABLE ${returnLines}, ${returns}, ${purchaseOrderLines}, ${purchaseOrders}, ${suppliers}, ${stockRows}, ${products}, ${locations}, ${warehouses}, ${categories} RESTART IDENTITY CASCADE`,
    );

    // FK order: categories -> warehouses -> locations -> products -> stock_rows,
    // then suppliers -> purchase_orders -> purchase_order_lines, and
    // returns -> return_lines.
    // One multi-row INSERT per table; chunk .values() if the dataset ever
    // approaches Postgres's 65535-parameter limit (~2k product rows, or ~5k
    // order lines at 12 columns).
    await db.insert(categories).values(dataset.categories);
    await db.insert(warehouses).values(dataset.warehouses);
    await db.insert(locations).values(dataset.locations);
    await db.insert(products).values(dataset.products);
    // stock_rows.seq is generated; insert in array order so ORDER BY seq later
    // reproduces the generator's iteration order.
    await db.insert(stockRows).values(dataset.stockRows);

    await db.insert(suppliers).values(dataset.suppliers);
    // Lines are separate tables; strip the nested arrays off the parent row and
    // re-key each line to its parent. Insert in array order — `seq` is
    // generated, so ORDER BY seq reproduces the generator's order.
    await db.insert(purchaseOrders).values(dataset.purchaseOrders.map(({ lines, ...po }) => po));
    await db.insert(purchaseOrderLines).values(
      dataset.purchaseOrders.flatMap((po) =>
        po.lines.map((line) => ({ ...line, purchaseOrderId: po.id })),
      ),
    );
    await db.insert(returns).values(dataset.returns.map(({ lines, ...ret }) => ret));
    await db.insert(returnLines).values(
      dataset.returns.flatMap((ret) => ret.lines.map((line) => ({ ...line, returnId: ret.id }))),
    );

    // Fail loud if a truncate or insert silently dropped rows.
    const poLineCount = dataset.purchaseOrders.reduce((s, po) => s + po.lines.length, 0);
    const returnLineCount = dataset.returns.reduce((s, ret) => s + ret.lines.length, 0);
    const checks = [
      ["categories", categories, dataset.categories.length],
      ["warehouses", warehouses, dataset.warehouses.length],
      ["locations", locations, dataset.locations.length],
      ["products", products, dataset.products.length],
      ["stock_rows", stockRows, dataset.stockRows.length],
      ["suppliers", suppliers, dataset.suppliers.length],
      ["purchase_orders", purchaseOrders, dataset.purchaseOrders.length],
      ["purchase_order_lines", purchaseOrderLines, poLineCount],
      ["returns", returns, dataset.returns.length],
      ["return_lines", returnLines, returnLineCount],
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
