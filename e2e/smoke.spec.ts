/**
 * Behaviour baseline for the repository-seam refactor (phase 1 of the
 * database migration, see .scratch/repo-seam/spec.md).
 *
 * These assertions are recorded against the generated dataset in
 * lib/data/store.ts, which is built once per process from a fixed seed
 * (lib/data/rng.ts: `mulberry32` and the fixed `NOW` anchor). That seed is a
 * dependency of every value asserted below: changing the RNG seed, `NOW`, or
 * the fixtures in lib/data/catalog.ts invalidates these recorded values and
 * the suite must be re-recorded against the new baseline.
 *
 * The suite asserts on what a user sees — headings, totals, row order and
 * row content — not on repository function names or module structure, so it
 * survives the refactor this phase performs and the Postgres swap phase 2
 * performs after it.
 */

import { test, expect } from "@playwright/test";

test.describe("dashboard", () => {
  test("shows KPIs and operational queues", async ({ page }) => {
    await page.goto("/dashboard");
    const main = page.locator("main");

    await expect(main.getByRole("heading", { name: "Operations overview" })).toBeVisible();
    await expect(main.locator(".text-metric")).toHaveText([
      "$26.94M",
      "227",
      "29",
      "10",
      "17",
      "16",
      "16",
      "97.7%",
    ]);
    await expect(main.getByText("Stock transfer TR-2026-206")).toBeVisible();
    await expect(main.getByText("Mop & Bucket System Compact")).toBeVisible();
  });
});

test.describe("approvals", () => {
  test("totals the pending queue", async ({ page }) => {
    await page.goto("/approvals");
    const main = page.locator("main");

    await expect(main.getByRole("heading", { name: "Approvals" })).toBeVisible();
    await expect(main.getByText("$1,494,015")).toBeVisible();
    await expect(main.getByRole("link", { name: /Stock transfer TR-2026-206/ })).toBeVisible();
  });
});

test.describe("tasks", () => {
  test("totals open work", async ({ page }) => {
    await page.goto("/tasks");
    const main = page.locator("main");

    await expect(main.getByRole("heading", { name: "Tasks" })).toBeVisible();
    await expect(main.locator("[data-numeric]")).toHaveText(["12", "2", "1", "1"]);
  });
});

test.describe("notifications", () => {
  test("totals unread and critical counts", async ({ page }) => {
    await page.goto("/notifications");
    const main = page.locator("main");

    await expect(main.getByRole("heading", { name: "Notifications" })).toBeVisible();
    await expect(main.locator("[data-numeric]")).toHaveText(["12", "7", "2", "4"]);
  });
});

test.describe("inventory", () => {
  test("products table lists rows in rendered order", async ({ page }) => {
    await page.goto("/inventory/products");
    const main = page.locator("main");
    const rows = main.locator("tbody tr");

    await expect(main.getByRole("heading", { name: "Products" })).toBeVisible();
    await expect(rows).toHaveCount(25);
    await expect(rows.first()).toContainText("Desktop Label Printer 300 dpi");
    await expect(rows.first()).toContainText("BCL-DLP-111");
    await expect(main.getByText("Page 1 of 11")).toBeVisible();
  });

  test("stock levels shows totals and rows in rendered order", async ({ page }) => {
    await page.goto("/inventory/stock-levels");
    const main = page.locator("main");
    const rows = main.locator("tbody tr");

    await expect(main.getByRole("heading", { name: "Stock levels" })).toBeVisible();
    await expect(rows).toHaveCount(50);
    await expect(rows.first()).toContainText("Lumen Works Wireless Barcode Scanner");
    await expect(rows.first()).toContainText("BCL-SCN-104");
    await expect(main.getByText("Page 1 of 13")).toBeVisible();
  });
});

test.describe("warehousing", () => {
  test("lists sites with capacity figures", async ({ page }) => {
    await page.goto("/warehousing/warehouses");
    const main = page.locator("main");

    await expect(main.getByRole("heading", { name: "Warehouses", exact: true })).toBeVisible();
    await expect(main.getByText("6 sites holding 171,243 units.")).toBeVisible();
    await expect(main.getByText("Riverside Fulfillment Center")).toBeVisible();
  });
});

test.describe("purchasing", () => {
  test("purchase orders table lists rows in rendered order", async ({ page }) => {
    await page.goto("/purchasing/purchase-orders");
    const main = page.locator("main");
    const rows = main.locator("tbody tr");

    await expect(main.getByRole("heading", { name: "Purchase orders" })).toBeVisible();
    await expect(rows).toHaveCount(25);
    await expect(rows.first()).toContainText("PO-2026-1000");
    await expect(rows.first()).toContainText("Vantage Logistics Supply");
    await expect(main.getByText("Page 1 of 8")).toBeVisible();
  });
});

test.describe("sales", () => {
  test("orders table lists rows in rendered order", async ({ page }) => {
    await page.goto("/sales/orders");
    const main = page.locator("main");
    const rows = main.locator("tbody tr");

    await expect(main.getByRole("heading", { name: "Sales orders" })).toBeVisible();
    await expect(rows).toHaveCount(50);
    await expect(rows.first()).toContainText("SO-2026-4005");
    await expect(rows.first()).toContainText("Marketplace Direct");
    await expect(main.getByText("Page 1 of 9")).toBeVisible();
  });
});

test.describe("analytics", () => {
  test("inventory analytics breaks stock down by health", async ({ page }) => {
    await page.goto("/analytics/inventory");
    const main = page.locator("main");
    const rows = main.locator("tbody tr");

    await expect(main.getByRole("heading", { name: "Inventory analytics" })).toBeVisible();
    await expect(main.getByText("$26,942,292")).toBeVisible();
    await expect(rows.first()).toContainText("Healthy");
    await expect(rows.first()).toContainText("99");
  });
});

test.describe("admin", () => {
  test("users table lists rows in rendered order", async ({ page }) => {
    await page.goto("/admin/users");
    const main = page.locator("main");
    const rows = main.locator("tbody tr");

    await expect(main.getByRole("heading", { name: "Users" })).toBeVisible();
    await expect(rows).toHaveCount(25);
    await expect(rows.first()).toContainText("Aisha Rahman");
    await expect(main.getByText("Page 1 of 2")).toBeVisible();
  });
});

test.describe("settings", () => {
  test("shows company profile and workspace stats", async ({ page }) => {
    await page.goto("/settings/company");
    const main = page.locator("main");

    await expect(main.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
    await expect(main.getByText("6 sites · 38 users · 266 SKUs.")).toBeVisible();
  });
});

test.describe("import", () => {
  test("shows the product import schema", async ({ page }) => {
    await page.goto("/import");
    const main = page.locator("main");

    await expect(main.getByRole("heading", { name: "Import data" })).toBeVisible();
    await expect(
      main.getByText("Add or update catalogue entries. Existing SKUs are updated, new ones created."),
    ).toBeVisible();
  });
});

test.describe("operator", () => {
  test("look-up screen", async ({ page }) => {
    await page.goto("/operator");
    await expect(page.locator("main").getByRole("heading", { name: "Look up a product", level: 2 })).toBeVisible();
  });

  test("approve queue matches the approvals total", async ({ page }) => {
    await page.goto("/operator/approve");
    const main = page.locator("main");

    await expect(main.getByText("32 decisions waiting, oldest first.")).toBeVisible();
    await expect(main.getByText("TR-2026-206")).toBeVisible();
  });

  test("receive queue lists incoming deliveries", async ({ page }) => {
    await page.goto("/operator/receive");
    await expect(page.locator("main").getByText("5 deliverys expected at DC-01, soonest first.")).toBeVisible();
  });
});
