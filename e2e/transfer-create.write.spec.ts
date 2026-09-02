/**
 * Raising a transfer, end to end (ticket 08) — the creation flow whose whole
 * point is what it does *not* do.
 *
 * A warehouse manager fills the form, submits it, and a real Transfer exists in
 * `draft` between two Warehouses. Creation moves no stock and puts nothing in
 * transit: the detail page shows the transfer's lines with nothing despatched
 * and nothing received, and the movement ledger has no row for it. Despatching
 * is what starts the in-transit quantity, and that only happens after approval.
 *
 * The numeric half of that (the in-transit projection unchanged after creation,
 * up by the transfer's quantity once it is approved and despatched), the
 * refusal for a Role reaching the domain function directly, and the refusal of
 * a route the form would never offer are `npm run check:transfers` — Playwright
 * always goes through the form.
 *
 * The transfer this spec creates is deleted in `afterAll`, so the read suite
 * still sees exactly the seeded world.
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
 * Pick a source site that actually holds something and add its first product.
 * The product list is filtered to what the selected source holds, and the seed
 * does not guarantee the first site has anything, so try each in turn.
 */
async function addFirstAvailableProduct(page: Page): Promise<void> {
  const siteCount = await (async () => {
    await page.locator("#from").click();
    const n = await page.getByRole("option").count();
    await page.keyboard.press("Escape");
    return n;
  })();

  for (let i = 0; i < Math.min(siteCount, 8); i += 1) {
    await page.locator("#from").click();
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
  throw new Error("no warehouse in the seed holds stock that can be transferred out");
}

/** Ledger rows mentioning a transfer number — raising one adds none. */
async function ledgerRowsFor(page: Page, query: string): Promise<number> {
  await page.goto(`/inventory/movements?q=${encodeURIComponent(query)}`);
  return page.locator("main tbody tr").filter({ hasText: query }).count();
}

test.describe("raising a transfer", () => {
  test("a transfer is raised as a draft that moves nothing and puts nothing in transit", async ({
    page,
    context,
  }) => {
    // A creation and two navigations, each its own round trip.
    test.slow();
    await actAs(context, "inventory-manager");
    await page.goto("/warehousing/transfers/new");
    const main = page.locator("main");
    await expect(main.getByRole("heading", { name: "New stock transfer" })).toBeVisible();

    await addFirstAvailableProduct(page);
    await main.getByRole("button", { name: "Create transfer" }).click();

    // The action redirects to the new transfer, so its id is in the URL.
    await page.waitForURL(/\/warehousing\/transfers\/TR-[0-9A-F]{8}$/, { timeout: 30_000 });

    const number = await main.getByText(/^TR-\d{4}-\d{3}$/).first().innerText();
    expect(number).toMatch(/^TR-\d{4}-\d{3}$/);

    // Numbered, in draft, with its line — and nothing has moved: the line is
    // despatched nowhere and received nowhere, and no Movement mentions it.
    await expect(main.getByText("Draft").first()).toBeVisible();
    await expect(main.locator("tbody tr")).not.toHaveCount(0);
    await expect(main.getByText("not put away").first()).toBeVisible();
    expect(await ledgerRowsFor(page, number)).toBe(0);
  });

  test("a role that cannot raise transfers never sees the form", async ({ page, context }) => {
    await actAs(context, "auditor");
    await page.goto("/warehousing/transfers/new");
    const main = page.locator("main");

    await expect(
      main.getByRole("heading", { name: /do not have access to Stock transfers/i }),
    ).toBeVisible();
    await expect(main.getByRole("button", { name: "Create transfer" })).toHaveCount(0);
  });
});

test.afterAll(async () => {
  if (!process.env.DATABASE_URL) return;
  neonConfig.webSocketConstructor = ws;
  const db = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  try {
    // Created ids are `TR-` plus eight hex characters (`lib/domain/reference.ts`
    // `newId`); every seeded transfer is `TR-` plus three digits, so this only
    // ever removes transfers these tests raised — including one left behind by
    // an earlier interrupted run. A draft moves no stock, so nothing else has
    // to be reversed.
    //
    // Their `transfer-created` Events stay: the stream is append-only, so a
    // replay per ADR-0003 would rebuild these transfers. That is the same trade
    // the check script makes.
    await db.query("DELETE FROM transfer_lines WHERE transfer_id ~ '^TR-[0-9A-F]{8}$'");
    await db.query("DELETE FROM transfers WHERE id ~ '^TR-[0-9A-F]{8}$'");
  } finally {
    await db.end();
  }
});
