/**
 * Import validation.
 *
 * The rule this file exists to enforce: bad rows never reach the database.
 * Every row is checked before anything is written, the errors are shown with
 * the row number and the offending value, and the operator decides whether to
 * import the clean rows or fix the file and start again.
 */

export type ImportKind = "products" | "suppliers" | "customers" | "stock";

export interface ImportField {
  key: string;
  label: string;
  required: boolean;
  hint: string;
  /** Header names commonly used for this field, for auto-mapping. */
  aliases: string[];
  validate?: (value: string, row: Record<string, string>) => string | null;
}

export interface ImportSchema {
  kind: ImportKind;
  label: string;
  description: string;
  fields: ImportField[];
  /** A realistic header line plus a couple of rows, for the template. */
  sample: string[][];
}

const isBlank = (v: string) => v.trim().length === 0;

const numeric = (label: string, opts: { min?: number; integer?: boolean } = {}) =>
  (value: string): string | null => {
    if (isBlank(value)) return null;
    const n = Number(value.replace(/[$,]/g, ""));
    if (Number.isNaN(n)) return `${label} must be a number, got "${value}"`;
    if (opts.integer && !Number.isInteger(n)) return `${label} must be a whole number, got "${value}"`;
    if (opts.min !== undefined && n < opts.min) return `${label} cannot be below ${opts.min}`;
    return null;
  };

export const IMPORT_SCHEMAS: Record<ImportKind, ImportSchema> = {
  products: {
    kind: "products",
    label: "Products",
    description: "Add or update catalogue entries. Existing SKUs are updated, new ones created.",
    fields: [
      {
        key: "sku",
        label: "SKU",
        required: true,
        hint: "Uppercase letters, numbers and hyphens. Must be unique.",
        aliases: ["sku", "code", "product code", "item code", "part number"],
        validate: (v) => {
          if (isBlank(v)) return "SKU is required";
          if (!/^[A-Z0-9-]+$/.test(v.trim())) {
            return `SKU "${v}" contains characters other than A–Z, 0–9 and hyphen`;
          }
          if (v.trim().length > 32) return `SKU "${v}" is longer than 32 characters`;
          return null;
        },
      },
      {
        key: "name",
        label: "Product name",
        required: true,
        hint: "What someone would call it out loud.",
        aliases: ["name", "product", "product name", "description", "title"],
        validate: (v) => (isBlank(v) ? "Product name is required" : null),
      },
      {
        key: "category",
        label: "Category",
        required: true,
        hint: "Must match an existing category name.",
        aliases: ["category", "group", "product group", "department"],
      },
      {
        key: "supplier",
        label: "Primary supplier",
        required: false,
        hint: "Supplier name or code. Blank means unassigned.",
        aliases: ["supplier", "vendor", "supplier name", "primary supplier"],
      },
      {
        key: "unitCost",
        label: "Unit cost",
        required: true,
        hint: "What you pay, per unit.",
        aliases: ["unit cost", "cost", "buy price", "cost price"],
        validate: numeric("Unit cost", { min: 0 }),
      },
      {
        key: "sellPrice",
        label: "Selling price",
        required: false,
        hint: "What you charge. Blank leaves it unset.",
        aliases: ["sell price", "price", "retail price", "selling price", "rrp"],
        validate: (v, row) => {
          const base = numeric("Selling price", { min: 0 })(v);
          if (base) return base;
          if (isBlank(v)) return null;
          const cost = Number((row.unitCost ?? "").replace(/[$,]/g, ""));
          const price = Number(v.replace(/[$,]/g, ""));
          if (!Number.isNaN(cost) && price > 0 && price < cost) {
            return `Selling price ${v} is below unit cost ${row.unitCost}`;
          }
          return null;
        },
      },
      {
        key: "reorderPoint",
        label: "Reorder point",
        required: false,
        hint: "Available quantity that triggers a reorder.",
        aliases: ["reorder point", "reorder level", "min stock", "minimum"],
        validate: numeric("Reorder point", { min: 0, integer: true }),
      },
      {
        key: "barcode",
        label: "Barcode",
        required: false,
        hint: "13 digits for EAN-13. Blank assigns one at first receipt.",
        aliases: ["barcode", "ean", "gtin", "upc"],
        validate: (v) =>
          isBlank(v) || /^\d{13}$/.test(v.trim())
            ? null
            : `Barcode "${v}" is not 13 digits`,
      },
    ],
    sample: [
      ["sku", "name", "category", "supplier", "unit cost", "sell price", "reorder point", "barcode"],
      [
        "BCL-SCN-901",
        "Kestrel Wireless Barcode Scanner — 2D Bluetooth",
        "Barcode & Labelling",
        "Corvus Technologies BV",
        "184.50",
        "289.00",
        "40",
        "5012345678901",
      ],
      [
        "PPE-GLV-902",
        "Nitrile Safety Gloves — Powder-Free L",
        "Safety & PPE",
        "Dunmore Textiles",
        "8.20",
        "14.95",
        "120",
        "",
      ],
    ],
  },

  suppliers: {
    kind: "suppliers",
    label: "Suppliers",
    description: "Add or update the suppliers products can be bought from.",
    fields: [
      {
        key: "code",
        label: "Supplier code",
        required: true,
        hint: "Your internal reference for this supplier.",
        aliases: ["code", "supplier code", "vendor code", "account"],
        validate: (v) => (isBlank(v) ? "Supplier code is required" : null),
      },
      {
        key: "name",
        label: "Supplier name",
        required: true,
        hint: "The trading name.",
        aliases: ["name", "supplier", "supplier name", "vendor", "company"],
        validate: (v) => (isBlank(v) ? "Supplier name is required" : null),
      },
      {
        key: "email",
        label: "Contact email",
        required: true,
        hint: "Where purchase orders are sent.",
        aliases: ["email", "contact email", "e-mail"],
        validate: (v) => {
          if (isBlank(v)) return "Contact email is required";
          return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim())
            ? null
            : `"${v}" is not a valid email address`;
        },
      },
      {
        key: "contactName",
        label: "Contact name",
        required: false,
        hint: "Who to speak to.",
        aliases: ["contact", "contact name", "account manager"],
      },
      {
        key: "leadTimeDays",
        label: "Lead time (days)",
        required: true,
        hint: "Drives reorder points. Getting this wrong causes stockouts.",
        aliases: ["lead time", "lead time days", "delivery days"],
        validate: (v) => {
          if (isBlank(v)) return "Lead time is required — reorder points depend on it";
          return numeric("Lead time", { min: 0, integer: true })(v);
        },
      },
      {
        key: "paymentTerms",
        label: "Payment terms",
        required: false,
        hint: "Net 30, Net 45, and so on.",
        aliases: ["payment terms", "terms"],
      },
      {
        key: "country",
        label: "Country",
        required: false,
        hint: "Used for lead-time expectations and reporting.",
        aliases: ["country", "region"],
      },
    ],
    sample: [
      ["code", "name", "email", "contact name", "lead time", "payment terms", "country"],
      ["S-1201", "Aldergate Industrial", "orders@aldergate.example", "Priya Raghunathan", "18", "Net 30", "United Kingdom"],
      ["S-1202", "Ridgeline Components", "purchasing@ridgeline.example", "Marcus Bell", "9", "Net 45", "United States"],
    ],
  },

  customers: {
    kind: "customers",
    label: "Customers",
    description: "Add or update the accounts you sell to.",
    fields: [
      {
        key: "code",
        label: "Customer code",
        required: true,
        hint: "Your internal account reference.",
        aliases: ["code", "customer code", "account", "account number"],
        validate: (v) => (isBlank(v) ? "Customer code is required" : null),
      },
      {
        key: "name",
        label: "Customer name",
        required: true,
        hint: "The trading name.",
        aliases: ["name", "customer", "customer name", "company"],
        validate: (v) => (isBlank(v) ? "Customer name is required" : null),
      },
      {
        key: "email",
        label: "Contact email",
        required: true,
        hint: "Where order confirmations go.",
        aliases: ["email", "contact email", "e-mail"],
        validate: (v) => {
          if (isBlank(v)) return "Contact email is required";
          return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim())
            ? null
            : `"${v}" is not a valid email address`;
        },
      },
      {
        key: "type",
        label: "Account type",
        required: false,
        hint: "Retail, wholesale, online or government.",
        aliases: ["type", "account type", "segment"],
        validate: (v) =>
          isBlank(v) || ["retail", "wholesale", "online", "government"].includes(v.trim().toLowerCase())
            ? null
            : `"${v}" is not a recognised account type`,
      },
      {
        key: "creditLimit",
        label: "Credit limit",
        required: false,
        hint: "Caps what can be ordered before payment.",
        aliases: ["credit limit", "limit", "credit"],
        validate: numeric("Credit limit", { min: 0 }),
      },
      {
        key: "city",
        label: "City",
        required: false,
        hint: "Default ship-to city.",
        aliases: ["city", "town", "location"],
      },
    ],
    sample: [
      ["code", "name", "email", "type", "credit limit", "city"],
      ["C-3001", "Halewood Trading", "orders@halewood.example", "wholesale", "45000", "Columbus"],
      ["C-3002", "Brightside Retail", "purchasing@brightside.example", "retail", "12000", "Denver"],
    ],
  },

  stock: {
    kind: "stock",
    label: "Opening stock",
    description: "Set on-hand quantities per SKU per location. Use for a new site or a full recount.",
    fields: [
      {
        key: "sku",
        label: "SKU",
        required: true,
        hint: "Must already exist in the catalogue.",
        aliases: ["sku", "code", "product code", "item"],
        validate: (v) => (isBlank(v) ? "SKU is required" : null),
      },
      {
        key: "warehouse",
        label: "Warehouse",
        required: true,
        hint: "Site code, e.g. DC-01.",
        aliases: ["warehouse", "site", "location code", "depot"],
        validate: (v) => (isBlank(v) ? "Warehouse is required" : null),
      },
      {
        key: "location",
        label: "Bin",
        required: true,
        hint: "The bin the stock sits in, e.g. A-01-02-03.",
        aliases: ["bin", "location", "position", "slot"],
        validate: (v) => (isBlank(v) ? "Bin is required — stock has to go somewhere" : null),
      },
      {
        key: "quantity",
        label: "Quantity",
        required: true,
        hint: "Counted on-hand quantity.",
        aliases: ["quantity", "qty", "on hand", "count", "stock"],
        validate: (v) => {
          if (isBlank(v)) return "Quantity is required";
          return numeric("Quantity", { min: 0, integer: true })(v);
        },
      },
      {
        key: "lotNumber",
        label: "Lot number",
        required: false,
        hint: "Required for batch-tracked products.",
        aliases: ["lot", "lot number", "batch", "batch number"],
      },
      {
        key: "expiresAt",
        label: "Expiry date",
        required: false,
        hint: "YYYY-MM-DD. Required for products with a shelf life.",
        aliases: ["expiry", "expiry date", "expires", "best before"],
        validate: (v) =>
          isBlank(v) || /^\d{4}-\d{2}-\d{2}$/.test(v.trim())
            ? null
            : `Expiry "${v}" is not in YYYY-MM-DD format`,
      },
    ],
    sample: [
      ["sku", "warehouse", "bin", "quantity", "lot", "expiry"],
      ["BCL-RBN-115", "DC-01", "A-01-02-03", "480", "LOT-2026-0188", ""],
      ["PPE-GLV-165", "DC-02", "B-02-01-04", "1200", "LOT-2026-0192", "2028-04-30"],
    ],
  },
};

/* --------------------------------------------------------------- parsing -- */

export function parseDelimited(text: string): { headers: string[]; rows: string[][] } {
  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) return { headers: [], rows: [] };

  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const split = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          quoted = !quoted;
        }
      } else if (ch === delimiter && !quoted) {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out.map((c) => c.trim());
  };

  const [headerLine, ...rest] = lines;
  return { headers: split(headerLine), rows: rest.map(split) };
}

/** Best-guess mapping of file headers onto schema fields. */
export function autoMap(headers: string[], schema: ImportSchema): Record<string, string> {
  const mapping: Record<string, string> = {};
  const used = new Set<string>();

  for (const field of schema.fields) {
    const match = headers.find((h) => {
      if (used.has(h)) return false;
      const norm = h.toLowerCase().replace(/[_-]+/g, " ").trim();
      return field.aliases.includes(norm) || norm === field.key.toLowerCase();
    });
    if (match) {
      mapping[field.key] = match;
      used.add(match);
    }
  }
  return mapping;
}

/* ------------------------------------------------------------ validation -- */

export interface RowIssue {
  /** 1-based line number in the original file, header excluded. */
  row: number;
  field: string;
  fieldLabel: string;
  message: string;
  severity: "error" | "warning";
  value: string;
}

export interface ValidationResult {
  valid: Record<string, string>[];
  issues: RowIssue[];
  duplicates: number;
  total: number;
}

/**
 * Validates every row, and never stops at the first failure — an operator
 * fixing a file wants the whole list, not one error at a time.
 */
export function validateRows(
  headers: string[],
  rows: string[][],
  mapping: Record<string, string>,
  schema: ImportSchema,
  existingKeys: Set<string> = new Set(),
): ValidationResult {
  const issues: RowIssue[] = [];
  const valid: Record<string, string>[] = [];
  const seen = new Set<string>();
  let duplicates = 0;

  const identity = schema.fields[0];

  rows.forEach((cells, index) => {
    const rowNumber = index + 1;
    const record: Record<string, string> = {};

    for (const field of schema.fields) {
      const header = mapping[field.key];
      const column = header ? headers.indexOf(header) : -1;
      record[field.key] = column >= 0 ? (cells[column] ?? "") : "";
    }

    let rowHasError = false;

    for (const field of schema.fields) {
      const value = record[field.key] ?? "";

      if (field.required && isBlank(value) && !mapping[field.key]) {
        issues.push({
          row: rowNumber,
          field: field.key,
          fieldLabel: field.label,
          message: `${field.label} is not mapped to a column`,
          severity: "error",
          value: "",
        });
        rowHasError = true;
        continue;
      }

      const message = field.validate?.(value, record) ?? null;
      if (message) {
        issues.push({
          row: rowNumber,
          field: field.key,
          fieldLabel: field.label,
          message,
          severity: "error",
          value,
        });
        rowHasError = true;
      } else if (!field.required && isBlank(value) && mapping[field.key]) {
        // Mapped but empty on an optional field is worth mentioning, not
        // worth blocking — it just means that column will not be set.
        issues.push({
          row: rowNumber,
          field: field.key,
          fieldLabel: field.label,
          message: `${field.label} is empty and will be left unset`,
          severity: "warning",
          value: "",
        });
      }
    }

    const key = (record[identity.key] ?? "").trim().toUpperCase();
    if (key) {
      if (seen.has(key)) {
        duplicates++;
        issues.push({
          row: rowNumber,
          field: identity.key,
          fieldLabel: identity.label,
          message: `${identity.label} "${key}" appears more than once in this file`,
          severity: "error",
          value: key,
        });
        rowHasError = true;
      } else {
        seen.add(key);
        if (existingKeys.has(key)) {
          issues.push({
            row: rowNumber,
            field: identity.key,
            fieldLabel: identity.label,
            message: `${identity.label} "${key}" already exists and will be updated`,
            severity: "warning",
            value: key,
          });
        }
      }
    }

    if (!rowHasError) valid.push(record);
  });

  return { valid, issues, duplicates, total: rows.length };
}
