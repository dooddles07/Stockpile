/**
 * Returns in both directions, end to end (ticket 16) — the last write flow,
 * because a Return references the Document that produced the Movements it
 * reverses.
 *
 * Three behaviours the ticket names, across two processed Returns:
 *
 *  - A customer Return in good condition: a sellable line's units go back on
 *    on-hand, as a `return-in` Movement attributed to the operator.
 *  - A customer Return of damaged goods: a line graded damaged raises the
 *    damaged balance instead of on-hand — a return is not a straight reversal of
 *    the sale — again as a `return-in` Movement.
 *  - A supplier Return: the units leave stock as a `return-out` Movement and the
 *    Return advances.
 *
 * A fourth test confirms a Role without `sales-returns` / `purchase-returns`
 * edit is offered no Process control. "Refused even when the domain function is
 * reached directly", the over-return guard and the all-or-nothing rollback are
 * `npm run check:returns` — Playwright can only reach the return screen.
 *
 * Both Returns are created in `beforeAll` against a genuinely shipped Sales
 * Order and a received Purchase Order whose products each sit in one roomy
 * un-lotted holding (the seeded Returns are spread across the status machine and
 * are not safe to mutate). `afterAll` restores every balance touched, deletes
 * the Movements caused and drops the throwaway Returns, so the read suite still
 * sees exactly the seeded world.
 */

import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import type { BrowserContext, Page } from "@playwright/test";

import { test, expect } from "./fixtures";

const SELLABLE_QTY = 2;
const DAMAGED_QTY = 3;
const SUPPLIER_QTY = 2;

let pool: Pool;

interface ReturnFixture {
  id: string;
  operatorId: string;
  /** The originating Document — a return is visible from it (ticket 16). */
  sourceOrderId: string;
  sourceHref: string;
}

// The other write specs run in parallel and also move stock, so every balance
// here is asserted as a delta against a read taken immediately before the
// action, and `afterAll` reverses this spec's own effect relatively rather than
// restoring an absolute captured earlier.
let customer: ReturnFixture & { goodSeq: number; badSeq: number };
let supplier: ReturnFixture & { drawnSeq: number };

async function actAs(context: BrowserContext, role: string) {
  await context.addCookies([
    { name: "stockpile-role", value: role, domain: "localhost", path: "/" },
  ]);
}

async function holdingOf(rowSeq: number): Promise<{ onHand: number; damaged: number }> {
  const { rows } = await pool.query(
    `SELECT on_hand, damaged FROM stock_rows WHERE seq = $1`,
    [rowSeq],
  );
  return { onHand: rows[0].on_hand, damaged: rows[0].damaged };
}

/** The user the app resolves for a role — `getCurrentUser`: first active one, by id. */
async function operatorFor(role: string): Promise<{ id: string; name: string }> {
  const { rows } = await pool.query(
    `SELECT id, name FROM users WHERE role = $1 AND status = 'active' ORDER BY id LIMIT 1`,
    [role],
  );
  return rows[0];
}

/**
 * A source order (shipped SO or received PO) with `lines` distinct products that
 * each moved `>= 5` and sit in exactly one un-lotted holding with `>= 12` on
 * hand — room for a small Return in either direction, reversible by one write.
 */
async function pickSource(kind: "sales" | "purchase", lines: number) {
  const sql =
    kind === "sales"
      ? `SELECT so.id AS order_id, so.number AS order_number, so.customer_id AS partner_id,
                so.warehouse_id, l.product_id, l.sku, l.name, l.unit_price, l.fulfilled AS moved
           FROM sales_order_lines l
           JOIN sales_orders so ON so.id = l.sales_order_id
          WHERE so.shipped_at IS NOT NULL AND l.fulfilled >= 5
            AND so.id NOT IN (SELECT source_order_id FROM returns)`
      : `SELECT po.id AS order_id, po.number AS order_number, po.supplier_id AS partner_id,
                po.warehouse_id, l.product_id, l.sku, l.name, l.unit_price, l.fulfilled AS moved
           FROM purchase_order_lines l
           JOIN purchase_orders po ON po.id = l.purchase_order_id
          WHERE po.status IN ('partially-received','received','closed') AND l.fulfilled >= 5
            AND po.id NOT IN (SELECT source_order_id FROM returns)`;
  const { rows } = await pool.query(sql);

  const byOrder = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byOrder.get(r.order_id) ?? [];
    list.push(r);
    byOrder.set(r.order_id, list);
  }

  for (const list of byOrder.values()) {
    const picked: {
      productId: string;
      sku: string;
      name: string;
      unitPrice: number;
      moved: number;
      rowSeq: number;
    }[] = [];
    const seen = new Set<string>();
    for (const r of list) {
      if (seen.has(r.product_id)) continue;
      const { rows: h } = await pool.query(
        `SELECT seq, on_hand, lot_number FROM stock_rows
          WHERE product_id = $1 AND warehouse_id = $2`,
        [r.product_id, r.warehouse_id],
      );
      // Exactly one holding for this product here, un-lotted, with room — so the
      // domain's draw and this spec's assertion both land on that single row.
      if (h.length !== 1 || h[0].lot_number !== null || h[0].on_hand < 12) continue;
      seen.add(r.product_id);
      picked.push({
        productId: r.product_id,
        sku: r.sku,
        name: r.name,
        unitPrice: Number(r.unit_price),
        moved: r.moved,
        rowSeq: h[0].seq,
      });
      if (picked.length >= lines) break;
    }
    if (picked.length >= lines) {
      const first = list[0];
      return {
        orderId: first.order_id as string,
        orderNumber: first.order_number as string,
        partnerId: first.partner_id as string,
        warehouseId: first.warehouse_id as string,
        products: picked,
      };
    }
  }
  throw new Error(`no ${kind} source order with ${lines} roomy single-holding products`);
}

async function makeReturn(
  kind: "sales" | "purchase",
  source: Awaited<ReturnType<typeof pickSource>>,
  createdBy: string,
  lines: { productId: string; sku: string; name: string; quantity: number; condition: string; unitPrice: number }[],
): Promise<string> {
  const id = `RET-E2E-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO returns
       (id, number, kind, partner_id, source_order_id, source_order_number, warehouse_id,
        status, reason, created_at, resolved_at, refund_total, restock_value, created_by, note)
     VALUES ($1,$1,$2,$3,$4,$5,$6,'requested','e2e',$7,NULL,0,0,$8,'e2e')`,
    [id, kind, source.partnerId, source.orderId, source.orderNumber, source.warehouseId, now, createdBy],
  );
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    await pool.query(
      `INSERT INTO return_lines
         (return_id, id, product_id, sku, name, quantity, condition, restock, unit_price, refund_amount)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0)`,
      [id, `RL-${i + 1}`, l.productId, l.sku, l.name, l.quantity, l.condition, l.condition === "sellable", l.unitPrice],
    );
  }
  return id;
}

test.beforeAll(async () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  neonConfig.webSocketConstructor = ws;
  pool = new Pool({ connectionString, max: 3 });

  const salesManager = await operatorFor("sales-manager");
  const purchasingManager = await operatorFor("purchasing-manager");

  const salesSource = await pickSource("sales", 2);
  const [good, bad] = salesSource.products;
  const customerId = await makeReturn("sales", salesSource, salesManager.id, [
    { productId: good.productId, sku: good.sku, name: good.name, quantity: SELLABLE_QTY, condition: "sellable", unitPrice: good.unitPrice },
    { productId: bad.productId, sku: bad.sku, name: bad.name, quantity: DAMAGED_QTY, condition: "damaged", unitPrice: bad.unitPrice },
  ]);
  customer = {
    id: customerId,
    operatorId: salesManager.id,
    sourceOrderId: salesSource.orderId,
    sourceHref: `/sales/orders/${salesSource.orderId}`,
    goodSeq: good.rowSeq,
    badSeq: bad.rowSeq,
  };

  const purchaseSource = await pickSource("purchase", 1);
  const [drawn] = purchaseSource.products;
  const supplierId = await makeReturn("purchase", purchaseSource, purchasingManager.id, [
    { productId: drawn.productId, sku: drawn.sku, name: drawn.name, quantity: SUPPLIER_QTY, condition: "sellable", unitPrice: drawn.unitPrice },
  ]);
  supplier = {
    id: supplierId,
    operatorId: purchasingManager.id,
    sourceOrderId: purchaseSource.orderId,
    sourceHref: `/purchasing/purchase-orders/${purchaseSource.orderId}`,
    drawnSeq: drawn.rowSeq,
  };
});

test.afterAll(async () => {
  if (!pool) return;
  try {
    // Reverse this spec's own effect relatively: the sellable line added
    // SELLABLE_QTY to on-hand, the damaged line added DAMAGED_QTY to damaged, the
    // supplier line took SUPPLIER_QTY off on-hand. Only reverse a return that a
    // test actually processed (its Movements exist).
    if (customer) {
      const { rowCount } = await pool.query(`SELECT 1 FROM movements WHERE ref_id = $1 LIMIT 1`, [customer.id]);
      if (rowCount) {
        await pool.query(`UPDATE stock_rows SET on_hand = on_hand - $1 WHERE seq = $2`, [SELLABLE_QTY, customer.goodSeq]);
        await pool.query(`UPDATE stock_rows SET damaged = damaged - $1 WHERE seq = $2`, [DAMAGED_QTY, customer.badSeq]);
      }
      await pool.query(`DELETE FROM movements WHERE ref_id = $1`, [customer.id]);
      await pool.query(`DELETE FROM return_lines WHERE return_id = $1`, [customer.id]);
      await pool.query(`DELETE FROM returns WHERE id = $1`, [customer.id]);
    }
    if (supplier) {
      const { rowCount } = await pool.query(`SELECT 1 FROM movements WHERE ref_id = $1 LIMIT 1`, [supplier.id]);
      if (rowCount) {
        await pool.query(`UPDATE stock_rows SET on_hand = on_hand + $1 WHERE seq = $2`, [SUPPLIER_QTY, supplier.drawnSeq]);
      }
      await pool.query(`DELETE FROM movements WHERE ref_id = $1`, [supplier.id]);
      await pool.query(`DELETE FROM return_lines WHERE return_id = $1`, [supplier.id]);
      await pool.query(`DELETE FROM returns WHERE id = $1`, [supplier.id]);
    }
  } finally {
    await pool.end();
  }
});

async function processReturnViaUi(page: Page, returnBase: string, id: string, button: RegExp) {
  const main = page.locator("main");
  await page.goto(`${returnBase}/${id}`);
  await expect(main.getByRole("heading", { name: id })).toBeVisible();
  await main.getByRole("button", { name: button }).click();
  await expect(main.getByRole("button", { name: "Processing…" })).toHaveCount(0, { timeout: 20_000 });
  await page.goto(`${returnBase}/${id}`);
  await expect(main.getByText("Received").first()).toBeVisible();
}

test.describe("returns in both directions", () => {
  test.describe.configure({ mode: "serial" });

  test("a role without returns edit is offered no process control", async ({ page, context }) => {
    await actAs(context, "auditor");
    const main = page.locator("main");

    await page.goto(`/sales/returns/${customer.id}`);
    await expect(main.getByRole("heading", { name: customer.id })).toBeVisible();
    await expect(main.getByRole("button", { name: /Book goods back in/i })).toHaveCount(0);

    await page.goto(`/purchasing/returns/${supplier.id}`);
    await expect(main.getByRole("heading", { name: supplier.id })).toBeVisible();
    await expect(main.getByRole("button", { name: /Send back to supplier/i })).toHaveCount(0);
  });

  test("a customer return books sellable units on-hand and damaged units to the damaged balance", async ({ page, context }) => {
    await actAs(context, "sales-manager");

    const goodBefore = await holdingOf(customer.goodSeq);
    const badBefore = await holdingOf(customer.badSeq);

    await processReturnViaUi(page, "/sales/returns", customer.id, /Book goods back in/i);

    // Condition decides the balance: the sellable line raises on-hand, the
    // damaged line raises the damaged balance — a return is not a straight
    // reversal of the sale.
    const good = await holdingOf(customer.goodSeq);
    const bad = await holdingOf(customer.badSeq);
    expect(good.onHand - goodBefore.onHand).toBe(SELLABLE_QTY);
    expect(good.damaged - goodBefore.damaged).toBe(0);
    expect(bad.damaged - badBefore.damaged).toBe(DAMAGED_QTY);
    expect(bad.onHand - badBefore.onHand).toBe(0);

    // One return-in Movement per line, against the return, by the operator.
    const { rows: moves } = await pool.query(
      `SELECT type, qty_change, user_id, ref_type FROM movements WHERE ref_id = $1 ORDER BY seq`,
      [customer.id],
    );
    expect(moves).toHaveLength(2);
    for (const m of moves) {
      expect(m.type).toBe("return-in");
      expect(m.ref_type).toBe("return");
      expect(m.user_id).toBe(customer.operatorId);
    }
    expect(moves.map((m) => m.qty_change).sort((a, b) => a - b)).toEqual([0, SELLABLE_QTY]);

    // The return is visible from the sales order it was raised against.
    await page.goto(customer.sourceHref);
    const section = page.locator("section", { hasText: "Returns against this order" });
    await expect(section.getByText(customer.id)).toBeVisible();
    await expect(section.getByText("Received")).toBeVisible();
  });

  test("a supplier return takes the goods out of stock", async ({ page, context }) => {
    await actAs(context, "purchasing-manager");

    const before = await holdingOf(supplier.drawnSeq);

    await processReturnViaUi(page, "/purchasing/returns", supplier.id, /Send back to supplier/i);

    const drawn = await holdingOf(supplier.drawnSeq);
    expect(drawn.onHand - before.onHand).toBe(-SUPPLIER_QTY);

    const { rows: moves } = await pool.query(
      `SELECT type, qty_change, user_id FROM movements WHERE ref_id = $1`,
      [supplier.id],
    );
    expect(moves).toHaveLength(1);
    expect(moves[0].type).toBe("return-out");
    expect(moves[0].qty_change).toBe(-SUPPLIER_QTY);
    expect(moves[0].user_id).toBe(supplier.operatorId);

    // The return is visible from the purchase order it was raised against.
    await page.goto(supplier.sourceHref);
    const section = page.locator("section", { hasText: "Returns against this order" });
    await expect(section.getByText(supplier.id)).toBeVisible();
    await expect(section.getByText("Received")).toBeVisible();
  });
});
