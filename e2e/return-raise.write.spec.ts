/**
 * Raising a return, end to end (ticket 10) — the creation flow whose whole
 * point is what it does *not* do.
 *
 * An operator picks a shipped Sales Order on the new-return form, selects a
 * line and a quantity, and submits. A real Return exists in `requested` with an
 * allocated `SR-` number, and nothing has moved: no Movement mentions it and
 * on-hand at the returned product's holding is unchanged. Then the same Return
 * is processed through the existing "Book goods back in" control, and only now
 * does on-hand rise by the returned quantity, as a `return-in` Movement.
 *
 * The permission refusal for a Role reaching `raiseReturn` directly and the
 * refusal of a line exceeding what the source Document moved are
 * `npm run check:returns` — Playwright always goes through the form.
 *
 * The Return this spec raises is deleted in `afterAll` and any on-hand it
 * booked at processing is reversed, so the read suite still sees exactly the
 * seeded world.
 */

import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import type { BrowserContext } from "@playwright/test";

import { test, expect } from "./fixtures";

const RETURN_QTY = 2;

let pool: Pool;

/** A shipped Sales Order with a line whose product sits in exactly one
 *  un-lotted holding with room — so this spec's on-hand assertion lands on a
 *  single row and one write reverses it. */
let source: { orderNumber: string; sku: string; rowSeq: number };

async function actAs(context: BrowserContext, role: string) {
  await context.addCookies([
    { name: "stockpile-role", value: role, domain: "localhost", path: "/" },
  ]);
}

async function onHandOf(rowSeq: number): Promise<number> {
  const { rows } = await pool.query(`SELECT on_hand FROM stock_rows WHERE seq = $1`, [rowSeq]);
  return rows[0].on_hand;
}

test.beforeAll(async () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  neonConfig.webSocketConstructor = ws;
  pool = new Pool({ connectionString, max: 3 });

  const { rows } = await pool.query(
    `SELECT so.number AS order_number, l.product_id, l.sku, so.warehouse_id
       FROM sales_order_lines l
       JOIN sales_orders so ON so.id = l.sales_order_id
      WHERE so.shipped_at IS NOT NULL AND l.fulfilled >= 5
        AND so.id NOT IN (SELECT source_order_id FROM returns)`,
  );
  for (const r of rows) {
    const { rows: h } = await pool.query(
      `SELECT seq, on_hand, lot_number FROM stock_rows WHERE product_id = $1 AND warehouse_id = $2`,
      [r.product_id, r.warehouse_id],
    );
    if (h.length === 1 && h[0].lot_number === null && h[0].on_hand >= 12) {
      source = { orderNumber: r.order_number, sku: r.sku, rowSeq: h[0].seq };
      break;
    }
  }
  if (!source) throw new Error("no shipped sales order with a roomy single-holding line");
});

test.afterAll(async () => {
  if (!pool) return;
  try {
    // Created ids are `RET-` plus eight hex characters (`lib/domain/reference.ts`
    // `newId`); every seeded return is `RET-` plus three digits. If the Return
    // was processed a `return-in` Movement raised on-hand by RETURN_QTY at the
    // single holding — reverse that before dropping the rows.
    const { rows } = await pool.query(
      `SELECT id FROM returns WHERE id ~ '^RET-[0-9A-F]{8}$'`,
    );
    for (const { id } of rows) {
      const { rowCount } = await pool.query(
        `SELECT 1 FROM movements WHERE ref_id = $1 AND type = 'return-in' LIMIT 1`,
        [id],
      );
      if (rowCount) {
        await pool.query(`UPDATE stock_rows SET on_hand = on_hand - $1 WHERE seq = $2`, [
          RETURN_QTY,
          source.rowSeq,
        ]);
      }
      await pool.query(`DELETE FROM movements WHERE ref_id = $1`, [id]);
      await pool.query(`DELETE FROM return_lines WHERE return_id = $1`, [id]);
      await pool.query(`DELETE FROM returns WHERE id = $1`, [id]);
    }
  } finally {
    await pool.end();
  }
});

test.describe("raising a return", () => {
  test("a customer return is raised in requested and moves on-hand only when processed", async ({
    page,
    context,
  }) => {
    // A raise and a process, each with its own navigations.
    test.slow();
    await actAs(context, "sales-manager");
    await page.goto("/sales/returns/new");
    const main = page.locator("main");
    await expect(main.getByRole("heading", { name: "New sales return" })).toBeVisible();

    // Pick the known-safe source order, then put a quantity against its line.
    await main.locator("#order").click();
    await page.getByRole("option", { name: new RegExp(source.orderNumber) }).click();
    const row = main.locator("li", { hasText: source.sku });
    await row.getByRole("spinbutton").fill(String(RETURN_QTY));

    const onHandBefore = await onHandOf(source.rowSeq);

    await main.getByRole("button", { name: "Raise return" }).click();

    // The form navigates to the new return on success, so its id is in the URL.
    await page.waitForURL(/\/sales\/returns\/RET-[0-9A-F]{8}$/, { timeout: 30_000 });
    const returnId = page.url().split("/").pop()!;

    // Numbered, in requested — and nothing has moved: no Movement mentions the
    // return and on-hand at the holding is untouched.
    await expect(main.getByText(/^SR-\d{4}-\d{3}$/).first()).toBeVisible();
    await expect(main.getByText("Requested").first()).toBeVisible();

    const { rows: afterRaise } = await pool.query(
      `SELECT 1 FROM movements WHERE ref_id = $1`,
      [returnId],
    );
    expect(afterRaise).toHaveLength(0);
    expect(await onHandOf(source.rowSeq)).toBe(onHandBefore);

    // Process it through the existing control — now the goods move.
    await main.getByRole("button", { name: /Book goods back in/i }).click();
    await expect(main.getByRole("button", { name: "Processing…" })).toHaveCount(0, {
      timeout: 20_000,
    });
    await page.goto(`/sales/returns/${returnId}`);
    await expect(main.getByText("Received").first()).toBeVisible();

    expect(await onHandOf(source.rowSeq)).toBe(onHandBefore + RETURN_QTY);
    const { rows: moves } = await pool.query(
      `SELECT type, user_id, ref_type FROM movements WHERE ref_id = $1`,
      [returnId],
    );
    expect(moves).toHaveLength(1);
    expect(moves[0].type).toBe("return-in");
    expect(moves[0].ref_type).toBe("return");
  });

  test("a role that cannot raise returns never sees the form", async ({ page, context }) => {
    await actAs(context, "auditor");
    await page.goto("/sales/returns/new");
    const main = page.locator("main");

    await expect(
      main.getByRole("heading", { name: /do not have access to Sales returns/i }),
    ).toBeVisible();
    await expect(main.getByRole("button", { name: "Raise return" })).toHaveCount(0);
  });
});
