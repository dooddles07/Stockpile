/**
 * Advancing a Sales Order from the picking queue (ticket 12, spec story 22).
 *
 * The queue at `/warehousing/picking` lists orders in `reserved` and `picking`.
 * A `reserved` row's "Start pick" button is a single `advanceSalesOrder` step —
 * `reserved -> picking` — made from the queue itself, not the order detail
 * page. After it the row re-renders in place as `picking` with a "Continue"
 * link to the walk sheet.
 *
 * The domain-level guards (a forbidden Role refused, an order not in `reserved`
 * refused) are `npm run check:fulfilment`; this spec only drives the queue.
 *
 * The order is wound back to `reserved` in `afterAll` so the read suite still
 * sees the seeded world (CI reseeds every run; this keeps a persistent local
 * branch stable).
 */

import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import type { BrowserContext } from "@playwright/test";

import { test, expect } from "./fixtures";

/** Orders other write specs wind through `reserved`; leave them alone. */
const RESERVED_BY_OTHER_SPECS = ["SO-0265", "SO-0006", "SO-0031"];

let pool: Pool;
let order: { id: string; number: string };

async function actAs(context: BrowserContext, role: string) {
  await context.addCookies([
    { name: "stockpile-role", value: role, domain: "localhost", path: "/" },
  ]);
}

test.beforeAll(async () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  neonConfig.webSocketConstructor = ws;
  pool = new Pool({ connectionString, max: 2 });

  const { rows } = await pool.query(
    `SELECT id, number FROM sales_orders
      WHERE status = 'reserved' AND id <> ALL($1::text[])
      ORDER BY id LIMIT 1`,
    [RESERVED_BY_OTHER_SPECS],
  );
  if (rows.length === 0) throw new Error("no seeded sales order in 'reserved' to pick from the queue");
  order = { id: rows[0].id, number: rows[0].number };
});

test.afterAll(async () => {
  if (!pool) return;
  try {
    await pool.query(`UPDATE sales_orders SET status = 'reserved' WHERE id = $1`, [order.id]);
  } finally {
    await pool.end();
  }
});

test("a reserved order is advanced to picking from the queue", async ({ page, context, main }) => {
  test.slow();
  await actAs(context, "warehouse-staff");

  await page.goto("/warehousing/picking");
  await expect(main.getByRole("heading", { name: "Picking" })).toBeVisible();

  const row = main.locator("tbody tr").filter({ hasText: order.number });
  await expect(row).toContainText("Reserved");

  await row.getByRole("button", { name: "Start pick" }).click();

  // The action revalidates the queue, so the row re-renders as picking with the
  // "Start pick" control gone.
  await expect(row).toContainText("Picking", { timeout: 15_000 });
  await expect(row.getByRole("button", { name: "Start pick" })).toHaveCount(0);

  // And it stuck: the order detail shows Picking on a fresh load.
  await page.goto(`/sales/orders/${order.id}`);
  await expect(main.getByText("Picking").first()).toBeVisible();
});
