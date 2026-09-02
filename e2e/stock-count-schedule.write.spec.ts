/**
 * Scheduling a Stock Count, end to end (ticket 09) — the flow where a scope
 * becomes a real count in `scheduled` with its lines already fixed.
 *
 * A warehouse manager picks a site, leaves the default cycle scope, assigns a
 * counter, submits, and lands on the new count reading "Scheduled". Its sheet
 * opens with the expected lines already present — captured from the scope at
 * scheduling time, not resolved when the tab is opened — and that is what the
 * ticket calls out as the interesting decision, so this is the one thing
 * Playwright is well placed to see: the sheet a counter actually opens.
 *
 * The permission refusal for a Role reaching `scheduleStockCount` directly, the
 * refusal of a scope with no holdings, and the Event/number/transaction
 * guarantees are `npm run check:counts` — Playwright always goes through the
 * form.
 *
 * The count this spec creates is deleted in `afterAll`, so the read suite
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
 * Pick a site that actually has a counter to assign — a site with no
 * `warehouse-staff` assigned (and no site-agnostic one) offers nothing to
 * check, and the form refuses to submit with nobody assigned.
 */
async function assignFirstAvailableCounter(page: Page): Promise<void> {
  const siteCount = await (async () => {
    await page.locator("#warehouse").click();
    const n = await page.getByRole("option").count();
    await page.keyboard.press("Escape");
    return n;
  })();

  for (let i = 0; i < Math.min(siteCount, 8); i += 1) {
    await page.locator("#warehouse").click();
    await page.getByRole("option").nth(i).click();

    const counters = page.getByRole("checkbox");
    if ((await counters.count()) === 0) continue;
    await counters.first().click();
    return;
  }
  throw new Error("no warehouse in the seed has a counter to assign");
}

test.describe("scheduling a stock count", () => {
  test("a count is scheduled with lines materialised from the scope at that moment", async ({
    page,
    context,
  }) => {
    // A scheduling and two navigations, each its own round trip.
    test.slow();
    await actAs(context, "inventory-manager");
    await page.goto("/inventory/counts/new");
    const main = page.locator("main");
    await expect(main.getByRole("heading", { name: "Schedule a stock count" })).toBeVisible();

    await assignFirstAvailableCounter(page);
    await main.getByRole("button", { name: "Schedule count" }).click();

    // The form navigates to the new count on success, so its id is in the URL.
    await page.waitForURL(/\/inventory\/counts\/SC-[0-9A-F]{8}$/, { timeout: 30_000 });
    await expect(main.getByText("Scheduled").first()).toBeVisible();

    // The sheet opens with its lines already there — materialised at
    // scheduling time, not resolved lazily now that the tab is open.
    await main.getByRole("tab", { name: "Count sheet" }).click();
    await expect(main.getByRole("heading", { name: "Count sheet" })).toBeVisible();
    await expect(main.locator("ul.divide-y > li")).not.toHaveCount(0);
  });

  test("a role that cannot schedule counts never sees the form", async ({ page, context }) => {
    await actAs(context, "auditor");
    await page.goto("/inventory/counts/new");
    const main = page.locator("main");

    await expect(
      main.getByRole("heading", { name: /do not have access to Stock counts/i }),
    ).toBeVisible();
    await expect(main.getByRole("button", { name: "Schedule count" })).toHaveCount(0);
  });
});

test.afterAll(async () => {
  if (!process.env.DATABASE_URL) return;
  neonConfig.webSocketConstructor = ws;
  const db = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  try {
    // Created ids are `SC-` plus eight hex characters (`lib/domain/reference.ts`
    // `newId`); every seeded count is `SC-` plus three digits, so this only
    // ever removes counts this spec scheduled — including one left behind by
    // an earlier interrupted run. Scheduling moves no stock, so nothing else
    // has to be reversed.
    //
    // Their `stock-count-scheduled` Events stay: the stream is append-only, so
    // a replay per ADR-0003 would rebuild these counts. That is the same
    // trade the check script makes.
    await db.query("DELETE FROM count_lines WHERE stock_count_id ~ '^SC-[0-9A-F]{8}$'");
    await db.query("DELETE FROM stock_counts WHERE id ~ '^SC-[0-9A-F]{8}$'");
  } finally {
    await db.end();
  }
});
