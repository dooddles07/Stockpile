/**
 * Raising a purchase order, end to end (ticket 06) — the first creation flow.
 *
 * Covers what the ticket asks for: a purchasing officer fills the form, submits
 * it, and a real Purchase Order exists — numbered, attributed, with its lines,
 * in `draft` — reachable on its own detail page and listed with the rest. The
 * permission refusal has two halves: the render gate is checked here, and the
 * domain-level refusal for a caller reaching the domain function directly is
 * `npm run check:purchasing`, since Playwright only ever goes through the form.
 *
 * Nothing is restored afterwards, unlike the stock-moving suites. A `draft`
 * order moves no stock and is not open, so it contributes nothing incoming and
 * changes no balance another spec asserts on; it only adds a row to the
 * purchase orders list, which is filtered by its own number here.
 */

import type { BrowserContext, Page } from "@playwright/test";

import { test, expect } from "./fixtures";

/**
 * The five users with the `purchasing-manager` Role in the fixed seed. Which of
 * them a request acts as depends on which are `active`, so the order is
 * attributed to one of these rather than to a named one — what matters is that
 * a real Actor's name is on it (ADR-0004) rather than nobody's.
 */
const PURCHASING_MANAGERS = /Fatima Al-Sayed|Petr Novák|Anjali Kapoor|Liam O'Connor|Zara Ahmed/;

async function actAs(context: BrowserContext, role: string) {
  await context.addCookies([
    { name: "stockpile-role", value: role, domain: "localhost", path: "/" },
  ]);
}

/**
 * Select a supplier that actually has a catalogue and add its first product.
 * The lines are filtered to what the selected supplier provides, and the seed
 * does not guarantee that the first supplier alphabetically supplies anything,
 * so try each in turn rather than hardcoding one.
 */
async function addFirstAvailableProduct(page: Page): Promise<void> {
  const supplierCount = await (async () => {
    await page.locator("#supplier").click();
    const n = await page.getByRole("option").count();
    await page.keyboard.press("Escape");
    return n;
  })();

  for (let i = 0; i < Math.min(supplierCount, 8); i += 1) {
    await page.locator("#supplier").click();
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
  throw new Error("no supplier in the seed has a catalogue to order from");
}

test.describe("raising a purchase order", () => {
  test("a purchasing officer raises an order and finds it on its detail page", async ({
    page,
    context,
  }) => {
    await actAs(context, "purchasing-manager");
    await page.goto("/purchasing/purchase-orders/new");
    const main = page.locator("main");
    await expect(main.getByRole("heading", { name: "New purchase order" })).toBeVisible();

    await addFirstAvailableProduct(page);
    await main.getByRole("button", { name: "Create order" }).click();

    // The action redirects to the new order, so its number is in the URL's page.
    await page.waitForURL(/\/purchasing\/purchase-orders\/PO-[0-9A-F]{8}$/, { timeout: 30_000 });

    const number = await main.getByText(/^PO-\d{4}-\d{4}$/).first().innerText();
    expect(number).toMatch(/^PO-\d{4}-\d{4}$/);

    // Numbered, in draft, with its line and the officer's name on it.
    await expect(main.getByText("Draft").first()).toBeVisible();
    await expect(main).toContainText(PURCHASING_MANAGERS);
    await expect(main.locator("tbody tr")).not.toHaveCount(0);

    // And it is in the list with everything else.
    await page.goto(`/purchasing/purchase-orders?q=${encodeURIComponent(number)}`);
    const row = page.locator("main tbody tr").filter({ hasText: number });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("Draft");
  });

  test("a role that cannot raise purchase orders never sees the form", async ({ page, context }) => {
    await actAs(context, "warehouse-staff");
    await page.goto("/purchasing/purchase-orders/new");
    const main = page.locator("main");

    await expect(
      main.getByRole("heading", { name: /do not have access to Purchase orders/i }),
    ).toBeVisible();
    await expect(main.getByRole("button", { name: "Create order" })).toHaveCount(0);
  });
});
