/**
 * The import wizard's write step, end to end (ticket 14).
 *
 * Before this ticket the wizard validated a file and then announced that N rows
 * were imported when nothing had been written. These two specs cover the two
 * kinds the ticket calls out:
 *
 *  - Products: a file uploaded, mapped, validated and imported puts a real row
 *    in the catalogue — the "reports what was actually written" criterion, now
 *    that the number on the summary comes back from the server.
 *  - Opening stock: an imported row lands in the movement ledger as a
 *    `count-correction`, because opening stock routes through the choke point
 *    and never writes `stock_rows` directly.
 *
 * The "refused when the domain function is reached directly" and the
 * one-transaction-per-file guarantees are `npm run check:import` — Playwright
 * can only ever reach the wizard, which is the default `super-admin` role that
 * can import every kind.
 *
 * `afterAll` deletes the throwaway product and winds the touched holding back to
 * its seeded on-hand, so the read suite still sees exactly the seeded world.
 * The appended Movement and Event are left — the ledger and event stream are
 * append-only and CI truncates them on reseed, the same as the other write
 * specs.
 */

import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import type { Page } from "@playwright/test";

import { test, expect } from "./fixtures";

const STAMP = Date.now();
const PRODUCT_SKU = `E2E-IMP-${STAMP}`;
const OPENING_STOCK_DELTA = 7;

let pool: Pool;
let categoryName: string;
let holding: {
  sku: string;
  warehouseCode: string;
  binCode: string;
  productId: string;
  warehouseId: string;
  locationId: string;
  onHand: number;
};

async function pickKind(page: Page, label: string) {
  await page.locator("#import-kind").click();
  await page.getByRole("option", { name: label, exact: true }).click();
}

/** Drive the wizard from an in-memory CSV through to the "Import complete" screen. */
async function importCsv(page: Page, csv: string) {
  const main = page.locator("main");
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: "import.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });

  await expect(main.getByRole("button", { name: "Validate" })).toBeEnabled();
  await main.getByRole("button", { name: "Validate" }).click();

  await main.getByRole("button", { name: /^Import \d+ row/ }).click();
  await expect(main.getByRole("heading", { name: "Import complete" })).toBeVisible({
    timeout: 20_000,
  });
}

test.beforeAll(async () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  neonConfig.webSocketConstructor = ws;
  pool = new Pool({ connectionString, max: 3 });

  const { rows: catRows } = await pool.query(
    `SELECT name FROM categories ORDER BY id LIMIT 1`,
  );
  categoryName = catRows[0].name as string;

  const { rows: holdingRows } = await pool.query(
    `SELECT p.sku, w.code AS warehouse_code, l.code AS bin_code,
            sr.product_id, sr.warehouse_id, sr.location_id, sr.on_hand
       FROM stock_rows sr
       JOIN products p ON p.id = sr.product_id
       JOIN warehouses w ON w.id = sr.warehouse_id
       JOIN locations l ON l.id = sr.location_id
      WHERE sr.lot_number IS NULL AND sr.on_hand BETWEEN 10 AND 100000
      LIMIT 1`,
  );
  if (holdingRows.length === 0) throw new Error("no un-lotted holding with stock to spare");
  const h = holdingRows[0];
  holding = {
    sku: h.sku,
    warehouseCode: h.warehouse_code,
    binCode: h.bin_code,
    productId: h.product_id,
    warehouseId: h.warehouse_id,
    locationId: h.location_id,
    onHand: h.on_hand,
  };
});

test.afterAll(async () => {
  if (!pool) return;
  try {
    await pool.query(`DELETE FROM products WHERE sku LIKE 'E2E-IMP-%'`);
    if (holding) {
      await pool.query(
        `UPDATE stock_rows SET on_hand = $1
           WHERE product_id = $2 AND warehouse_id = $3 AND location_id = $4 AND lot_number IS NULL`,
        [holding.onHand, holding.productId, holding.warehouseId, holding.locationId],
      );
    }
  } finally {
    await pool.end();
  }
});

test.describe("import wizard — write step", () => {
  test.describe.configure({ mode: "serial" });

  test("an imported products file puts a real row in the catalogue", async ({ page }) => {
    await page.goto("/import");
    const csv = [
      "sku,name,category,unit cost",
      `${PRODUCT_SKU},E2E Imported Widget,"${categoryName}",12.50`,
    ].join("\n");

    await importCsv(page, csv);

    const { rows } = await pool.query(`SELECT sku, unit_cost FROM products WHERE sku = $1`, [
      PRODUCT_SKU,
    ]);
    expect(rows.length, "the imported product was written").toBe(1);
    expect(Number(rows[0].unit_cost)).toBe(12.5);
  });

  test("an imported opening-stock row lands in the ledger as a count-correction", async ({
    page,
    main,
  }) => {
    await page.goto("/import");
    await pickKind(page, "Opening stock");

    const csv = [
      "sku,warehouse,bin,quantity",
      `${holding.sku},${holding.warehouseCode},${holding.binCode},${holding.onHand + OPENING_STOCK_DELTA}`,
    ].join("\n");
    await importCsv(page, csv);

    await page.goto(`/inventory/movements?q=${encodeURIComponent(holding.sku)}`);
    const row = main.locator("tbody tr").filter({ hasText: holding.sku }).first();
    await expect(row).toContainText("Count Correction");
    await expect(row).toContainText(`+${OPENING_STOCK_DELTA}`);

    const { rows } = await pool.query(
      `SELECT on_hand FROM stock_rows
        WHERE product_id = $1 AND warehouse_id = $2 AND location_id = $3 AND lot_number IS NULL`,
      [holding.productId, holding.warehouseId, holding.locationId],
    );
    expect(rows[0].on_hand, "on-hand was set to the counted figure").toBe(
      holding.onHand + OPENING_STOCK_DELTA,
    );
  });
});
