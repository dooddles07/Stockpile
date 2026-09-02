/**
 * Dismissing a notification (ticket 12, spec story 24).
 *
 * The notifications page grows a dismiss control on every row. Dismissing is one
 * column write through `dismissNotification`; the row then leaves every feed —
 * the page and the top-bar bell both read the accessor that filters `dismissed`
 * out — and stays gone across a reload.
 *
 * The below-UI guards — a Role without dashboard access refused, an unknown id
 * refused, neither writing anything, and an idempotent repeat — are
 * `npm run check:notifications`. Playwright only ever sees the page with its
 * dismiss control already rendered.
 *
 * `afterAll` clears the flag on everything it set, so the read suite still sees
 * the full seeded inbox (CI reseeds every run; this keeps a persistent local
 * branch stable).
 */

import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import type { BrowserContext } from "@playwright/test";

import { test, expect } from "./fixtures";

let pool: Pool;

async function actAs(context: BrowserContext, role: string) {
  await context.addCookies([
    { name: "stockpile-role", value: role, domain: "localhost", path: "/" },
  ]);
}

test.beforeAll(async () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  neonConfig.webSocketConstructor = ws;
  pool = new Pool({ connectionString, max: 2 });
});

test.afterAll(async () => {
  if (!pool) return;
  try {
    await pool.query(`UPDATE notifications SET dismissed = false WHERE dismissed = true`);
  } finally {
    await pool.end();
  }
});

test("a notification is dismissed and stays dismissed", async ({ page, context, main }) => {
  test.slow();
  await actAs(context, "inventory-manager");

  await page.goto("/notifications");
  await expect(main.getByRole("heading", { name: "Notifications" })).toBeVisible();

  const rows = main.locator("li").filter({ has: page.getByRole("button", { name: /^Dismiss:/ }) });
  const before = await rows.count();
  expect(before).toBeGreaterThan(0);

  await rows.first().getByRole("button", { name: /^Dismiss:/ }).click();

  // One fewer row once the write lands.
  await expect(rows).toHaveCount(before - 1, { timeout: 15_000 });

  // Still one fewer on a fresh load — the dismissal persisted.
  await page.goto("/notifications");
  await expect(
    main.locator("li").filter({ has: page.getByRole("button", { name: /^Dismiss:/ }) }),
  ).toHaveCount(before - 1);
});
