/**
 * Company settings, end to end (ticket 16).
 *
 * The acceptance criterion: "End-to-end coverage exists for changing the company
 * name and seeing it rendered." An admin edits the name on the Company settings
 * page, and it then appears where the application names the company — here the
 * landing-page heading, which reads the stored value.
 *
 * The below-UI guards — a Role without `settings` edit refused at the domain
 * function, blank input refused, the audit row — are `npm run check:settings`.
 * Playwright only ever drives the form.
 *
 * `afterAll` restores the seeded values (and drops the audit rows this spec
 * caused) so the read suite and the daily-reset smoke run see the seed's
 * company name unchanged.
 */

import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

import { COMPANY_SETTINGS_SEED, SETTINGS_ROW_ID } from "@/lib/domain/settings";
import { test, expect } from "./fixtures";

const NEW_NAME = "Northwind Traders E2E";

let pool: Pool;

test.beforeAll(async () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  neonConfig.webSocketConstructor = ws;
  pool = new Pool({ connectionString, max: 2 });
});

test.afterAll(async () => {
  if (!pool) return;
  try {
    await pool.query(`UPDATE settings SET company_name = $1, company_address = $2 WHERE id = $3`, [
      COMPANY_SETTINGS_SEED.companyName,
      COMPANY_SETTINGS_SEED.companyAddress,
      SETTINGS_ROW_ID,
    ]);
    await pool.query(`DELETE FROM audit_entries WHERE device = 'company settings page'`);
  } finally {
    await pool.end();
  }
});

test("an admin changes the company name and it renders where the app names the company", async ({
  page,
  main,
}) => {
  test.slow();

  await page.goto("/settings/company");
  await expect(main.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();

  const nameField = main.locator("#companyName");
  await expect(nameField).toHaveValue(COMPANY_SETTINGS_SEED.companyName);
  await nameField.click();
  await nameField.press("ControlOrMeta+a");
  await nameField.press("Backspace");
  await nameField.fill(NEW_NAME);

  await main.getByRole("button", { name: "Save changes" }).click();

  // A fresh load proves the write committed: the field reads the stored value.
  await expect(async () => {
    await page.goto("/settings/company");
    await expect(main.locator("#companyName")).toHaveValue(NEW_NAME);
  }).toPass({ timeout: 30_000 });

  // And it renders where the application names the company.
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: NEW_NAME })).toBeVisible();
});
