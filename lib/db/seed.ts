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
 * Ticket 06 adds the admin area — `users`, `roles`, `audit_entries`,
 * `automation_rules` and `automation_runs`; audit entries and rules key into
 * `users`, and roles carry their whole permission matrix.
 * Ticket 08 adds `notifications`, loaded last — it references nothing.
 * Ticket 15 dropped `integrations` and `tasks`: their only readers were screens
 * that could not do what they offered, deleted in the same ticket (ADR-0011).
 *
 * Its own Pool, not `lib/db/client.ts`: that module is `server-only` and this
 * runs under plain Node.
 */

import { fileURLToPath } from "node:url";

import { Pool, neonConfig } from "@neondatabase/serverless";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";

import { hydrateRoles, levelFor } from "@/lib/auth/permissions";
import { db as dataset } from "@/lib/data/store";
import { advanceDocumentNumbers } from "@/lib/db/numbers";
import { COMPANY_SETTINGS_SEED } from "@/lib/domain/settings";
import {
  adjustmentLines,
  adjustments,
  auditEntries,
  automationRules,
  automationRuns,
  categories,
  countLines,
  customers,
  events,
  locations,
  movements,
  notifications,
  products,
  purchaseOrderLines,
  purchaseOrders,
  returnLines,
  returns,
  roles,
  settings,
  salesOrderLines,
  salesOrders,
  stockCounts,
  stockRows,
  suppliers,
  transferLines,
  transfers,
  users,
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
    // between the tables. `events` is append-only in normal operation (ticket
    // 09's trigger), but TRUNCATE is the sanctioned reset — like ADR-0010's
    // daily demo reset — and every CI run starts from an empty stream.
    await db.execute(
      sql`TRUNCATE TABLE ${events}, ${settings}, ${notifications}, ${automationRuns}, ${automationRules}, ${auditEntries}, ${roles}, ${users}, ${countLines}, ${stockCounts}, ${adjustmentLines}, ${adjustments}, ${movements}, ${transferLines}, ${transfers}, ${salesOrderLines}, ${salesOrders}, ${customers}, ${returnLines}, ${returns}, ${purchaseOrderLines}, ${purchaseOrders}, ${suppliers}, ${stockRows}, ${products}, ${locations}, ${warehouses}, ${categories} RESTART IDENTITY CASCADE`,
    );

    // FK order: roles -> users (warehouseId null) -> categories -> warehouses
    // -> locations -> products -> stock_rows, then back-fill users.warehouseId.
    // Circular FK: warehouses.managerId -> users, users.warehouseId -> warehouses.
    // One multi-row INSERT per table; chunk .values() if the dataset ever
    // approaches Postgres's 65535-parameter limit (~2k product rows, or ~5k
    // order lines at 12 columns).
    await db.insert(roles).values(dataset.roles);
    await db.insert(users).values(
      dataset.users.map(({ warehouseId: _, ...u }) => ({ ...u, warehouseId: null })),
    );
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

    // Movements, Adjustments and Stock Counts (ticket 07). Movements is one flat
    // table inserted newest-first so ORDER BY seq reproduces the ledger order;
    // Adjustments and Counts split their lines off the parent like the order
    // tables above. They reference only products, warehouses and locations.
    // ~3,400 rows × 17 columns is close to Postgres's 65,535-parameter ceiling,
    // so this one insert is chunked where the others are not.
    for (let i = 0; i < dataset.movements.length; i += 2000) {
      await db.insert(movements).values(dataset.movements.slice(i, i + 2000));
    }
    await db.insert(adjustments).values(dataset.adjustments.map(({ lines, ...adj }) => adj));
    await db.insert(adjustmentLines).values(
      dataset.adjustments.flatMap((adj) =>
        adj.lines.map((line) => ({ ...line, adjustmentId: adj.id })),
      ),
    );
    await db.insert(stockCounts).values(dataset.stockCounts.map(({ lines, ...cnt }) => cnt));
    await db.insert(countLines).values(
      dataset.stockCounts.flatMap((cnt) =>
        cnt.lines.map((line) => ({ ...line, stockCountId: cnt.id })),
      ),
    );

    // Back-fill users.warehouseId now that warehouses exist (circular FK).
    for (const u of dataset.users) {
      if (u.warehouseId) {
        await db.update(users).set({ warehouseId: u.warehouseId }).where(eq(users.id, u.id));
      }
    }

    // Admin area: audit entries and automation rules key into users (already
    // inserted above). audit_entries / automation_runs carry a generated `seq`
    // and the dataset arrays are already sorted newest-first, so insert in
    // array order and ORDER BY seq reproduces it.
    await db.insert(auditEntries).values(dataset.auditEntries);
    await db.insert(automationRules).values(dataset.automationRules);
    await db.insert(automationRuns).values(dataset.automationRuns);

    // Notifications (ticket 08). Flat list, `seq` generated — insert in array
    // order so ORDER BY seq reproduces the generator's order (newest-first).
    await db.insert(notifications).values(dataset.notifications);

    // Company settings (ticket 16). One row, a fixed id; the app updates it in
    // place and this reseed restores it. Not in the generated dataset — it is a
    // single known constant, not generated data.
    await db.insert(settings).values(COMPANY_SETTINGS_SEED);

    // Ticket 05: every Document number sequence is advanced past the highest
    // number just loaded, so the first Document a visitor creates continues the
    // seeded series instead of colliding with it. On every run — the daily
    // reset re-loads the same numbers, and TRUNCATE does not touch a sequence.
    await advanceDocumentNumbers(db);

    // The permission engine reads these rows in the app; prove a round trip
    // through Postgres reproduces the matrix before the Playwright suite bets
    // on it. super-admin is `manage` everywhere; auditor cannot write anywhere.
    const roleRows = await db.select().from(roles);
    hydrateRoles(roleRows);
    if (levelFor("super-admin", "settings") !== "manage") {
      throw new Error("seed: roles round trip lost super-admin access");
    }
    if (levelFor("auditor", "users") !== "read" || levelFor("warehouse-staff", "users") !== "none") {
      throw new Error("seed: roles round trip changed the permission matrix");
    }

    // Fail loud if a truncate or insert silently dropped rows.
    const poLineCount = dataset.purchaseOrders.reduce((s, po) => s + po.lines.length, 0);
    const returnLineCount = dataset.returns.reduce((s, ret) => s + ret.lines.length, 0);
    const soLineCount = dataset.salesOrders.reduce((s, so) => s + so.lines.length, 0);
    const transferLineCount = dataset.transfers.reduce((s, tr) => s + tr.lines.length, 0);
    const adjustmentLineCount = dataset.adjustments.reduce((s, a) => s + a.lines.length, 0);
    const countLineCount = dataset.stockCounts.reduce((s, c) => s + c.lines.length, 0);
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
      ["movements", movements, dataset.movements.length],
      ["adjustments", adjustments, dataset.adjustments.length],
      ["adjustment_lines", adjustmentLines, adjustmentLineCount],
      ["stock_counts", stockCounts, dataset.stockCounts.length],
      ["count_lines", countLines, countLineCount],
      ["users", users, dataset.users.length],
      ["roles", roles, dataset.roles.length],
      ["audit_entries", auditEntries, dataset.auditEntries.length],
      ["automation_rules", automationRules, dataset.automationRules.length],
      ["automation_runs", automationRuns, dataset.automationRuns.length],
      ["notifications", notifications, dataset.notifications.length],
      ["settings", settings, 1],
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
