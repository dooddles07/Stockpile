/**
 * Import validation self-check.
 *
 * Run with:  npx tsx lib/import/validate.test.ts
 *
 * The claim under test is the one the whole wizard rests on: a row with any
 * error never reaches `valid`, and every problem is reported rather than the
 * first one aborting the pass.
 */

import assert from "node:assert/strict";

import {
  IMPORT_SCHEMAS,
  autoMap,
  parseDelimited,
  validateRows,
} from "./validate";

const products = IMPORT_SCHEMAS.products;

function check(name: string, fn: () => void) {
  fn();
  console.log(`  ok  ${name}`);
}

console.log("import validation");

check("parses a quoted CSV without splitting inside quotes", () => {
  const { headers, rows } = parseDelimited(
    'sku,name,unit cost\nBCL-001,"Scanner, handheld",129.00\n',
  );
  assert.deepEqual(headers, ["sku", "name", "unit cost"]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0][1], "Scanner, handheld");
  assert.equal(rows[0][2], "129.00");
});

check("parses tab-separated files too", () => {
  const { headers, rows } = parseDelimited("sku\tname\nBCL-001\tScanner\n");
  assert.deepEqual(headers, ["sku", "name"]);
  assert.equal(rows[0][1], "Scanner");
});

check("auto-maps headers by alias, case and separator insensitively", () => {
  const mapping = autoMap(
    ["Product_Code", "Product Name", "Category", "Cost Price", "Reorder Level"],
    products,
  );
  assert.equal(mapping.sku, "Product_Code");
  assert.equal(mapping.name, "Product Name");
  assert.equal(mapping.unitCost, "Cost Price");
  assert.equal(mapping.reorderPoint, "Reorder Level");
});

check("accepts a clean file", () => {
  const { headers, rows } = parseDelimited(
    "sku,name,category,unit cost\nBCL-SCN-901,Scanner,Barcode & Labelling,184.50\n",
  );
  const result = validateRows(headers, rows, autoMap(headers, products), products);
  assert.equal(result.valid.length, 1);
  assert.equal(result.issues.filter((i) => i.severity === "error").length, 0);
});

check("rejects a row and keeps the clean one alongside it", () => {
  const { headers, rows } = parseDelimited(
    [
      "sku,name,category,unit cost",
      "BCL-SCN-901,Scanner,Barcode & Labelling,184.50",
      "bad sku!,Broken,Barcode & Labelling,not-a-number",
    ].join("\n"),
  );
  const result = validateRows(headers, rows, autoMap(headers, products), products);

  assert.equal(result.total, 2);
  assert.equal(result.valid.length, 1, "only the clean row survives");
  assert.equal(result.valid[0].sku, "BCL-SCN-901");

  // Both problems on the bad row are reported, not just the first.
  const badRowErrors = result.issues.filter((i) => i.row === 2 && i.severity === "error");
  assert.ok(badRowErrors.length >= 2, "every error on the row is reported");
  assert.ok(badRowErrors.some((e) => e.field === "sku"));
  assert.ok(badRowErrors.some((e) => e.field === "unitCost"));
});

check("flags a duplicate identifier inside the file", () => {
  const { headers, rows } = parseDelimited(
    [
      "sku,name,category,unit cost",
      "BCL-SCN-901,Scanner A,Barcode & Labelling,184.50",
      "BCL-SCN-901,Scanner B,Barcode & Labelling,190.00",
    ].join("\n"),
  );
  const result = validateRows(headers, rows, autoMap(headers, products), products);

  assert.equal(result.duplicates, 1);
  assert.equal(result.valid.length, 1, "the duplicate is not imported");
  assert.ok(result.issues.some((i) => i.message.includes("more than once")));
});

check("warns rather than blocks when a SKU already exists", () => {
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

  assert.equal(result.valid.length, 1, "an update is still importable");
  const warning = result.issues.find((i) => i.severity === "warning" && i.field === "sku");
  assert.ok(warning, "the operator is told it is an update, not a create");
  assert.ok(warning.message.includes("already exists"));
});

check("blocks when a required field is not mapped at all", () => {
  const { headers, rows } = parseDelimited("name,category\nScanner,Barcode & Labelling\n");
  const result = validateRows(headers, rows, autoMap(headers, products), products);

  assert.equal(result.valid.length, 0);
  assert.ok(result.issues.some((i) => i.field === "sku" && i.message.includes("not mapped")));
});

check("catches a selling price below unit cost", () => {
  const { headers, rows } = parseDelimited(
    "sku,name,category,unit cost,sell price\nBCL-SCN-901,Scanner,Barcode & Labelling,184.50,99.00\n",
  );
  const result = validateRows(headers, rows, autoMap(headers, products), products);

  assert.equal(result.valid.length, 0, "a price below cost does not slip through");
  assert.ok(result.issues.some((i) => i.message.includes("below unit cost")));
});

check("rejects a barcode that is not 13 digits", () => {
  const { headers, rows } = parseDelimited(
    "sku,name,category,unit cost,barcode\nBCL-SCN-901,Scanner,Barcode & Labelling,184.50,12345\n",
  );
  const result = validateRows(headers, rows, autoMap(headers, products), products);
  assert.ok(result.issues.some((i) => i.field === "barcode" && i.severity === "error"));
});

check("every schema's own sample file validates cleanly", () => {
  for (const schema of Object.values(IMPORT_SCHEMAS)) {
    const [headerRow, ...sampleRows] = schema.sample;
    const mapping = autoMap(headerRow, schema);
    const result = validateRows(headerRow, sampleRows, mapping, schema);
    const errors = result.issues.filter((i) => i.severity === "error");

    assert.equal(
      errors.length,
      0,
      `${schema.label} template has errors: ${errors.map((e) => e.message).join("; ")}`,
    );
    assert.equal(
      result.valid.length,
      sampleRows.length,
      `${schema.label} template should import every row`,
    );
  }
});

console.log("\nall import validation checks passed");
