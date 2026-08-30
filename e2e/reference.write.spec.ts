/**
 * Reference data creation and editing, end to end (ticket 11).
 *
 * Covers the acceptance criterion "creating and editing at least one record of
 * each kind, and a permission refusal": one create and one edit driven through
 * the real form for Products, Categories, Suppliers, Customers, Warehouses and
 * Locations, plus a Role that is refused the create screen.
 *
 * These are reference-data writes — plain rows, no Events, no choke point
 * (ADR-0002) — so unlike the adjustment suite there is no stock to restore.
 * Instead:
 *   - every edit is a round trip: change one field, assert it saved, change it
 *     back, so the seeded record the read suite asserts against is untouched;
 *   - every create tags its row with an `E2E` marker and `afterAll` deletes
 *     them, so a re-run against the same branch starts clean.
 *
 * The "refused even when reaching the domain function directly" half of the
 * permission criterion is `npm run check:reference`, since Playwright can only
 * ever reach the form.
 */

import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import type { Locator, Page } from "@playwright/test";

import { test, expect } from "./fixtures";

const STAMP = Date.now();
const SHORT = String(STAMP).slice(-6);

// Deterministic seed ids to edit (zero-padded by the generator; the same
// hardcoding the adjustment suite relies on for SKUs and site codes).
const SEED = {
  category: "CAT-001",
  supplier: "SUP-001",
  customer: "CUS-001",
  warehouse: "WH-01",
  location: "LOC-0001",
  productSku: "PPE-BOT-186",
};

/**
 * Set a form field's value, tolerating the client form still hydrating. Clear
 * first (a `fill` that lands mid-hydration can otherwise concatenate onto a
 * suggested default like a SKU or supplier code), assert it cleared, then type.
 */
async function setField(field: Locator, value: string) {
  await field.click();
  await field.press("ControlOrMeta+a");
  await field.press("Backspace");
  await expect(field).toHaveValue("");
  await field.fill(value);
  await expect(field).toHaveValue(value);
}

/** A field the client form fills on hydration — wait for that before reading. */
async function hydratedValue(field: Locator): Promise<string> {
  await expect(field).not.toHaveValue("");
  return field.inputValue();
}

/** Click the submit button and wait for the redirect to `url`. */
async function submitTo(page: Page, buttonName: string, url: string | RegExp) {
  await Promise.all([
    page.waitForURL(url),
    page.locator("main").getByRole("button", { name: buttonName }).click(),
  ]);
}

test.describe("reference data — create and edit", () => {
  test.describe.configure({ mode: "serial" });

  test("a category can be created and edited", async ({ page, main }) => {
    await page.goto("/inventory/categories/new");
    await setField(main.locator("#name"), `E2E ${STAMP} Category`);
    await setField(
      main.locator("#description"),
      "Created by the ticket 11 end-to-end suite to prove the write path.",
    );
    await submitTo(page, "Create category", /\/inventory\/categories$/);

    const editUrl = `/inventory/categories/${SEED.category}/edit`;
    await page.goto(editUrl);
    const original = await hydratedValue(main.locator("#description"));
    await setField(main.locator("#description"), `${original} (touched by e2e)`);
    await submitTo(page, "Save changes", /\/inventory\/categories$/);

    await page.goto(editUrl);
    await expect(main.locator("#description")).toHaveValue(`${original} (touched by e2e)`);
    await setField(main.locator("#description"), original);
    await submitTo(page, "Save changes", /\/inventory\/categories$/);
  });

  test("a supplier can be created and edited", async ({ page, main }) => {
    await page.goto("/purchasing/suppliers/new");
    await setField(main.locator("#code"), `E2E-${SHORT}`);
    await setField(main.locator("#name"), `E2E Supplies ${STAMP}`);
    await setField(main.locator("#contactName"), "Dana Reeve");
    await setField(main.locator("#email"), "e2e@example.com");
    await setField(main.locator("#phone"), "555 0100");
    await setField(main.locator("#addressLine"), "1 Test Way");
    await setField(main.locator("#city"), "Columbus");
    // At least one catalogue category is required. Base UI's checkbox is the
    // button inside the label; click it and confirm it took.
    const categoryToggle = main.locator(`label[for="cat-${SEED.category}"] [role="checkbox"]`);
    await categoryToggle.click();
    await expect(categoryToggle).toHaveAttribute("aria-checked", "true");
    await submitTo(page, "Add supplier", /\/purchasing\/suppliers$/);

    const editUrl = `/purchasing/suppliers/${SEED.supplier}/edit`;
    await page.goto(editUrl);
    const original = await hydratedValue(main.locator("#contactName"));
    await setField(main.locator("#contactName"), `${original} Jr`);
    await submitTo(page, "Save changes", new RegExp(`/purchasing/suppliers/${SEED.supplier}$`));

    await page.goto(editUrl);
    await expect(main.locator("#contactName")).toHaveValue(`${original} Jr`);
    await setField(main.locator("#contactName"), original);
    await submitTo(page, "Save changes", new RegExp(`/purchasing/suppliers/${SEED.supplier}$`));
  });

  test("a customer can be created and edited", async ({ page, main }) => {
    await page.goto("/sales/customers/new");
    await setField(main.locator("#code"), `E2E-${SHORT}`);
    await setField(main.locator("#name"), `E2E Retail ${STAMP}`);
    await setField(main.locator("#contactName"), "Priya Anand");
    await setField(main.locator("#email"), "e2e@example.com");
    await setField(main.locator("#phone"), "555 0111");
    await setField(main.locator("#city"), "Denver");
    await submitTo(page, "Add customer", /\/sales\/customers$/);

    const editUrl = `/sales/customers/${SEED.customer}/edit`;
    await page.goto(editUrl);
    const original = await hydratedValue(main.locator("#contactName"));
    await setField(main.locator("#contactName"), `${original} II`);
    await submitTo(page, "Save changes", new RegExp(`/sales/customers/${SEED.customer}$`));

    await page.goto(editUrl);
    await expect(main.locator("#contactName")).toHaveValue(`${original} II`);
    await setField(main.locator("#contactName"), original);
    await submitTo(page, "Save changes", new RegExp(`/sales/customers/${SEED.customer}$`));
  });

  test("a warehouse can be created and edited", async ({ page, main }) => {
    await page.goto("/warehousing/warehouses/new");
    await setField(main.locator("#code"), `E2E${String(STAMP).slice(-4)}`);
    await setField(main.locator("#name"), `E2E Distribution ${STAMP}`);
    await setField(main.locator("#addressLine"), "9 Warehouse Row");
    await setField(main.locator("#city"), "Reno");
    await setField(main.locator("#region"), "Nevada");
    await submitTo(page, "Create site", /\/warehousing\/warehouses$/);

    const editUrl = `/warehousing/warehouses/${SEED.warehouse}/edit`;
    await page.goto(editUrl);
    const original = await hydratedValue(main.locator("#addressLine"));
    await setField(main.locator("#addressLine"), `${original} Unit B`);
    await submitTo(page, "Save changes", new RegExp(`/warehousing/warehouses/${SEED.warehouse}$`));

    await page.goto(editUrl);
    await expect(main.locator("#addressLine")).toHaveValue(`${original} Unit B`);
    await setField(main.locator("#addressLine"), original);
    await submitTo(page, "Save changes", new RegExp(`/warehousing/warehouses/${SEED.warehouse}$`));
  });

  test("a location can be created and edited", async ({ page, main }) => {
    await page.goto("/warehousing/locations/new");
    await setField(main.locator("#zone"), "E2E");
    await setField(main.locator("#aisle"), "A1");
    await setField(main.locator("#rack"), "R1");
    await setField(main.locator("#bin"), String(STAMP).slice(-3));
    await submitTo(page, "Add location", /\/warehousing\/locations$/);

    const editUrl = `/warehousing/locations/${SEED.location}/edit`;
    await page.goto(editUrl);
    const original = await hydratedValue(main.locator("#capacityUnits"));
    const bumped = String(Number(original) + 1);
    await setField(main.locator("#capacityUnits"), bumped);
    await submitTo(page, "Save changes", /\/warehousing\/locations$/);

    await page.goto(editUrl);
    await expect(main.locator("#capacityUnits")).toHaveValue(bumped);
    await setField(main.locator("#capacityUnits"), original);
    await submitTo(page, "Save changes", /\/warehousing\/locations$/);
  });

  test("a product can be created and edited", async ({ page, main }) => {
    await page.goto("/inventory/products/new");
    await setField(main.locator("#sku"), `E2E-${String(STAMP).slice(-7)}`);
    await setField(main.locator("#name"), `E2E Test Product ${STAMP}`);
    await setField(main.locator("#brand"), "E2E Brand");
    await setField(main.locator("#unitCost"), "10");
    await setField(main.locator("#sellPrice"), "20");
    await submitTo(page, "Create product", /\/inventory\/products$/);

    const editUrl = `/inventory/products/${SEED.productSku}/edit`;
    await page.goto(editUrl);
    const original = await hydratedValue(main.locator("#description"));
    await setField(main.locator("#description"), `${original} (e2e)`);
    await submitTo(page, "Save changes", new RegExp(`/inventory/products/${SEED.productSku}$`));

    await page.goto(editUrl);
    await expect(main.locator("#description")).toHaveValue(`${original} (e2e)`);
    await setField(main.locator("#description"), original);
    await submitTo(page, "Save changes", new RegExp(`/inventory/products/${SEED.productSku}$`));
  });

  test("a role without the permission never sees the create form", async ({ page, context, main }) => {
    await context.addCookies([
      { name: "stockpile-role", value: "auditor", domain: "localhost", path: "/" },
    ]);
    await page.goto("/inventory/categories/new");
    await expect(
      main.getByRole("heading", { name: /do not have access to Categories/i }),
    ).toBeVisible();
    await expect(main.getByRole("button", { name: "Create category" })).toHaveCount(0);
  });
});

test.afterAll(async () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return;
  neonConfig.webSocketConstructor = ws;
  const pool = new Pool({ connectionString, max: 2 });
  try {
    // Created rows are leaves (the E2E product uses a seeded category/supplier,
    // the E2E location a seeded warehouse), so delete order does not matter.
    await pool.query("DELETE FROM products WHERE sku LIKE 'E2E-%'");
    await pool.query("DELETE FROM locations WHERE code LIKE 'E2E-%'");
    await pool.query("DELETE FROM categories WHERE name LIKE 'E2E %'");
    await pool.query("DELETE FROM suppliers WHERE code LIKE 'E2E-%'");
    await pool.query("DELETE FROM customers WHERE code LIKE 'E2E-%'");
    await pool.query("DELETE FROM warehouses WHERE code LIKE 'E2E%'");
  } finally {
    await pool.end();
  }
});
