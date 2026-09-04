/**
 * Placing a sales order, end to end (ticket 07) — the creation flow whose whole
 * point is what it does *not* do.
 *
 * A sales officer fills the form, submits it, and a real Sales Order exists in
 * `draft`. A draft is not in the open set the reserved projection sums, so
 * nothing is reserved: the detail page's timeline has no "Stock reserved at …"
 * entry and the movement ledger has no row for the order. Confirming that same
 * order on its own page is what reserves — the timeline entry appears and the
 * order becomes open — and it still moves no stock.
 *
 * The numeric half of that (the projection unchanged after creation, up by the
 * order's quantity after confirmation), the refusal for a Role reaching the
 * domain function directly, and the atomicity of a creation that fails partway
 * are `npm run check:fulfilment` — Playwright always goes through the form.
 *
 * The order this spec creates is deleted in `afterAll`: a confirmed order holds
 * a reservation, which would change what later specs find available.
 */

import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import type { BrowserContext, Page } from "@playwright/test";

import { test, expect } from "./fixtures";

async function actAs(context: BrowserContext, role: string) {
  await context.addCookies([
    { name: "stockpile-role", value: role, domain: "localhost", path: "/" },
  ]);
}

/**
 * Pick a site that actually has stock to sell and add its first product. The
 * line list is filtered to what is available at the selected warehouse, and the
 * seed does not guarantee the first one has anything, so try each in turn.
 */
async function addFirstAvailableProduct(page: Page): Promise<void> {
  const siteCount = await (async () => {
    await page.locator("#warehouse").click();
    const n = await page.getByRole("option").count();
    await page.keyboard.press("Escape");
    return n;
  })();

  for (let i = 0; i < Math.min(siteCount, 8); i += 1) {
    await page.locator("#warehouse").click();
    await page.getByRole("option").nth(i).click();

    await page.getByRole("button", { name: "Add product" }).click();
    const products = page.getByRole("option");
    if ((await products.count()) === 0) {
      await page.keyboard.press("Escape");
      continue;
    }
    await products.first().click();
    return;
  }
  throw new Error("no warehouse in the seed has stock available to sell");
}

/** Ledger rows mentioning an order number — a placement or a confirmation adds none. */
async function ledgerRowsFor(page: Page, query: string): Promise<number> {
  await page.goto(`/inventory/movements?q=${encodeURIComponent(query)}`);
  return page.locator("main tbody tr").filter({ hasText: query }).count();
}

test.describe("placing a sales order", () => {
  test("an order is placed as a draft that reserves nothing, then confirmed to reserve", async ({
    page,
    context,
  }) => {
    // A creation, two navigations and a confirmation, each its own round trip.
    test.slow();
    await actAs(context, "sales-manager");
    await page.goto("/sales/orders/new");
    const main = page.locator("main");
    await expect(main.getByRole("heading", { name: "New sales order" })).toBeVisible();

    await addFirstAvailableProduct(page);
    await main.getByRole("button", { name: "Place order" }).click();

    // The action redirects to the new order, so its id is in the URL.
    await page.waitForURL(/\/sales\/orders\/SO-[0-9A-F]{8}$/, { timeout: 30_000 });
    const url = page.url();

    const number = await main.getByText(/^SO-\d{4}-\d{4}$/).first().innerText();
    expect(number).toMatch(/^SO-\d{4}-\d{4}$/);

    // Numbered, in draft, with its line — and nothing reserved: the timeline
    // records the placement only, and no stock moved.
    await expect(main.getByText("Draft").first()).toBeVisible();
    await expect(main.locator("tbody tr")).not.toHaveCount(0);
    await expect(main.getByText(/Stock reserved at/)).toHaveCount(0);
    expect(await ledgerRowsFor(page, number)).toBe(0);

    // And it is in the list with everything else.
    await page.goto(`/sales/orders?q=${encodeURIComponent(number)}`);
    const row = page.locator("main tbody tr").filter({ hasText: number });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("Draft");

    // Confirming the order it just placed is what reserves the stock.
    await page.goto(url);
    await main.getByRole("button", { name: "Confirm order" }).click();
    await expect(main.getByRole("button", { name: "Confirming…" })).toHaveCount(0, {
      timeout: 20_000,
    });

    await page.goto(`/sales/orders?q=${encodeURIComponent(number)}`);
    await expect(page.locator("main tbody tr").filter({ hasText: number })).toContainText(
      "Confirmed",
    );

    // Reserved moved; stock did not. Navigate to overview tab where the timeline lives.
    await page.goto(`${url}?tab=overview`);
    await expect(main.getByText(/Stock reserved at/)).toBeVisible();
    expect(await ledgerRowsFor(page, number)).toBe(0);
  });

  test("a role that cannot place sales orders never sees the form", async ({ page, context }) => {
    await actAs(context, "warehouse-staff");
    await page.goto("/sales/orders/new");
    const main = page.locator("main");

    await expect(
      main.getByRole("heading", { name: /do not have access to Sales orders/i }),
    ).toBeVisible();
    await expect(main.getByRole("button", { name: "Place order" })).toHaveCount(0);
  });
});

test.afterAll(async () => {
  if (!process.env.DATABASE_URL) return;
  neonConfig.webSocketConstructor = ws;
  const db = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  try {
    // Created ids are `SO-` plus eight hex characters (`lib/domain/reference.ts`
    // `newId`); every seeded order is `SO-` plus four digits, so this only ever
    // removes orders these tests placed — including one left behind by an
    // earlier interrupted run. A confirmed one holds a reservation, so leaving
    // it would change what later specs find available.
    //
    // Their `sales-order-created` Events stay: the stream is append-only, so a
    // replay per ADR-0003 would rebuild these orders. That is the same trade
    // the check script makes, and the reason cleanup deletes rather than
    // cancels — a cancelled order reserves nothing but still shows in the list.
    await db.query(
      "DELETE FROM sales_order_lines WHERE sales_order_id ~ '^SO-[0-9A-F]{8}$'",
    );
    await db.query("DELETE FROM sales_orders WHERE id ~ '^SO-[0-9A-F]{8}$'");
  } finally {
    await db.end();
  }
});
