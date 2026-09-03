/**
 * Approve and reject, end to end (ticket 11) — the join between the two halves
 * of the phase.
 *
 * The full path in one test: a purchasing manager raises a Purchase Order on
 * the form, it is submitted, the manager approves it from the Approvals queue,
 * and — because approving carries a Purchase Order to `ordered`, a receivable
 * state — the same manager books the delivery in through the existing Receive
 * tab. On-hand rises and a `purchase-receipt` Movement lands in the ledger
 * attributed to the Actor. Approving itself moves nothing: the check that no
 * Movement is appended for a decision is `npm run check:approvals`.
 *
 * The second test is the Auditor: the queue renders for a Role with read access
 * to approvals, but a Role that cannot `approve` any of the four modules is
 * offered no Approve or Reject control. The domain-level refusal for every one
 * of the four types, and the pending-status and reason guards, are
 * `npm run check:approvals` — Playwright only ever reaches the queue.
 *
 * Everything this spec creates (the order, its lines, its Events) is deleted in
 * `afterAll` and the units the receipt booked are pulled back out of the
 * put-away holding, so the read suite still sees exactly the seeded world.
 */

import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import type { BrowserContext, Page } from "@playwright/test";

import { test, expect } from "./fixtures";

/** The five users with the `purchasing-manager` Role in the fixed seed — the
 *  order and the receipt are attributed to one of them (ADR-0004). */
const PURCHASING_MANAGERS = /Fatima Al-Sayed|Petr Novák|Anjali Kapoor|Liam O'Connor|Zara Ahmed/;

const RECEIVE_QTY = 6;

let pool: Pool;

/** A supplier with a non-tracked product in its catalogue — so the Receive tab
 *  needs only a quantity and a put-away location, no lot or expiry. */
let target: { supplierName: string; productName: string; sku: string; productId: string };

async function actAs(context: BrowserContext, role: string) {
  await context.addCookies([
    { name: "stockpile-role", value: role, domain: "localhost", path: "/" },
  ]);
}

async function pickOption(page: Page, triggerId: string, name: string | RegExp) {
  await page.locator(`#${triggerId}`).click();
  await page.getByRole("option", { name }).first().click();
}

test.beforeAll(async () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  neonConfig.webSocketConstructor = ws;
  pool = new Pool({ connectionString, max: 3 });

  const { rows } = await pool.query(
    `SELECT s.name AS supplier_name, p.id AS product_id, p.name AS product_name, p.sku
       FROM products p
       JOIN suppliers s ON s.id = p.primary_supplier_id
      WHERE p.batch_tracked = false AND p.serial_tracked = false AND p.status = 'active'
        AND s.status = 'active'
        AND EXISTS (SELECT 1 FROM stock_rows sr WHERE sr.product_id = p.id AND sr.lot_number IS NULL)
      ORDER BY p.sku
      LIMIT 1`,
  );
  if (rows.length === 0) throw new Error("no active non-tracked product with a holding to target");
  target = {
    supplierName: rows[0].supplier_name,
    productName: rows[0].product_name,
    sku: rows[0].sku,
    productId: rows[0].product_id,
  };
});

test.afterAll(async () => {
  if (!pool) return;
  try {
    const { rows } = await pool.query(
      `SELECT id, warehouse_id FROM purchase_orders WHERE id ~ '^PO-[0-9A-F]{8}$'`,
    );
    for (const po of rows) {
      const { rows: moved } = await pool.query(
        `SELECT location_id, SUM(qty_change) AS booked
           FROM movements WHERE ref_id = $1 AND type = 'purchase-receipt'
          GROUP BY location_id`,
        [po.id],
      );
      for (const m of moved) {
        await pool.query(
          `UPDATE stock_rows SET on_hand = on_hand - $1
             WHERE location_id = $2 AND product_id = $3 AND lot_number IS NULL`,
          [Number(m.booked), m.location_id, target.productId],
        );
      }
      await pool.query(`DELETE FROM movements WHERE ref_id = $1`, [po.id]);
      // The append-only trigger (migration 0009) blocks this DELETE unless the
      // transaction opts in (migration 0015); SET LOCAL needs the same session.
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(`SET LOCAL stockpile.allow_events_rewind = 'on'`);
        await client.query(`DELETE FROM events WHERE payload->>'purchaseOrderId' = $1`, [po.id]);
        await client.query("COMMIT");
      } finally {
        client.release();
      }
      await pool.query(`DELETE FROM purchase_order_lines WHERE purchase_order_id = $1`, [po.id]);
      await pool.query(`DELETE FROM purchase_orders WHERE id = $1`, [po.id]);
    }
  } finally {
    await pool.end();
  }
});

test.describe("approve and reject", () => {
  test("raise a purchase order, approve it from the queue, then receive it", async ({
    page,
    context,
  }) => {
    test.slow();
    await actAs(context, "purchasing-manager");
    const main = page.locator("main");

    // --- raise -----------------------------------------------------------
    await page.goto("/purchasing/purchase-orders/new");
    await expect(main.getByRole("heading", { name: "New purchase order" })).toBeVisible();

    await pickOption(page, "supplier", target.supplierName);
    await main.getByRole("button", { name: "Add product" }).click();
    await page.getByRole("option", { name: new RegExp(target.sku) }).first().click();
    await main.getByRole("button", { name: "Create order" }).click();

    await page.waitForURL(/\/purchasing\/purchase-orders\/PO-[0-9A-F]{8}$/, { timeout: 30_000 });
    const poId = page.url().split("/").pop()!;
    const number = (await main.getByText(/^PO-\d{4}-\d{4}$/).first().innerText()).trim();
    await expect(main.getByText("Draft").first()).toBeVisible();

    // No submit flow exists yet (ticket 11 is approve/reject only); move the
    // order into the pending status a decision needs, the way the write specs
    // set up state their UI cannot reach.
    await pool.query(`UPDATE purchase_orders SET status = 'submitted' WHERE id = $1`, [poId]);

    // --- approve from the queue ----------------------------------------
    await page.goto("/approvals");
    const row = main.locator("div").filter({ hasText: number }).last();
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Approve" }).click();

    // The decided order leaves the queue, and its detail page shows it ordered
    // — far enough to receive.
    await expect(main.getByText(number)).toHaveCount(0, { timeout: 15_000 });
    await page.goto(`/purchasing/purchase-orders/${poId}`);
    await expect(main.getByText("Ordered").first()).toBeVisible();

    // --- receive against the approved order --------------------------
    const note = `e2e approve-then-receive ${Date.now()}`;
    await page.goto(`/purchasing/purchase-orders/${poId}?tab=receive`);
    await expect(main.getByRole("heading", { name: "Check in the delivery" })).toBeVisible();

    await main.locator("#recv-LN-001").fill(String(RECEIVE_QTY));
    await page.locator("#put-away").click();
    await page.getByRole("option").first().click();
    await main.locator("#receipt-note").fill(note);
    await main.getByRole("button", { name: "Confirm receipt" }).click();
    await expect(main.getByRole("button", { name: "Confirming…" })).toHaveCount(0, { timeout: 20_000 });

    await expect(main.getByRole("heading", { name: /Booked in|Fully received/ })).toBeVisible();

    // The order's line now shows the received-so-far quantity — the receipt
    // projection the incoming balance is derived from.
    await page.goto(`/purchasing/purchase-orders/${poId}?tab=lines`);
    await expect(main.locator("tbody tr").filter({ hasText: target.sku })).toContainText(
      String(RECEIVE_QTY),
    );

    // On-hand rose: a purchase-receipt Movement in the ledger, for the received
    // quantity, attributed to the deciding manager.
    await page.goto(`/inventory/movements?q=${encodeURIComponent(note)}`);
    const ledgerRow = main.locator("tbody tr").filter({ hasText: note });
    await expect(ledgerRow).toHaveCount(1);
    await expect(ledgerRow).toContainText(target.sku);
    await expect(ledgerRow).toContainText("Purchase Receipt");
    await expect(ledgerRow).toContainText(`+${RECEIVE_QTY}`);
    await expect(ledgerRow).toContainText(PURCHASING_MANAGERS);
  });

  test("an auditor sees the queue but is offered no decision", async ({ page, context }) => {
    await actAs(context, "auditor");
    const main = page.locator("main");

    await page.goto("/approvals");
    await expect(main.getByRole("heading", { name: "Approvals" })).toBeVisible();
    // The queue renders for the auditor — the read access is real — but nothing
    // in it can be actioned.
    await expect(main.getByRole("button", { name: "Approve" })).toHaveCount(0);
    await expect(main.getByRole("button", { name: "Reject" })).toHaveCount(0);
  });
});
