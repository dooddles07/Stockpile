/**
 * Import validation.
 *
 * The claim under test is the one the whole wizard rests on: a row with any
 * error never reaches `valid`, and every problem is reported rather than the
 * first one aborting the pass.
 *
 * Ported from the former lib/import/validate.test.ts, which used
 * node:assert and could not run under any configured test runner.
 */

import { test, expect } from "@playwright/test";

import {
  IMPORT_SCHEMAS,
  autoMap,
  parseDelimited,
  validateRows,
} from "@/lib/import/validate";

const products = IMPORT_SCHEMAS.products;

test("parses a quoted CSV without splitting inside quotes", () => {
  const { headers, rows } = parseDelimited(
    'sku,name,unit cost\nBCL-001,"Scanner, handheld",129.00\n',
  );
  expect(headers).toEqual(["sku", "name", "unit cost"]);
  expect(rows.length).toBe(1);
  expect(rows[0][1]).toBe("Scanner, handheld");
  expect(rows[0][2]).toBe("129.00");
});

test("parses tab-separated files too", () => {
  const { headers, rows } = parseDelimited("sku\tname\nBCL-001\tScanner\n");
  expect(headers).toEqual(["sku", "name"]);
  expect(rows[0][1]).toBe("Scanner");
});

test("auto-maps headers by alias, case and separator insensitively", () => {
  const mapping = autoMap(
    ["Product_Code", "Product Name", "Category", "Cost Price", "Reorder Level"],
    products,
  );
  expect(mapping.sku).toBe("Product_Code");
  expect(mapping.name).toBe("Product Name");
  expect(mapping.unitCost).toBe("Cost Price");
  expect(mapping.reorderPoint).toBe("Reorder Level");
});

test("accepts a clean file", () => {
  const { headers, rows } = parseDelimited(
    "sku,name,category,unit cost\nBCL-SCN-901,Scanner,Barcode & Labelling,184.50\n",
  );
  const result = validateRows(headers, rows, autoMap(headers, products), products);
  expect(result.valid.length).toBe(1);
  expect(result.issues.filter((i) => i.severity === "error").length).toBe(0);
});

test("rejects a row and keeps the clean one alongside it", () => {
  const { headers, rows } = parseDelimited(
    [
      "sku,name,category,unit cost",
      "BCL-SCN-901,Scanner,Barcode & Labelling,184.50",
      "bad sku!,Broken,Barcode & Labelling,not-a-number",
    ].join("\n"),
  );
  const result = validateRows(headers, rows, autoMap(headers, products), products);

  expect(result.total).toBe(2);
  expect(result.valid.length, "only the clean row survives").toBe(1);
  expect(result.valid[0].sku).toBe("BCL-SCN-901");

  // Both problems on the bad row are reported, not just the first.
  const badRowErrors = result.issues.filter((i) => i.row === 2 && i.severity === "error");
  expect(badRowErrors.length, "every error on the row is reported").toBeGreaterThanOrEqual(2);
  expect(badRowErrors.some((e) => e.field === "sku")).toBe(true);
  expect(badRowErrors.some((e) => e.field === "unitCost")).toBe(true);
});

test("flags a duplicate identifier inside the file", () => {
  const { headers, rows } = parseDelimited(
    [
      "sku,name,category,unit cost",
      "BCL-SCN-901,Scanner A,Barcode & Labelling,184.50",
      "BCL-SCN-901,Scanner B,Barcode & Labelling,190.00",
    ].join("\n"),
  );
  const result = validateRows(headers, rows, autoMap(headers, products), products);

  expect(result.duplicates).toBe(1);
  expect(result.valid.length, "the duplicate is not imported").toBe(1);
  expect(result.issues.some((i) => i.message.includes("more than once"))).toBe(true);
});

test("warns rather than blocks when a SKU already exists", () => {
  const { headers, rows } = parseDelimited(
    "sku,name,category,unit cost\nBCL-SCN-104,Scanner,Barcode & Labelling,184.50\n",
  );
  const result = validateRows(
    headers,
    rows,
    autoMap(headers, products),
    products,
    new Set(["BCL-SCN-104"]),
  );

  expect(result.valid.length, "an update is still importable").toBe(1);
  const warning = result.issues.find((i) => i.severity === "warning" && i.field === "sku");
  expect(warning, "the operator is told it is an update, not a create").toBeTruthy();
  expect(warning!.message.includes("already exists")).toBe(true);
});

test("blocks when a required field is not mapped at all", () => {
  const { headers, rows } = parseDelimited("name,category\nScanner,Barcode & Labelling\n");
  const result = validateRows(headers, rows, autoMap(headers, products), products);

  expect(result.valid.length).toBe(0);
  expect(result.issues.some((i) => i.field === "sku" && i.message.includes("not mapped"))).toBe(true);
});

test("catches a selling price below unit cost", () => {
  const { headers, rows } = parseDelimited(
    "sku,name,category,unit cost,sell price\nBCL-SCN-901,Scanner,Barcode & Labelling,184.50,99.00\n",
  );
  const result = validateRows(headers, rows, autoMap(headers, products), products);

  expect(result.valid.length, "a price below cost does not slip through").toBe(0);
  expect(result.issues.some((i) => i.message.includes("below unit cost"))).toBe(true);
});

test("rejects a barcode that is not 13 digits", () => {
  const { headers, rows } = parseDelimited(
    "sku,name,category,unit cost,barcode\nBCL-SCN-901,Scanner,Barcode & Labelling,184.50,12345\n",
  );
  const result = validateRows(headers, rows, autoMap(headers, products), products);
  expect(result.issues.some((i) => i.field === "barcode" && i.severity === "error")).toBe(true);
});

test("every schema's own sample file validates cleanly", () => {
  for (const schema of Object.values(IMPORT_SCHEMAS)) {
    const [headerRow, ...sampleRows] = schema.sample;
    const mapping = autoMap(headerRow, schema);
    const result = validateRows(headerRow, sampleRows, mapping, schema);
    const errors = result.issues.filter((i) => i.severity === "error");

    expect(errors.length, `${schema.label} template has errors: ${errors.map((e) => e.message).join("; ")}`).toBe(0);
    expect(result.valid.length, `${schema.label} template should import every row`).toBe(sampleRows.length);
  }
});
