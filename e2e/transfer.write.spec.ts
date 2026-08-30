/**
 * Transfer between Warehouses, end to end (ticket 14) — the only Document with
 * two ends, and the only flow where one logical operation touches more than one
 * Stock Row.
 *
 * One lifecycle test walks a transfer despatch → in transit → receipt:
 *
 *  - Despatch (`approved -> in-transit`): on-hand falls at the source and the
 *    quantity becomes in transit. Two `transfer-out` Movements land in the
 *    ledger, attributed to the operator.
 *  - In transit: the transfer reads "In transit", its Despatched total is the
 *    full quantity and its Received total is zero — the stock is at neither
 *    end's on-hand.
 *  - Receipt (`in-transit -> received`): on-hand rises at the destination, the
 *    in-transit balance clears, two `transfer-in` Movements land in the ledger.
 *
 * A second test confirms a Role without `transfers` edit is offered neither the
 * Despatch control nor the Receive tab. The "refused even when the domain
 * function is reached directly" half, and the no-deadlock guarantee for two
 * concurrent despatches, are `npm run check:transfers` — Playwright can only
 * reach the form and cannot issue simultaneous operations.
 *
 * The despatched transfer is created in `beforeAll` against two products that
 * genuinely hold stock at a shared source warehouse (the seeded `approved`
 * transfers are not stock-backed), and `afterAll` reverses every Movement it
 * caused and deletes it, so the read suite still sees exactly the seeded world.
 */

import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import type { BrowserContext, Page } from "@playwright/test";

import { test, expect } from "./fixtures";

const OPERATOR = "Aisha Rahman"; // representative `warehouse-staff` user in the fixed seed
const QTY_A = 4;
const QTY_B = 6;

let pool: Pool;
let transferId: string;
let transferNumber: string;
let skuA: string;
let skuB: string;

async function actAs(context: BrowserContext, role: string) {
  await context.addCookies([
    { name: "stockpile-role", value: role, domain: "localhost", path: "/" },
  ]);
}

function ledgerRow(page: Page, text: string) {
  return page.locator("main tbody tr").filter({ hasText: text });
}

test.beforeAll(async () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  neonConfig.webSocketConstructor = ws;
  pool = new Pool({ connectionString, max: 3 });

  // A source warehouse with two un-lotted products that each hold plenty there,
  // and any other warehouse as the destination.
  const { rows: holdings } = await pool.query(
    `SELECT product_id, warehouse_id, location_id, on_hand
       FROM stock_rows
      WHERE lot_number IS NULL AND on_hand >= 50`,
  );
  const byWarehouse = new Map<string, { productId: string; locationId: string }[]>();
  for (const h of holdings) {
    const list = byWarehouse.get(h.warehouse_id) ?? [];
    list.push({ productId: h.product_id, locationId: h.location_id });
    byWarehouse.set(h.warehouse_id, list);
  }
  let from = "";
  let picks: { productId: string; locationId: string }[] = [];
  for (const [warehouseId, list] of byWarehouse) {
    const seen = new Set<string>();
    const distinct = list.filter((p) => !seen.has(p.productId) && seen.add(p.productId));
    if (distinct.length >= 2) {
      from = warehouseId;
      picks = distinct.slice(0, 2);
      break;
    }
  }
  if (!from) throw new Error("no source warehouse with two stocked un-lotted products");

  const { rows: whRows } = await pool.query(
    `SELECT id FROM warehouses WHERE id <> $1 ORDER BY id LIMIT 1`,
    [from],
  );
  const to = whRows[0].id as string;

  const { rows: userRows } = await pool.query(
    `SELECT id FROM users WHERE role = 'inventory-manager' LIMIT 1`,
  );
  const requestedBy = userRows[0].id as string;

  const skuRows = await pool.query(
    `SELECT id, sku FROM products WHERE id = ANY($1)`,
    [picks.map((p) => p.productId)],
  );
  const skuOf = new Map(skuRows.rows.map((r) => [r.id, r.sku]));
  skuA = skuOf.get(picks[0].productId)!;
  skuB = skuOf.get(picks[1].productId)!;

  transferId = `TT-E2E-${Date.now()}`;
  transferNumber = transferId;
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO transfers
       (id, number, from_warehouse_id, to_warehouse_id, status, created_at, approved_at,
        shipped_at, expected_at, received_at, requested_by, approved_by, approvals,
        carrier, tracking_number, reason, notes)
     VALUES ($1,$1,$2,$3,'approved',$4,$4,NULL,$4,NULL,$5,$5,'[]'::jsonb,NULL,NULL,$6,'')`,
    [transferId, from, to, now, requestedBy, "e2e: transfer write path"],
  );
  await pool.query(
    `INSERT INTO transfer_lines
       (transfer_id, id, product_id, sku, name, quantity, shipped, received, from_location_id, to_location_id)
     VALUES
       ($1,'TL-001',$2,$3,'e2e A',$4,0,0,$5,NULL),
       ($1,'TL-002',$6,$7,'e2e B',$8,0,0,$9,NULL)`,
    [
      transferId,
      picks[0].productId, skuA, QTY_A, picks[0].locationId,
      picks[1].productId, skuB, QTY_B, picks[1].locationId,
    ],
  );
});

test.afterAll(async () => {
  if (!pool) return;
  try {
    // Pull every unit this suite moved back to where the ledger says it landed,
    // then delete the throwaway transfer. The Event stream is append-only; CI
    // reseeds (truncating it) every run, this keeps a persistent local branch stable.
    const { rows: moved } = await pool.query(
      `SELECT product_id, warehouse_id, location_id, SUM(qty_change)::int AS delta
         FROM movements WHERE ref_id = $1 GROUP BY product_id, warehouse_id, location_id`,
      [transferId],
    );
    for (const m of moved) {
      if (m.delta === 0) continue;
      await pool.query(
        `UPDATE stock_rows SET on_hand = on_hand - $1
           WHERE product_id = $2 AND warehouse_id = $3 AND location_id = $4 AND lot_number IS NULL`,
        [m.delta, m.product_id, m.warehouse_id, m.location_id],
      );
    }
    await pool.query(`DELETE FROM transfer_lines WHERE transfer_id = $1`, [transferId]);
    await pool.query(`DELETE FROM transfers WHERE id = $1`, [transferId]);
  } finally {
    await pool.end();
  }
});

test.describe("transfer between warehouses", () => {
  test.describe.configure({ mode: "serial" });

  test("a role without transfers edit is offered neither despatch nor receipt", async ({ page, context }) => {
    await actAs(context, "auditor");
    const main = page.locator("main");

    await page.goto(`/warehousing/transfers/${transferId}`);
    await expect(main.getByRole("heading", { name: transferNumber })).toBeVisible();
    await expect(main.getByRole("button", { name: "Despatch" })).toHaveCount(0);
    await expect(main.getByRole("tab", { name: "Receive" })).toHaveCount(0);

    await page.goto(`/warehousing/transfers/${transferId}?tab=receive`);
    await expect(main.getByRole("button", { name: "Confirm receipt" })).toHaveCount(0);
  });

  test("despatch lowers source on-hand and puts the quantity in transit", async ({ page, context }) => {
    await actAs(context, "warehouse-staff");
    const main = page.locator("main");

    await page.goto(`/warehousing/transfers/${transferId}`);
    await expect(main.getByRole("heading", { name: transferNumber })).toBeVisible();

    await main.getByRole("button", { name: "Despatch" }).click();
    await expect(main.getByRole("button", { name: "Despatching…" })).toHaveCount(0, { timeout: 20_000 });

    // The transfer is now in transit.
    await page.goto(`/warehousing/transfers/${transferId}`);
    await expect(main.getByText("In transit").first()).toBeVisible();

    // Two transfer-out movements, attributed to the operator, and nothing yet
    // received — the stock is at neither end's on-hand.
    await page.goto(`/inventory/movements?q=${encodeURIComponent(transferNumber)}`);
    await expect(ledgerRow(page, transferNumber)).toHaveCount(2);
    await expect(ledgerRow(page, skuA)).toContainText("Transfer Out");
    await expect(ledgerRow(page, skuA)).toContainText(`−${QTY_A}`); // signed() uses a typographic minus
    await expect(ledgerRow(page, skuB)).toContainText(`−${QTY_B}`);
    await expect(ledgerRow(page, transferNumber).first()).toContainText(OPERATOR);
  });

  test("receipt raises destination on-hand and clears the in-transit balance", async ({ page, context }) => {
    await actAs(context, "warehouse-staff");
    const main = page.locator("main");

    await page.goto(`/warehousing/transfers/${transferId}?tab=receive`);
    await expect(main.getByRole("heading", { name: "Count what arrived" })).toBeVisible();

    // The Received inputs default to the full outstanding quantity.
    await main.getByRole("button", { name: "Confirm receipt" }).click();
    // A completing receipt closes the transfer, so the revalidated Receive tab
    // swaps the form out for the already-received state.
    await expect(main.getByRole("heading", { name: "Already received" })).toBeVisible({ timeout: 20_000 });

    // The transfer is fully received.
    await page.goto(`/warehousing/transfers/${transferId}`);
    await expect(main.getByText("Received").first()).toBeVisible();

    // Two transfer-in movements raise on-hand at the destination.
    await page.goto(`/inventory/movements?q=${encodeURIComponent(transferNumber)}`);
    await expect(ledgerRow(page, "Transfer In")).toHaveCount(2);
    await expect(ledgerRow(page, skuA).filter({ hasText: "Transfer In" })).toContainText(`+${QTY_A}`);
    await expect(ledgerRow(page, skuB).filter({ hasText: "Transfer In" })).toContainText(`+${QTY_B}`);
  });
});
