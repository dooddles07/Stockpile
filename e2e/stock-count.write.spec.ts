/**
 * Stock Count completion, end to end (ticket 15) — the flow where the system
 * admits it was wrong and reconciles itself to reality.
 *
 * Three behaviours the ticket names:
 *
 *  - A count with variances: an operator works the sheet, completes the count,
 *    and one `count-correction` Movement lands in the ledger for the line that
 *    did not match — carrying the signed variance and the operator's name — and
 *    the count reads "Applied".
 *  - A count with none: every counted line matches, the count completes, and
 *    nothing at all posts to the ledger.
 *  - A permission refusal: a Role without `counts` edit is offered neither the
 *    Count sheet tab nor the Complete control. The "refused even when the domain
 *    function is reached directly", the all-or-nothing guarantee, and "no
 *    variance appends nothing" below the UI are `npm run check:counts` —
 *    Playwright can only reach the sheet.
 *
 * Both counts are created in `beforeAll` against products that genuinely hold
 * stock (the seeded counts are not stock-backed), and `afterAll` reverses every
 * Movement caused and deletes them, so the read suite still sees exactly the
 * seeded world.
 */

import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import type { BrowserContext, Page } from "@playwright/test";

import { test, expect } from "./fixtures";

const OPERATOR = "Aisha Rahman"; // representative `warehouse-staff` user in the fixed seed
const VARIANCE = 5; // within the ±8 recount tolerance, so the sheet lets the count complete

let pool: Pool;

interface CountFixture {
  id: string;
  number: string;
  lineA: { lineId: string; sku: string; expected: number };
  lineB: { lineId: string; sku: string; expected: number };
}
let withVariance: CountFixture;
let noVariance: CountFixture;

async function actAs(context: BrowserContext, role: string) {
  await context.addCookies([
    { name: "stockpile-role", value: role, domain: "localhost", path: "/" },
  ]);
}

function ledgerRow(page: Page, text: string) {
  return page.locator("main tbody tr").filter({ hasText: text });
}

async function makeCount(warehouseId: string, createdBy: string, picks: { productId: string; sku: string; locationId: string; onHand: number }[]): Promise<CountFixture> {
  const id = `SC-E2E-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO stock_counts
       (id, number, type, warehouse_id, scope_label, status, scheduled_for, started_at,
        completed_at, assigned_to, accuracy_pct, total_variance_value, created_by, approved_by)
     VALUES ($1,$1,'spot',$2,'e2e','in-progress',$3,$3,NULL,$4::jsonb,0,0,$5,NULL)`,
    [id, warehouseId, now, JSON.stringify([createdBy]), createdBy],
  );
  await pool.query(
    `INSERT INTO count_lines
       (stock_count_id, id, product_id, sku, name, location_id, expected, counted, variance, variance_value, counted_by, counted_at, recount)
     VALUES
       ($1,'CL-001',$2,$3,'e2e A',$4,$5,NULL,0,0,NULL,NULL,false),
       ($1,'CL-002',$6,$7,'e2e B',$8,$9,NULL,0,0,NULL,NULL,false)`,
    [
      id,
      picks[0].productId, picks[0].sku, picks[0].locationId, picks[0].onHand,
      picks[1].productId, picks[1].sku, picks[1].locationId, picks[1].onHand,
    ],
  );
  return {
    id,
    number: id,
    lineA: { lineId: "CL-001", sku: picks[0].sku, expected: picks[0].onHand },
    lineB: { lineId: "CL-002", sku: picks[1].sku, expected: picks[1].onHand },
  };
}

test.beforeAll(async () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  neonConfig.webSocketConstructor = ws;
  pool = new Pool({ connectionString, max: 3 });

  // A warehouse with at least four un-lotted products holding plenty — two per
  // throwaway count.
  const { rows: holdings } = await pool.query(
    `SELECT product_id, warehouse_id, location_id, on_hand
       FROM stock_rows
      WHERE lot_number IS NULL AND on_hand >= 50`,
  );
  const byWarehouse = new Map<string, { productId: string; locationId: string; onHand: number }[]>();
  for (const h of holdings) {
    const list = byWarehouse.get(h.warehouse_id) ?? [];
    if (!list.some((p) => p.productId === h.product_id)) {
      list.push({ productId: h.product_id, locationId: h.location_id, onHand: h.on_hand });
    }
    byWarehouse.set(h.warehouse_id, list);
  }
  let warehouseId = "";
  let distinct: { productId: string; locationId: string; onHand: number }[] = [];
  for (const [id, list] of byWarehouse) {
    if (list.length >= 4) {
      warehouseId = id;
      distinct = list.slice(0, 4);
      break;
    }
  }
  if (!warehouseId) throw new Error("no warehouse with four stocked un-lotted products");

  const { rows: skuRows } = await pool.query(`SELECT id, sku FROM products WHERE id = ANY($1)`, [
    distinct.map((p) => p.productId),
  ]);
  const skuOf = new Map(skuRows.map((r) => [r.id, r.sku]));
  const picks = distinct.map((p) => ({ ...p, sku: skuOf.get(p.productId) as string }));

  const { rows: userRows } = await pool.query(
    `SELECT id FROM users WHERE role = 'inventory-manager' LIMIT 1`,
  );
  const createdBy = userRows[0].id as string;

  withVariance = await makeCount(warehouseId, createdBy, picks.slice(0, 2));
  noVariance = await makeCount(warehouseId, createdBy, picks.slice(2, 4));
});

test.afterAll(async () => {
  if (!pool) return;
  try {
    for (const c of [withVariance, noVariance]) {
      if (!c) continue;
      const { rows: moved } = await pool.query(
        `SELECT product_id, warehouse_id, location_id, SUM(qty_change)::int AS delta
           FROM movements WHERE ref_id = $1 GROUP BY product_id, warehouse_id, location_id`,
        [c.id],
      );
      for (const m of moved) {
        if (m.delta === 0) continue;
        await pool.query(
          `UPDATE stock_rows SET on_hand = on_hand - $1
             WHERE product_id = $2 AND warehouse_id = $3 AND location_id = $4 AND lot_number IS NULL`,
          [m.delta, m.product_id, m.warehouse_id, m.location_id],
        );
      }
      await pool.query(`DELETE FROM count_lines WHERE stock_count_id = $1`, [c.id]);
      await pool.query(`DELETE FROM stock_counts WHERE id = $1`, [c.id]);
    }
  } finally {
    await pool.end();
  }
});

/** Open a count's sheet, enter `counted` per line, complete it, and land back
 *  on the detail page reading "Applied". */
async function completeSheet(
  page: Page,
  count: CountFixture,
  counted: { a: number; b: number },
) {
  const main = page.locator("main");
  await page.goto(`/inventory/counts/${count.id}?tab=sheet`);
  await expect(main.getByRole("heading", { name: "Count sheet" })).toBeVisible();

  for (const [lineId, value] of [
    [count.lineA.lineId, counted.a],
    [count.lineB.lineId, counted.b],
  ] as const) {
    const input = main.locator(`#count-${lineId}`);
    await input.fill(String(value));
    await input.blur();
  }

  await main.getByRole("button", { name: "Complete count" }).click();
  await expect(main.getByRole("button", { name: "Completing…" })).toHaveCount(0, { timeout: 20_000 });

  await page.goto(`/inventory/counts/${count.id}`);
  await expect(main.getByText("Applied").first()).toBeVisible();
}

test.describe("stock count completion", () => {
  test.describe.configure({ mode: "serial" });

  test("a role without counts edit is offered neither the sheet nor the complete control", async ({ page, context }) => {
    await actAs(context, "auditor");
    const main = page.locator("main");

    await page.goto(`/inventory/counts/${withVariance.id}?tab=sheet`);
    await expect(main.getByRole("heading", { name: withVariance.number })).toBeVisible();
    await expect(main.getByRole("tab", { name: "Count sheet" })).toHaveCount(0);
    await expect(main.getByRole("button", { name: "Complete count" })).toHaveCount(0);
  });

  test("completing a count with a variance posts one count-correction to the ledger", async ({ page, context }) => {
    await actAs(context, "warehouse-staff");

    // Line A is counted five over; line B matches the recorded quantity.
    const countedA = withVariance.lineA.expected + VARIANCE;
    await completeSheet(page, withVariance, { a: countedA, b: withVariance.lineB.expected });

    // Exactly one count-correction Movement — only the line that varied —
    // attributed to the operator, for the signed variance, and carrying both
    // the counted and the recorded quantity so the ledger explains the jump.
    await page.goto(`/inventory/movements?q=${encodeURIComponent(withVariance.number)}`);
    await expect(ledgerRow(page, withVariance.number)).toHaveCount(1);
    const row = ledgerRow(page, withVariance.lineA.sku);
    await expect(row).toContainText("Count Correction");
    await expect(row).toContainText(`+${VARIANCE}`);
    await expect(row).toContainText(`counted ${countedA}, recorded ${withVariance.lineA.expected}`);
    await expect(ledgerRow(page, withVariance.number)).toContainText(OPERATOR);
  });

  test("completing a count with no variances posts nothing", async ({ page, context }) => {
    await actAs(context, "warehouse-staff");

    await completeSheet(page, noVariance, {
      a: noVariance.lineA.expected,
      b: noVariance.lineB.expected,
    });

    // Nothing posted — a matching count is a non-event.
    await page.goto(`/inventory/movements?q=${encodeURIComponent(noVariance.number)}`);
    await expect(page.locator("main tbody tr").filter({ hasText: noVariance.number })).toHaveCount(0);
  });
});
