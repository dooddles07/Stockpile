/**
 * Adjustment and damage, end to end (ticket 10) — the first write flow.
 *
 * Covers the three behaviours the spec names: the successful flow (an operator
 * records an adjustment and it lands in the ledger with their name on it),
 * damage moving quantity into the damaged balance, and an adjustment that would
 * drive on-hand below zero being rejected. The permission refusal has two
 * halves: the render gate is checked here, and the domain-level refusal for a
 * caller reaching the action directly is `npm run check:adjustments`, since
 * Playwright can only ever go through the form.
 *
 * These tests write to the seeded database. They target one deliberately chosen
 * holding — PPE-BOT-186 ("Steel-Toe Work Boot UK 12") at DC-03, which carries
 * thousands of units and sits far above its reorder point, so a handful of
 * units moves no health bucket — and each test restores the on-hand it spent,
 * the same courtesy `lib/domain/stock.checks.ts` extends to the recorded
 * assertions in the other suites.
 */

import type { BrowserContext, Page } from "@playwright/test";

import { test, expect } from "./fixtures";

const SKU = "PPE-BOT-186";
const WAREHOUSE = /^DC-03/;
const LOCATION_ROW = "A-03-02-03";

/** The representative user for the `warehouse-staff` role in the fixed seed. */
const OPERATOR = "Aisha Rahman";

async function actAs(context: BrowserContext, role: string) {
  await context.addCookies([
    { name: "stockpile-role", value: role, domain: "localhost", path: "/" },
  ]);
}

async function pickOption(page: Page, triggerId: string, name: RegExp | string) {
  await page.locator(`#${triggerId}`).click();
  await page.getByRole("option", { name, exact: typeof name === "string" }).click();
}

interface FormOpts {
  reason?: string;
  direction?: "Add to on-hand" | "Remove from on-hand";
  quantity: number;
  note: string;
}

/** Fill the slim form for the fixed holding, without submitting. */
async function fillForm(page: Page, opts: FormOpts) {
  const main = page.locator("main");
  await pickOption(page, "warehouse", WAREHOUSE);
  await pickOption(page, "product", new RegExp(SKU));
  await pickOption(page, "holding", new RegExp(LOCATION_ROW));
  if (opts.reason) await pickOption(page, "reason", opts.reason);
  if (opts.direction) await pickOption(page, "direction", opts.direction);
  await main.locator("#quantity").fill(String(opts.quantity));
  await main.locator("#note").fill(opts.note);
}

/** Submit and wait for the result to settle (the button leaves its "Recording…"
 *  state). The generous timeout absorbs a Neon cold start on the first write. */
async function submit(page: Page) {
  const main = page.locator("main");
  await main.getByRole("button", { name: "Record adjustment" }).click();
  await expect(main.getByRole("button", { name: "Recording…" })).toHaveCount(0, { timeout: 20_000 });
}

/** Read the integer out of a result-panel StatTile by its label. */
async function tile(page: Page, label: string): Promise<number> {
  const text = await page.locator("main").getByText(label, { exact: true }).locator("..").innerText();
  return Number(text.replace(/[^\d]/g, "")) || 0;
}

/** Fill for the fixed holding, submit, and settle. */
async function record(page: Page, opts: FormOpts) {
  await fillForm(page, opts);
  await submit(page);
}

test.describe("adjustment and damage", () => {
  test.describe.configure({ mode: "serial" });

  test("an operator records an adjustment and it lands in the ledger with their name on it", async ({
    page,
    context,
  }) => {
    await actAs(context, "warehouse-staff");
    await page.goto("/inventory/adjustments/new");
    const main = page.locator("main");
    await expect(main.getByRole("heading", { name: "New stock adjustment" })).toBeVisible();

    const note = `e2e adjust add ${Date.now()}`;
    await fillForm(page, { direction: "Add to on-hand", quantity: 7, note });
    const before = await tile(page, "Current on-hand");
    expect(before).toBeGreaterThan(1000);
    await submit(page);

    await expect(main.getByText("New on-hand").locator("..")).toContainText(String(before + 7));
    await expect(main.getByText(/Movement MOV-/)).toBeVisible();

    // The ledger shows the movement, attributed to the operator who made it.
    await page.goto(`/inventory/movements?q=${encodeURIComponent(note)}`);
    const ledgerRow = page.locator("main tbody tr").filter({ hasText: note });
    await expect(ledgerRow).toHaveCount(1);
    await expect(ledgerRow).toContainText(SKU);
    await expect(ledgerRow).toContainText(OPERATOR);
    await expect(ledgerRow).toContainText("+7");

    // Put the 7 units back so the seeded totals other suites assert stay valid.
    await page.goto("/inventory/adjustments/new");
    await record(page, { direction: "Remove from on-hand", quantity: 7, note: `${note} revert` });
    await expect(main.getByText("New on-hand").locator("..")).toContainText(String(before));
  });

  test("recording damage moves the quantity into the damaged balance", async ({ page, context }) => {
    await actAs(context, "warehouse-staff");

    await page.goto("/inventory/adjustments/new");
    const main = page.locator("main");

    const note = `e2e damage ${Date.now()}`;
    await fillForm(page, { reason: "Damaged", quantity: 3, note });
    const onHandBefore = await tile(page, "Current on-hand");
    await submit(page);

    // On-hand fell by 3 and the same 3 landed in the damaged balance.
    await expect(main.getByText("New on-hand").locator("..")).toContainText(String(onHandBefore - 3));
    expect(await tile(page, "Damaged balance")).toBeGreaterThanOrEqual(3);

    // Recorded as a Damage movement, attributed to the operator.
    await page.goto(`/inventory/movements?q=${encodeURIComponent(note)}`);
    const ledgerRow = page.locator("main tbody tr").filter({ hasText: note });
    await expect(ledgerRow).toHaveCount(1);
    await expect(ledgerRow).toContainText("Damage");
    await expect(ledgerRow).toContainText("−3");
    await expect(ledgerRow).toContainText(OPERATOR);

    // Restore on-hand. The damaged balance stays raised — there is no un-damage.
    await page.goto("/inventory/adjustments/new");
    await record(page, { reason: "Found", quantity: 3, note: `${note} revert` });
    await expect(main.getByText("New on-hand").locator("..")).toContainText(String(onHandBefore));
  });

  test("an adjustment that would drive on-hand below zero is rejected", async ({ page, context }) => {
    await actAs(context, "warehouse-staff");
    await page.goto("/inventory/adjustments/new");
    const main = page.locator("main");

    const note = `e2e negative ${Date.now()}`;
    await record(page, { direction: "Remove from on-hand", quantity: 999999, note });

    await expect(main.getByRole("alert")).toContainText("drive on-hand below zero");
    await expect(main.getByText(/Movement MOV-/)).toHaveCount(0);

    // Nothing was written to the ledger.
    await page.goto(`/inventory/movements?q=${encodeURIComponent(note)}`);
    await expect(page.locator("main tbody tr").filter({ hasText: note })).toHaveCount(0);
  });

  test("a role that cannot create adjustments never sees the form", async ({ page, context }) => {
    await actAs(context, "auditor");
    await page.goto("/inventory/adjustments/new");
    const main = page.locator("main");

    await expect(
      main.getByRole("heading", { name: /do not have access to Stock adjustments/i }),
    ).toBeVisible();
    await expect(main.getByRole("button", { name: "Record adjustment" })).toHaveCount(0);
  });
});
