/**
 * Sales Order fulfilment, end to end (ticket 13) — the flow where the two kinds
 * of balance pull apart. Confirming reserves stock with no Movement; picking and
 * packing only advance the Document; shipping is the one step that appends a
 * Movement and lowers on-hand, and reserved falls out of the order leaving the
 * open set.
 *
 * Covers the confirm-to-ship path and cancellation. The "refused when the domain
 * function is reached directly" half of the permission criterion, and the
 * "reserved is never written directly" invariant, are `npm run check:fulfilment`
 * — Playwright can only ever reach the Fulfil tab.
 *
 * Targets, each wound back to `draft` in `beforeAll` and restored in `afterAll`
 * (CI reseeds every run; this keeps a persistent local branch stable):
 *   - SO-2026-4264 (`SO-0265`) — one line, CMP-KBM-283 ×89 into WH-02, drawn
 *     from a single holding at B-02-01-01. Walked draft -> confirmed -> reserved
 *     -> picking -> packing -> shipped.
 *   - SO-2026-4005 (`SO-0006`) — one line, CMP-TAB-276 ×4 at WH-04. Confirmed
 *     then cancelled; nothing physically moves either way.
 *   - SO-2026-4030 (`SO-0031`) — a genuine seeded draft whose lines overrun
 *     what its warehouse can cover. Used to prove a forbidden Role sees no
 *     Confirm control; left untouched.
 */

import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import type { BrowserContext, Page } from "@playwright/test";

import { test, expect } from "./fixtures";

const SHIP = {
  soId: "SO-0265",
  number: "SO-2026-4264",
  sku: "CMP-KBM-283",
  warehouseId: "WH-02",
  productId: "PRD-0183",
  qty: 89,
};
const CANCEL = { soId: "SO-0006", number: "SO-2026-4005", seededStatus: "reserved" };
const FORBIDDEN_DRAFT = { soId: "SO-0031", number: "SO-2026-4030" };

/** The representative user for the `warehouse-staff` role in the fixed seed. */
const OPERATOR = "Aisha Rahman";

async function actAs(context: BrowserContext, role: string) {
  await context.addCookies([
    { name: "stockpile-role", value: role, domain: "localhost", path: "/" },
  ]);
}

function pool() {
  neonConfig.webSocketConstructor = ws;
  return new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
}

/** The status cell for one order on the list, found by its number. */
function orderRow(page: Page, number: string) {
  return page.locator("main tbody tr").filter({ hasText: number });
}

/** Click a fulfilment button and wait for it to leave its pending state. */
async function act(page: Page, name: string, pending: string) {
  const main = page.locator("main");
  await main.getByRole("button", { name }).click();
  await expect(main.getByRole("button", { name: pending })).toHaveCount(0, { timeout: 20_000 });
}

/**
 * How many movement-ledger rows mention an order number. The Event stream and
 * ledger are append-only, so a rerun against a persistent branch accumulates
 * sale rows for the shipped order — the confirm/ship assertions compare this
 * count across a step rather than expecting an absolute value.
 */
async function ledgerRowsFor(page: Page, query: string): Promise<number> {
  await page.goto(`/inventory/movements?q=${encodeURIComponent(query)}`);
  return page.locator("main tbody tr").filter({ hasText: query }).count();
}

test.beforeAll(async () => {
  if (!process.env.DATABASE_URL) return;
  const db = pool();
  try {
    for (const id of [SHIP.soId, CANCEL.soId]) {
      await db.query("UPDATE sales_order_lines SET fulfilled = 0 WHERE sales_order_id = $1", [id]);
      await db.query(
        "UPDATE sales_orders SET status = 'draft', fulfillment_status = 'unfulfilled', shipped_at = NULL, carrier = NULL, tracking_number = NULL WHERE id = $1",
        [id],
      );
    }
  } finally {
    await db.end();
  }
});

test.describe("sales order fulfilment", () => {
  test.describe.configure({ mode: "serial" });

  test("an order walks from confirmation to shipped, reserving then moving stock", async ({
    page,
    context,
  }) => {
    // Six state transitions, each its own server action and RSC refresh — a
    // legitimately long walk, well past a single write's budget.
    test.slow();
    await actAs(context, "warehouse-staff");
    const main = page.locator("main");

    const ledgerAtStart = await ledgerRowsFor(page, SHIP.number);

    // Confirm — reserves stock, appends no Movement.
    await page.goto(`/sales/orders/${SHIP.soId}`);
    await act(page, "Confirm order", "Confirming…");
    await page.goto(`/sales/orders?q=${SHIP.number}`);
    await expect(orderRow(page, SHIP.number)).toContainText("Confirmed");

    // The confirmation moved nothing: no new ledger row.
    expect(await ledgerRowsFor(page, SHIP.number)).toBe(ledgerAtStart);

    // Reserve -> picking -> packing: each step only advances the Document. The
    // panel re-renders in place after each action (the server action calls
    // revalidatePath), so the next button appears without re-navigating.
    await page.goto(`/sales/orders/${SHIP.soId}?tab=fulfil`);
    await act(page, "Reserve stock", "Reserving…");
    await act(page, "Start picking", "Releasing…");
    await main.locator("#pick-LN-001").fill(String(SHIP.qty));
    await act(page, "Finish picking", "Moving…");

    // Ship — needs a gross weight, then leaves stock.
    await main.locator("#weight").fill("6");
    await act(page, "Ship order", "Shipping…");

    await page.goto(`/sales/orders?q=${SHIP.number}`);
    await expect(orderRow(page, SHIP.number)).toContainText("Shipped");

    // The line is now fully fulfilled — reserved has been released.
    await page.goto(`/sales/orders/${SHIP.soId}?tab=lines`);
    await expect(main.locator("tbody tr").filter({ hasText: SHIP.sku })).toContainText(`${SHIP.qty}`);

    // Shipping added exactly one ledger row for this order — a Sale for the
    // shipped quantity, attributed to the operator. This is on-hand leaving the
    // building. (That on-hand falls by exactly this much, and the reconciliation
    // invariant, are `npm run check:fulfilment`.)
    expect(await ledgerRowsFor(page, SHIP.number)).toBe(ledgerAtStart + 1);
    const saleRow = main
      .locator("tbody tr")
      .filter({ hasText: SHIP.number })
      .filter({ hasText: "Sale" })
      .first();
    await expect(saleRow).toContainText(SHIP.sku);
    await expect(saleRow).toContainText(`−${SHIP.qty}`);
    await expect(saleRow).toContainText(OPERATOR);
  });

  test("cancelling a confirmed order releases its reservation and writes no Movement", async ({
    page,
    context,
  }) => {
    await actAs(context, "warehouse-staff");
    const main = page.locator("main");

    await page.goto(`/sales/orders/${CANCEL.soId}`);
    await act(page, "Confirm order", "Confirming…");
    await page.goto(`/sales/orders?q=${CANCEL.number}`);
    await expect(orderRow(page, CANCEL.number)).toContainText("Confirmed");

    await page.goto(`/sales/orders/${CANCEL.soId}`);
    await act(page, "Cancel order", "Cancelling…");
    await page.goto(`/sales/orders?q=${CANCEL.number}`);
    await expect(orderRow(page, CANCEL.number)).toContainText("Cancelled");

    // Neither the confirmation nor the cancellation appended anything.
    await page.goto(`/inventory/movements?q=${encodeURIComponent(CANCEL.number)}`);
    await expect(main.locator("tbody tr").filter({ hasText: CANCEL.number })).toHaveCount(0);
  });

  test("a role that cannot fulfil is offered no Confirm control", async ({ page, context }) => {
    await actAs(context, "auditor");
    const main = page.locator("main");

    await page.goto(`/sales/orders/${FORBIDDEN_DRAFT.soId}`);
    await expect(main.getByRole("heading", { name: FORBIDDEN_DRAFT.number })).toBeVisible();
    await expect(main.getByRole("button", { name: "Confirm order" })).toHaveCount(0);
    await expect(main.getByRole("button", { name: "Cancel order" })).toHaveCount(0);
  });
});

test.afterAll(async () => {
  if (!process.env.DATABASE_URL) return;
  const db = pool();
  try {
    // Put back the units the shipment drew from the single holding, then wind
    // both orders to their seeded state.
    const { rows } = await db.query(
      "SELECT coalesce(sum(fulfilled), 0)::int AS shipped FROM sales_order_lines WHERE sales_order_id = $1",
      [SHIP.soId],
    );
    const shipped = rows[0]?.shipped ?? 0;
    if (shipped > 0) {
      await db.query(
        "UPDATE stock_rows SET on_hand = on_hand + $1 WHERE product_id = $2 AND warehouse_id = $3 AND lot_number IS NULL",
        [shipped, SHIP.productId, SHIP.warehouseId],
      );
    }
    await db.query("UPDATE sales_order_lines SET fulfilled = 0 WHERE sales_order_id = $1", [SHIP.soId]);
    await db.query(
      "UPDATE sales_orders SET status = 'confirmed', fulfillment_status = 'unfulfilled', shipped_at = NULL, carrier = NULL, tracking_number = NULL WHERE id = $1",
      [SHIP.soId],
    );
    await db.query("UPDATE sales_orders SET status = $2 WHERE id = $1", [
      CANCEL.soId,
      CANCEL.seededStatus,
    ]);
  } finally {
    await db.end();
  }
});
