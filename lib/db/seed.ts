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
 * Ticket 03 added Suppliers, Purchase Orders and their lines, and Returns and
 * their lines — `returns` / `return_lines` hold BOTH kinds, since
 * `documents.returns()` and `returnRows(kind)` are one shared function each.
 * Ticket 04 adds Customers, Sales Orders and their lines; once `reference.customers`
 * reads Postgres, `returnRows`'s sales counterparty follows with no change there.
 * Ticket 05 adds Transfers and their lines (`transfers` / `transfer_lines`),
 * loaded after the sales area — they reference only warehouses, products and
 * locations, all seeded earlier.
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
import {
  categories,
  customers,
  locations,
  products,
  purchaseOrderLines,
  purchaseOrders,
  returnLines,
  returns,
  salesOrderLines,
  salesOrders,
  stockRows,
  suppliers,
  transferLines,
  transfers,
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
      sql`TRUNCATE TABLE ${transferLines}, ${transfers}, ${salesOrderLines}, ${salesOrders}, ${customers}, ${returnLines}, ${returns}, ${purchaseOrderLines}, ${purchaseOrders}, ${suppliers}, ${stockRows}, ${products}, ${locations}, ${warehouses}, ${categories} RESTART IDENTITY CASCADE`,
    );

    // FK order: categories -> warehouses -> locations -> products -> stock_rows,
    // then suppliers -> purchase_orders -> purchase_order_lines,
    // returns -> return_lines, and customers -> sales_orders -> sales_order_lines.
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

    await db.insert(customers).values(dataset.customers);
    await db.insert(salesOrders).values(dataset.salesOrders.map(({ lines, ...so }) => so));
    await db.insert(salesOrderLines).values(
      dataset.salesOrders.flatMap((so) => so.lines.map((line) => ({ ...line, salesOrderId: so.id }))),
    );

    await db.insert(transfers).values(dataset.transfers.map(({ lines, ...tr }) => tr));
    await db.insert(transferLines).values(
      dataset.transfers.flatMap((tr) => tr.lines.map((line) => ({ ...line, transferId: tr.id }))),
    );

    // Fail loud if a truncate or insert silently dropped rows.
    const poLineCount = dataset.purchaseOrders.reduce((s, po) => s + po.lines.length, 0);
    const returnLineCount = dataset.returns.reduce((s, ret) => s + ret.lines.length, 0);
    const soLineCount = dataset.salesOrders.reduce((s, so) => s + so.lines.length, 0);
    const transferLineCount = dataset.transfers.reduce((s, tr) => s + tr.lines.length, 0);
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
      ["customers", customers, dataset.customers.length],
      ["sales_orders", salesOrders, dataset.salesOrders.length],
      ["sales_order_lines", salesOrderLines, soLineCount],
      ["transfers", transfers, dataset.transfers.length],
      ["transfer_lines", transferLines, transferLineCount],
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
