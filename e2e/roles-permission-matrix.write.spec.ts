/**
 * Editing a Role's permission matrix, end to end (ticket 13).
 *
 * ADR-0004 said roles are "editable at runtime through the admin UI"; until this
 * ticket the editor reported the diff accurately and saved nothing. Here an
 * admin narrows one module on a Role, and on the next request that Role is
 * refused the page it used to reach — the write lands through
 * `updateRolePermissions` and the existing `hydrateRoles` picks it up with no
 * cache to bust.
 *
 * The below-UI guards — a Role without `roles: manage` refused at the domain
 * function, and the last holder of `roles: manage` blocked from dropping it —
 * are `npm run check:roles`. Playwright only ever drives the editor.
 *
 * `afterAll` restores the seeded level so the read suite and the other write
 * specs still see Inventory Manager with its adjustments access.
 */

import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import type { BrowserContext } from "@playwright/test";

import { test, expect } from "./fixtures";

let pool: Pool;

async function actAs(context: BrowserContext, role: string) {
  await context.clearCookies();
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
    await pool.query(
      `UPDATE roles SET permissions = permissions || '{"adjustments":"approve"}'::jsonb WHERE id = 'inventory-manager'`,
    );
    await pool.query(`DELETE FROM audit_entries WHERE device = 'admin permission editor'`);
  } finally {
    await pool.end();
  }
});

test("an admin narrows a role and that role is refused the page on its next request", async ({
  page,
  context,
  main,
}) => {
  test.slow();

  // Before: Inventory Manager reaches Stock adjustments.
  await actAs(context, "inventory-manager");
  await page.goto("/inventory/adjustments");
  await expect(main.getByRole("heading", { name: "Stock adjustments" })).toBeVisible();

  // An admin opens the editor and takes that module to No access.
  await actAs(context, "super-admin");
  await page.goto("/admin/roles/inventory-manager/edit");
  await expect(main.getByRole("heading", { name: "Edit Inventory Manager" })).toBeVisible();

  await main.getByRole("combobox", { name: "Access to Stock adjustments" }).click();
  await page.getByRole("option", { name: "No access", exact: true }).click();

  await main.getByRole("button", { name: "Save permissions" }).click();
  await page.waitForURL(/\/admin\/roles\/inventory-manager$/, { timeout: 20_000 });

  // After: the same Role, next request, is refused — enforcement is in the
  // matrix the domain reads, not the button that was hidden.
  await actAs(context, "inventory-manager");
  await page.goto("/inventory/adjustments");
  await expect(
    main.getByRole("heading", { name: /do not have access to Stock adjustments/i }),
  ).toBeVisible();
});
