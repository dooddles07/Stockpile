/**
 * Import writes (ticket 14).
 *
 * The wizard (`app/(app)/import`) validates every row of an uploaded file
 * against `lib/import/validate.ts`. This is the one place that then writes the
 * rows it validated. `importRows` commits a file as ONE transaction: a failure
 * on any row — a category that does not exist, a duplicate SKU, a choke-point
 * rejection — rolls the whole file back, so a bad supplier export can never
 * leave the catalogue half-populated and half-correct.
 *
 * Routing (the ticket brief):
 *   - products / suppliers / customers are Reference Data: each row goes through
 *     the phase-2 domain function (`createProduct` / `createSupplier` /
 *     `createCustomer`), inheriting its permission check and its row validation.
 *   - "opening stock" is a stock change, so it has exactly one legal route: the
 *     choke point. Each row becomes a `count-correction` Movement through
 *     `applyStockChange` that sets on-hand to the counted figure — the
 *     semantics of "a new site or a full recount" — with `ensureStockHolding`
 *     first where the product has never sat in that location. It never writes
 *     `stock_rows` directly.
 *
 * Like the other domain modules this imports no `server-only` code: the caller
 * passes the Drizzle handle (`getDb()` on the request path, an own Pool for
 * `import.checks.ts`). The permission matrix must already be hydrated.
 *
 * ADR-0004 — `importRows` checks permission before opening the transaction, so a
 * caller reaching it directly (a REST layer, automation) is refused exactly as
 * one coming through the wizard would be. The per-row `createX` /
 * `applyStockChange` calls check again; the outer check is what refuses a
 * forbidden Role up front.
 *
 * ponytail: create-only for the three reference kinds. The validator already
 * flags a row whose identifier exists as "will be updated", but wiring an
 * upsert means merging each importable column onto the full existing row and is
 * out of this ticket's scope — a file that repeats an on-file identifier is
 * rejected whole (the reference function's own `conflict`), which keeps the
 * "never half-correct" guarantee. Add update routing when re-import matters.
 */

import { and, eq, isNull } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

import { can } from "@/lib/auth/permissions";
import * as schema from "@/lib/db/schema";
import {
  ReferenceWriteError,
  createCustomer,
  createProduct,
  createSupplier,
} from "@/lib/domain/reference";
import {
  StockChangeError,
  applyStockChange,
  ensureStockHolding,
  type Actor,
  type StockDb,
} from "@/lib/domain/stock";
import type { ImportKind } from "@/lib/import/validate";
import type { ModuleKey, PermissionAction } from "@/lib/types";

type Db = NeonDatabase<typeof schema>;
type Row = Record<string, string>;

export type ImportErrorCode = "forbidden" | "invalid" | "not-found";

/** Thrown by `importRows`; nothing is written when it is. */
export class ImportError extends Error {
  constructor(
    message: string,
    readonly code: ImportErrorCode,
  ) {
    super(message);
    this.name = "ImportError";
  }
}

/**
 * What each import kind writes to, and the permission it needs — the same gate
 * the wizard's page uses to decide which kinds to offer (ADR-0004). The
 * reference kinds are a `create`; opening stock is `stock` / `edit`, the
 * permission the choke point itself enforces for a `count-correction`.
 */
const IMPORT_PERMISSION: Record<ImportKind, { module: ModuleKey; action: PermissionAction }> = {
  products: { module: "products", action: "create" },
  suppliers: { module: "suppliers", action: "create" },
  customers: { module: "customers", action: "create" },
  stock: { module: "stock", action: "edit" },
};

const CUSTOMER_TYPES = ["retail", "wholesale", "online", "government"] as const;

const trimOr = (value: string | undefined, fallback = ""): string =>
  (value ?? "").trim() || fallback;

/** Parse a number the way `validate.ts` does — tolerating `$` and thousands commas. */
const num = (value: string | undefined): number => {
  const n = Number((value ?? "").replace(/[$,]/g, "").trim());
  return Number.isFinite(n) ? n : 0;
};
const int = (value: string | undefined): number => Math.trunc(num(value));

export interface ImportRowsResult {
  kind: ImportKind;
  /**
   * Rows committed. The whole file is one transaction, so on success this is
   * every row passed in; on any failure the call throws and nothing is written.
   */
  imported: number;
}

/**
 * Commit an import file. Checks the Actor's permission for the kind, then writes
 * every row in a single transaction. Always throws `ImportError` (nothing
 * written) on failure — a `ReferenceWriteError` or `StockChangeError` from a
 * per-row write is caught and re-thrown as one, so the single caller (the
 * wizard's server action) has one error type to surface.
 */
export async function importRows(
  actor: Actor,
  kind: ImportKind,
  rows: Row[],
  db: Db,
): Promise<ImportRowsResult> {
  const permission = IMPORT_PERMISSION[kind];
  if (!can(actor.role, permission.module, permission.action)) {
    throw new ImportError(
      `Your role (${actor.role}) is not allowed to import ${kind}.`,
      "forbidden",
    );
  }

  if (rows.length === 0) {
    throw new ImportError("There are no valid rows to import.", "invalid");
  }

  try {
    await db.transaction(async (tx) => {
      switch (kind) {
        case "products":
          await importProducts(actor, rows, tx);
          break;
        case "suppliers":
          await importSuppliers(actor, rows, tx);
          break;
        case "customers":
          await importCustomers(actor, rows, tx);
          break;
        case "stock":
          await importOpeningStock(actor, rows, tx);
          break;
      }
    });
  } catch (error) {
    // A per-row reference or choke-point rejection has already rolled the whole
    // file back (it threw out of `db.transaction`). Re-frame it as an
    // `ImportError` so the wizard shows the message rather than a raw 500 — a
    // routine path, since re-importing a file that names an on-file identifier
    // reaches `createProduct` and throws `conflict`.
    if (error instanceof ImportError) throw error;
    if (error instanceof ReferenceWriteError || error instanceof StockChangeError) {
      const code =
        error.code === "forbidden" ? "forbidden" : error.code === "not-found" ? "not-found" : "invalid";
      throw new ImportError(error.message, code);
    }
    throw error;
  }

  return { kind, imported: rows.length };
}

async function importProducts(actor: Actor, rows: Row[], tx: StockDb): Promise<void> {
  const categories = await tx
    .select({ id: schema.categories.id, name: schema.categories.name })
    .from(schema.categories);
  const categoryByName = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c.id]));

  const suppliers = await tx
    .select({ id: schema.suppliers.id, name: schema.suppliers.name, code: schema.suppliers.code })
    .from(schema.suppliers);
  const supplierByKey = new Map<string, string>();
  for (const s of suppliers) {
    supplierByKey.set(s.name.trim().toLowerCase(), s.id);
    supplierByKey.set(s.code.trim().toLowerCase(), s.id);
  }

  for (const [index, row] of rows.entries()) {
    const categoryName = trimOr(row.category);
    const categoryId = categoryByName.get(categoryName.toLowerCase());
    if (!categoryId) {
      throw new ImportError(
        `Row ${index + 1}: category "${categoryName}" is not in the catalogue.`,
        "not-found",
      );
    }

    const supplierRaw = trimOr(row.supplier);
    const supplierId = supplierRaw ? supplierByKey.get(supplierRaw.toLowerCase()) : "";
    if (supplierRaw && !supplierId) {
      throw new ImportError(
        `Row ${index + 1}: supplier "${supplierRaw}" is not on file.`,
        "not-found",
      );
    }

    await createProduct(
      actor,
      {
        sku: trimOr(row.sku),
        name: trimOr(row.name),
        categoryId,
        brand: "",
        supplierId: supplierId ?? "",
        unit: "ea",
        barcode: trimOr(row.barcode),
        description: "",
        unitCost: num(row.unitCost),
        sellPrice: num(row.sellPrice),
        reorderPoint: int(row.reorderPoint),
        reorderQty: 0,
        leadTimeDays: 0,
        batchTracked: false,
        serialTracked: false,
        hasExpiry: false,
        shelfLifeDays: 0,
      },
      tx,
    );
  }
}

async function importSuppliers(actor: Actor, rows: Row[], tx: StockDb): Promise<void> {
  for (const row of rows) {
    await createSupplier(
      actor,
      {
        code: trimOr(row.code),
        name: trimOr(row.name),
        contactName: trimOr(row.contactName),
        email: trimOr(row.email),
        phone: "",
        addressLine: "",
        city: "",
        country: trimOr(row.country),
        paymentTerms: trimOr(row.paymentTerms),
        currency: "USD",
        leadTimeDays: int(row.leadTimeDays),
        categories: [],
      },
      tx,
    );
  }
}

async function importCustomers(actor: Actor, rows: Row[], tx: StockDb): Promise<void> {
  for (const row of rows) {
    const typeRaw = trimOr(row.type).toLowerCase();
    const type = (CUSTOMER_TYPES as readonly string[]).includes(typeRaw)
      ? (typeRaw as (typeof CUSTOMER_TYPES)[number])
      : "retail";

    await createCustomer(
      actor,
      {
        code: trimOr(row.code),
        name: trimOr(row.name),
        type,
        contactName: "",
        email: trimOr(row.email),
        phone: "",
        city: trimOr(row.city),
        country: "",
        paymentTerms: "",
        creditLimit: num(row.creditLimit),
      },
      tx,
    );
  }
}

async function importOpeningStock(actor: Actor, rows: Row[], tx: StockDb): Promise<void> {
  const products = await tx
    .select({ id: schema.products.id, sku: schema.products.sku })
    .from(schema.products);
  const productBySku = new Map(products.map((p) => [p.sku.trim().toUpperCase(), p.id]));

  const warehouses = await tx
    .select({ id: schema.warehouses.id, code: schema.warehouses.code })
    .from(schema.warehouses);
  const warehouseByCode = new Map(warehouses.map((w) => [w.code.trim().toUpperCase(), w.id]));

  const locations = await tx
    .select({
      id: schema.locations.id,
      code: schema.locations.code,
      warehouseId: schema.locations.warehouseId,
    })
    .from(schema.locations);
  const locationByKey = new Map(
    locations.map((l) => [`${l.warehouseId}:${l.code.trim().toUpperCase()}`, l.id]),
  );

  for (const [index, row] of rows.entries()) {
    const at = `Row ${index + 1}`;

    const sku = trimOr(row.sku).toUpperCase();
    const productId = productBySku.get(sku);
    if (!productId) {
      throw new ImportError(`${at}: SKU "${sku}" is not in the catalogue.`, "not-found");
    }

    const warehouseCode = trimOr(row.warehouse).toUpperCase();
    const warehouseId = warehouseByCode.get(warehouseCode);
    if (!warehouseId) {
      throw new ImportError(`${at}: warehouse "${warehouseCode}" does not exist.`, "not-found");
    }

    const locationCode = trimOr(row.location).toUpperCase();
    const locationId = locationByKey.get(`${warehouseId}:${locationCode}`);
    if (!locationId) {
      throw new ImportError(
        `${at}: bin "${locationCode}" is not in warehouse "${warehouseCode}".`,
        "not-found",
      );
    }

    const lotNumber = trimOr(row.lotNumber) || null;
    const counted = int(row.quantity);
    if (counted < 0) {
      throw new ImportError(`${at}: quantity cannot be negative.`, "invalid");
    }

    // The choke point locks exactly one Stock Row and never inserts one, so a
    // product that has never sat here needs its zero-balance holding first.
    await ensureStockHolding(tx, { productId, warehouseId, locationId, lotNumber });

    const [held] = await tx
      .select({ onHand: schema.stockRows.onHand })
      .from(schema.stockRows)
      .where(
        and(
          eq(schema.stockRows.productId, productId),
          eq(schema.stockRows.warehouseId, warehouseId),
          eq(schema.stockRows.locationId, locationId),
          lotNumber == null
            ? isNull(schema.stockRows.lotNumber)
            : eq(schema.stockRows.lotNumber, lotNumber),
        ),
      );
    // ponytail: `recorded` is read here, outside the choke point's own
    // `FOR UPDATE`, so if stock at this holding moves between this read and
    // `applyStockChange` locking it, on-hand lands at counted ± that concurrent
    // move — the same TOCTOU `completeStockCount` documents. An opening-stock
    // import runs against a quiet site, so this is left; re-read inside the
    // choke point if that stops being true.
    const recorded = held?.onHand ?? 0;
    const delta = counted - recorded;

    // A row that already matches writes nothing, exactly as a no-variance count
    // line does (`completeStockCount`) — recording a zero-quantity correction
    // would only pollute the ledger.
    if (delta === 0) continue;

    await applyStockChange(
      actor,
      {
        productId,
        warehouseId,
        locationId,
        lotNumber,
        movementType: "count-correction",
        onHandDelta: delta,
        reason: `Opening stock import: counted ${counted}, recorded ${recorded}`,
        permission: IMPORT_PERMISSION.stock,
        ref: { type: "import", id: "opening-stock", number: "opening-stock" },
      },
      tx,
    );
  }
}
