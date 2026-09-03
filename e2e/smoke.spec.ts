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

import { test, expect } from "./fixtures";

/** Matches a row's text against every part, regardless of order or adjacency. */
function rowHas(...parts: string[]): RegExp {
  return new RegExp(parts.map((p) => `(?=.*${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`).join(""), "s");
}

test.describe("dashboard", () => {
  test("shows KPIs and operational queues", async ({ page, main }) => {
    await page.goto("/dashboard");

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
  test("totals the pending queue and lists it oldest first", async ({ page, main }) => {
    await page.goto("/approvals");

    await expect(main.getByRole("heading", { name: "Approvals" })).toBeVisible();
    await expect(main.getByText("$1,494,015")).toBeVisible();
    // The default session is Super Admin, who can decide on every queue, so the
    // oldest transfer renders in the decide list as text rather than a link.
    await expect(main.getByText(/Stock transfer TR-2026-206/)).toBeVisible();
  });
});

test.describe("notifications", () => {
  test("totals unread and critical counts", async ({ page, main }) => {
    await page.goto("/notifications");

    await expect(main.getByRole("heading", { name: "Notifications" })).toBeVisible();
    await expect(main.locator("[data-numeric]")).toHaveText(["12", "7", "2", "4"]);
  });
});

test.describe("inventory", () => {
  test("products table lists rows in rendered order", async ({ page, main }) => {
    await page.goto("/inventory/products");
    const rows = main.locator("tbody tr");

    await expect(main.getByRole("heading", { name: "Products" })).toBeVisible();
    await expect(rows).toHaveCount(25);
    await expect(rows.nth(0)).toContainText(rowHas("Desktop Label Printer 300 dpi", "BCL-DLP-111"));
    await expect(rows.nth(1)).toContainText(rowHas("Double Wall Carton 457×305×305", "PKG-CTD-209"));
    await expect(rows.nth(2)).toContainText(rowHas("Industrial Floor Cleaner Degreaser 5L", "FAC-CLN-320"));
    await expect(rows.nth(3)).toContainText(rowHas("Industrial Floor Cleaner Neutral pH 20L", "FAC-CLN-321"));
    await expect(main.getByText("Page 1 of 11")).toBeVisible();
  });

  test("stock levels shows totals and rows in rendered order", async ({ page, main }) => {
    await page.goto("/inventory/stock-levels");
    const rows = main.locator("tbody tr");

    await expect(main.getByRole("heading", { name: "Stock levels" })).toBeVisible();
    await expect(rows).toHaveCount(50);
    await expect(rows.nth(0)).toContainText(rowHas("Lumen Works Wireless Barcode Scanner", "BCL-SCN-104"));
    await expect(rows.nth(1)).toContainText(rowHas("Corvus Desktop Label Printer", "BCL-DLP-111"));
    await expect(rows.nth(2)).toContainText(rowHas("Palisade Direct Thermal Label Roll", "BCL-LBL-120", "B-03-01-03"));
    await expect(rows.nth(3)).toContainText(rowHas("Palisade Direct Thermal Label Roll", "BCL-LBL-120", "D-03-03-01"));
    await expect(main.getByText("Page 1 of 13")).toBeVisible();
  });
});

test.describe("warehousing", () => {
  test("lists sites with capacity figures", async ({ page, main }) => {
    await page.goto("/warehousing/warehouses");

    await expect(main.getByRole("heading", { name: "Warehouses", exact: true })).toBeVisible();
    await expect(main.getByText("6 sites holding 171,243 units.")).toBeVisible();
    await expect(main.getByText("Riverside Fulfillment Center")).toBeVisible();
  });
});

test.describe("purchasing", () => {
  test("purchase orders table lists rows in rendered order", async ({ page, main }) => {
    await page.goto("/purchasing/purchase-orders");
    const rows = main.locator("tbody tr");

    await expect(main.getByRole("heading", { name: "Purchase orders" })).toBeVisible();
    await expect(rows).toHaveCount(25);
    await expect(rows.nth(0)).toContainText(rowHas("PO-2026-1000", "Vantage Logistics Supply"));
    await expect(rows.nth(1)).toContainText(rowHas("PO-2026-1001", "Westbrook Metal Supply"));
    await expect(rows.nth(2)).toContainText(rowHas("PO-2026-1002", "Lumen Power Systems"));
    await expect(rows.nth(3)).toContainText(rowHas("PO-2026-1003", "Halcyon Tool Works"));
    await expect(main.getByText("Page 1 of 8")).toBeVisible();
  });
});

test.describe("sales", () => {
  test("orders table lists rows in rendered order", async ({ page, main }) => {
    await page.goto("/sales/orders");
    const rows = main.locator("tbody tr");

    await expect(main.getByRole("heading", { name: "Sales orders" })).toBeVisible();
    await expect(rows).toHaveCount(50);
    await expect(rows.nth(0)).toContainText(rowHas("SO-2026-4005", "Marketplace Direct"));
    await expect(rows.nth(1)).toContainText(rowHas("SO-2026-4030", "Copperfield Retail"));
    await expect(rows.nth(2)).toContainText(rowHas("SO-2026-4033", "Drayton Electrical"));
    await expect(rows.nth(3)).toContainText(rowHas("SO-2026-4149", "Sterling Facilities Management"));
    await expect(main.getByText("Page 1 of 9")).toBeVisible();
  });
});

test.describe("analytics", () => {
  test("inventory analytics breaks stock down by health, in rendered order", async ({ page, main }) => {
    await page.goto("/analytics/inventory");
    const rows = main.locator("tbody tr");

    await expect(main.getByRole("heading", { name: "Inventory analytics" })).toBeVisible();
    await expect(main.getByText("$26,942,292")).toBeVisible();
    await expect(rows.nth(0)).toContainText(rowHas("Healthy", "99"));
    await expect(rows.nth(1)).toContainText(rowHas("Low stock", "23"));
    await expect(rows.nth(2)).toContainText(rowHas("Critical", "6"));
    await expect(rows.nth(3)).toContainText(rowHas("Out of stock", "10"));
  });
});

test.describe("admin", () => {
  test("users table lists rows in rendered order", async ({ page, main }) => {
    await page.goto("/admin/users");
    const rows = main.locator("tbody tr");

    await expect(main.getByRole("heading", { name: "Users" })).toBeVisible();
    await expect(rows).toHaveCount(25);
    await expect(rows.nth(0)).toContainText("Aisha Rahman");
    await expect(rows.nth(1)).toContainText("Amara Okonkwo");
    await expect(rows.nth(2)).toContainText("Anjali Kapoor");
    await expect(rows.nth(3)).toContainText("Carlos Mendes");
    await expect(main.getByText("Page 1 of 2")).toBeVisible();
  });
});

test.describe("settings", () => {
  test("shows the stored company name and address", async ({ page, main }) => {
    await page.goto("/settings/company");

    await expect(main.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
    await expect(main.locator("#companyName")).toHaveValue("Stockpile");
    await expect(main.locator("#companyAddress")).toHaveValue(/Columbus, Ohio/);
  });
});

test.describe("import", () => {
  test("shows the product import schema", async ({ page, main }) => {
    await page.goto("/import");

    await expect(main.getByRole("heading", { name: "Import data" })).toBeVisible();
    await expect(
      main.getByText("Add or update catalogue entries. Existing SKUs are updated, new ones created."),
    ).toBeVisible();
  });

  test("flags a row whose SKU already exists in the dataset", async ({ page, main }) => {
    await page.goto("/import", { waitUntil: "networkidle" });

    // BCL-DLP-111 ("Desktop Label Printer 300 dpi") is a real product SKU
    // from the seeded dataset — this proves the wizard actually reads
    // db.products (via the existingKeys prop) rather than always treating
    // every row as a new record.
    await page.locator('input[type="file"]').setInputFiles({
      name: "products.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "sku,name,category,unit cost\nBCL-DLP-111,Desktop Label Printer,Barcode & Labelling,225.80\n",
      ),
    });
    await main.getByRole("button", { name: "Validate" }).click();

    const issueRow = main.locator("tbody tr").filter({ hasText: "already exists" });
    await expect(issueRow).toContainText("Warning");
    await expect(issueRow).toContainText("SKU \"BCL-DLP-111\" already exists and will be updated");
  });
});

test.describe("operator", () => {
  test("look-up screen", async ({ page }) => {
    await page.goto("/operator");
    await expect(page.locator("main").getByRole("heading", { name: "Look up a product", level: 2 })).toBeVisible();
  });

  test("scan screen is ready to scan", async ({ page, main }) => {
    await page.goto("/operator/scan");
    await expect(main.getByRole("heading", { name: "Scan a product" })).toBeVisible();
    await expect(main.getByText("Ready to scan")).toBeVisible();
  });

  test("approve queue matches the approvals total, oldest first", async ({ page, main }) => {
    await page.goto("/operator/approve");

    await expect(main.getByText("32 decisions waiting, oldest first.")).toBeVisible();
    await expect(main.getByText("TR-2026-206")).toBeVisible();
  });

  test("receive queue lists incoming deliveries", async ({ page, main }) => {
    await page.goto("/operator/receive");
    await expect(main.getByText("5 deliverys expected at DC-01, soonest first.")).toBeVisible();
  });
});
