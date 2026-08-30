/**
 * Goods receipt against a Purchase Order, end to end (ticket 12) — the first
 * write flow where two balances move in opposite directions for one action and
 * a Document advances as a consequence.
 *
 * Covers the three behaviours the ticket names: a partial receipt (on-hand
 * rises by what arrived, the order stays open and partially received, the
 * outstanding — the incoming balance derived from the open order — falls by the
 * same amount), a completing receipt (the remainder arrives and the order
 * closes), and a permission refusal (a Role without `receiving` never sees the
 * Receive tab). The "refused even when reaching the domain function directly"
 * half of the permission criterion, and the over-receipt decision, are
 * `npm run check:receiving`, since Playwright can only ever reach the form.
 *
 * Target: PO-2026-1094 (`PO-0095`) — a single-line order for PPE-BOT-186 into
 * DC-02, 158 units ordered, nothing received. Its line's product already holds
 * thousands of units at A-01-02-04, so the receipt lands on an existing Stock
 * Row and a few dozen units move no health bucket. `afterAll` winds the order
 * and that holding back to their seeded state so the read suite stays valid.
 */

import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import type { BrowserContext, Page } from "@playwright/test";

import { test, expect } from "./fixtures";

const PO_ID = "PO-0095";
const PO_NUMBER = "PO-2026-1094";
const WAREHOUSE_ID = "WH-02";
const SKU = "PPE-BOT-186";
const PUT_AWAY = "A-01-02-04";
const ORDERED = 158;
const FIRST_RECEIPT = 50;

/** The representative user for the `warehouse-staff` role in the fixed seed. */
const OPERATOR = "Aisha Rahman";

async function actAs(context: BrowserContext, role: string) {
  await context.addCookies([
    { name: "stockpile-role", value: role, domain: "localhost", path: "/" },
  ]);
}

async function pickOption(page: Page, triggerId: string, name: string) {
  await page.locator(`#${triggerId}`).click();
  await page.getByRole("option", { name, exact: true }).click();
}

/**
 * Fill the Receive tab for the single line and confirm; wait for the result. A
 * note is always supplied (the form sends it, and the domain uses it as the
 * Movement reason) so each run's ledger row is findable by a unique string —
 * the ledger and event stream are append-only, so reruns against a persistent
 * branch accumulate rows the way `adjustment.write.spec.ts` handles too.
 */
async function receive(page: Page, qty: number, note: string) {
  const main = page.locator("main");
  await page.goto(`/purchasing/purchase-orders/${PO_ID}?tab=receive`);
  await expect(main.getByRole("heading", { name: "Check in the delivery" })).toBeVisible();

  await main.locator("#recv-LN-001").fill(String(qty));
  await pickOption(page, "put-away", PUT_AWAY);
  await main.locator("#receipt-note").fill(note);

  await main.getByRole("button", { name: "Confirm receipt" }).click();
  await expect(main.getByRole("button", { name: "Confirming…" })).toHaveCount(0, { timeout: 20_000 });
}

/** The one movement-ledger row carrying this run's unique note. */
function ledgerRow(page: Page, note: string) {
  return page.locator("main tbody tr").filter({ hasText: note });
}

test.describe("goods receipt against a purchase order", () => {
  test.describe.configure({ mode: "serial" });

  test("a partial receipt raises on-hand and leaves the order partially received", async ({
    page,
    context,
  }) => {
    await actAs(context, "warehouse-staff");
    const main = page.locator("main");

    const note = `e2e partial receipt ${Date.now()}`;
    await receive(page, FIRST_RECEIPT, note);

    // The result panel confirms the booking and the new state.
    await expect(main.getByRole("heading", { name: "Booked in" })).toBeVisible();
    await expect(main.locator("li").filter({ hasText: `${SKU}:` })).toContainText(
      `+${FIRST_RECEIPT}`,
    );

    // The order is now partially received; the outstanding balance — incoming,
    // derived from the open order — has fallen by exactly what arrived.
    await page.goto(`/purchasing/purchase-orders/${PO_ID}`);
    await expect(main.getByText("Partially received").first()).toBeVisible();

    await page.goto(`/purchasing/purchase-orders/${PO_ID}?tab=lines`);
    const lineRow = main.locator("tbody tr").filter({ hasText: SKU });
    await expect(lineRow).toContainText(String(FIRST_RECEIPT)); // received so far
    await expect(lineRow).toContainText(String(ORDERED - FIRST_RECEIPT)); // outstanding

    // On-hand rose: a purchase-receipt movement, attributed to the operator.
    await page.goto(`/inventory/movements?q=${encodeURIComponent(note)}`);
    await expect(ledgerRow(page, note)).toHaveCount(1);
    await expect(ledgerRow(page, note)).toContainText(SKU);
    await expect(ledgerRow(page, note)).toContainText("Purchase Receipt");
    await expect(ledgerRow(page, note)).toContainText(`+${FIRST_RECEIPT}`);
    await expect(ledgerRow(page, note)).toContainText(OPERATOR);
  });

  test("receiving the remainder closes the order", async ({ page, context }) => {
    await actAs(context, "warehouse-staff");
    const main = page.locator("main");

    const note = `e2e completing receipt ${Date.now()}`;
    const remainder = ORDERED - FIRST_RECEIPT;
    await receive(page, remainder, note);

    // Booking the remainder closes the order, so the revalidated Receive tab
    // now shows the fully-received state rather than the check-in form.
    await expect(main.getByRole("heading", { name: "Fully received" })).toBeVisible();
    await expect(main.getByText(`All ${ORDERED} units were booked`)).toBeVisible();

    // A fresh load of the Receive tab offers no check-in form on a closed order.
    await page.goto(`/purchasing/purchase-orders/${PO_ID}?tab=receive`);
    await expect(main.getByRole("heading", { name: "Fully received" })).toBeVisible();
    await expect(main.getByRole("button", { name: "Confirm receipt" })).toHaveCount(0);

    // The completed delivery is on the goods-received record, in full.
    await page.goto("/purchasing/goods-received");
    const receiptRow = main.locator("tbody tr").filter({ hasText: PO_NUMBER });
    await expect(receiptRow).toContainText("Received");
    await expect(receiptRow).toContainText(`${ORDERED} / ${ORDERED}`);

    await page.goto(`/inventory/movements?q=${encodeURIComponent(note)}`);
    await expect(ledgerRow(page, note)).toHaveCount(1);
    await expect(ledgerRow(page, note)).toContainText("Purchase Receipt");
    await expect(ledgerRow(page, note)).toContainText(`+${remainder}`);
  });

  test("a role without receiving never sees the Receive tab", async ({ page, context }) => {
    await actAs(context, "auditor");
    const main = page.locator("main");

    await page.goto(`/purchasing/purchase-orders/${PO_ID}`);
    await expect(main.getByRole("heading", { name: PO_NUMBER })).toBeVisible();
    await expect(main.getByRole("tab", { name: "Receive" })).toHaveCount(0);

    // Reaching for the tab directly still renders no form.
    await page.goto(`/purchasing/purchase-orders/${PO_ID}?tab=receive`);
    await expect(main.getByRole("button", { name: "Confirm receipt" })).toHaveCount(0);
  });
});

test.afterAll(async () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return;
  neonConfig.webSocketConstructor = ws;
  const pool = new Pool({ connectionString, max: 2 });
  try {
    // `fulfilled` is how much actually went in (seeded 0), and every receipt in
    // this suite is put away at PUT_AWAY — so pull that much back out of that
    // holding, then wind the order back to `ordered`. CI reseeds every run; this
    // keeps a persistent local branch stable across reruns.
    const { rows } = await pool.query(
      "SELECT product_id, fulfilled FROM purchase_order_lines WHERE purchase_order_id = $1 ORDER BY seq LIMIT 1",
      [PO_ID],
    );
    const line = rows[0];
    if (line && line.fulfilled > 0) {
      await pool.query(
        `UPDATE stock_rows SET on_hand = on_hand - $1
           WHERE product_id = $2 AND lot_number IS NULL
             AND location_id = (SELECT id FROM locations WHERE code = $3 AND warehouse_id = $4)`,
        [line.fulfilled, line.product_id, PUT_AWAY, WAREHOUSE_ID],
      );
    }
    await pool.query("UPDATE purchase_order_lines SET fulfilled = 0 WHERE purchase_order_id = $1", [PO_ID]);
    await pool.query(
      "UPDATE purchase_orders SET status = 'ordered', received_at = NULL WHERE id = $1",
      [PO_ID],
    );
  } finally {
    await pool.end();
  }
});
