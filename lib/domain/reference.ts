/**
 * Reference data writes — plain CRUD on mutable rows (ticket 11, ADR-0002).
 *
 * These records describe the business (Product, Category, Supplier, Customer,
 * Warehouse, Location) rather than its activity. They move no quantity and
 * advance no state machine, so — unlike every stock write — they do NOT pass
 * through the choke point and append no Events. They are ordinary
 * `INSERT` / `UPDATE`.
 *
 * What is still identical to the stock writes (ADR-0004): every function takes
 * an explicit `Actor` and checks permission before touching a row, so a caller
 * reaching this directly — automation, a REST layer, a check script — is
 * refused exactly as one coming through a hidden form would be.
 *
 * Referential integrity is the database's job (ticket 11). `deleteCategory` and
 * `deleteWarehouse` — the two the ticket names, "a Warehouse that holds stock,
 * or a Category with Products in it" — issue the `DELETE` and let the
 * foreign-key violation surface as `ReferenceWriteError("in-use")`, rather than
 * pre-checking dependents in app code that a newly added dependent table could
 * silently out-date. The other entities have no delete path in this ticket.
 *
 * Like `lib/domain/stock.ts` this imports no `server-only` code: the caller
 * passes the Drizzle handle, and the permission matrix must already be
 * hydrated (`hydrateRoles`, which the request path reaches through `getRole()`).
 */

import { randomUUID } from "node:crypto";

import { and, eq, ne } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

import { can } from "@/lib/auth/permissions";
import * as schema from "@/lib/db/schema";
import type { Actor } from "@/lib/domain/stock";
import type { LocationType, ModuleKey, PermissionAction, WarehouseType } from "@/lib/types";

type CustomerType = "retail" | "wholesale" | "online" | "government";

type Db = NeonDatabase<typeof schema>;

export type ReferenceWriteErrorCode =
  | "forbidden"
  | "in-use"
  | "not-found"
  | "conflict"
  | "invalid";

/** Thrown by every function here; nothing is written when it is. */
export class ReferenceWriteError extends Error {
  constructor(
    message: string,
    readonly code: ReferenceWriteErrorCode,
  ) {
    super(message);
    this.name = "ReferenceWriteError";
  }
}

/**
 * What a server action hands back to a form: the new/edited row's id, or a
 * typed failure carrying a message the form can show. `attempt` is the one
 * place `ReferenceWriteError` is turned into this — anything else still throws.
 */
export type SaveResult =
  | { ok: true; id: string }
  | { ok: false; code: ReferenceWriteErrorCode; message: string };

export async function attempt(run: () => Promise<string>): Promise<SaveResult> {
  try {
    return { ok: true, id: await run() };
  } catch (error) {
    if (error instanceof ReferenceWriteError) {
      return { ok: false, code: error.code, message: error.message };
    }
    throw error;
  }
}

function assertCan(actor: Actor, module: ModuleKey, action: PermissionAction): void {
  if (!can(actor.role, module, action)) {
    throw new ReferenceWriteError(
      `Your role (${actor.role}) is not allowed to ${action} ${module}.`,
      "forbidden",
    );
  }
}

/** A slug is derived, never stored from user input — two people spell it two ways. */
const slugify = (name: string): string =>
  name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/**
 * A fresh id for a new row. The letters and the length keep it clear of the
 * zero-padded sequence the seed generator uses (`CAT-001`), so a created row
 * can never collide with a seeded one. Exported because `purchasing.ts` mints a
 * Purchase Order's id the same way.
 */
export const newId = (prefix: string): string =>
  `${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`;

const nowIso = (): string => new Date().toISOString();
const todayIso = (): string => new Date().toISOString().slice(0, 10);

const FK_VIOLATION = "23503";
const UNIQUE_VIOLATION = "23505";

/**
 * The five-character SQLSTATE from a database error, or undefined. Drizzle wraps
 * the driver error in a `DrizzleQueryError`, so the real code is usually on
 * `.cause` — walk the chain rather than only reading the top level.
 */
function pgCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; current && typeof current === "object" && depth < 5; depth += 1) {
    const value = (current as { code?: unknown }).code;
    if (typeof value === "string" && /^[0-9A-Z]{5}$/.test(value)) return value;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/** Run a delete, translating the database's FK rejection into a typed failure. */
async function guardedDelete(run: () => Promise<unknown>, label: string): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (pgCode(error) === FK_VIOLATION) {
      throw new ReferenceWriteError(
        `This ${label} is still referenced by other records and cannot be deleted.`,
        "in-use",
      );
    }
    throw error;
  }
}

/* ------------------------------------------------------------------ categories --- */

export interface CategoryInput {
  name: string;
  /** Null is a top-level category. */
  parentId: string | null;
  description: string;
}

/** Reject a name whose slug already belongs to another category (silent merge otherwise). */
async function assertSlugFree(db: Db, slug: string, exceptId: string | null): Promise<void> {
  const clash = await db
    .select({ id: schema.categories.id })
    .from(schema.categories)
    .where(
      exceptId
        ? and(eq(schema.categories.slug, slug), ne(schema.categories.id, exceptId))
        : eq(schema.categories.slug, slug),
    )
    .limit(1);
  if (clash.length > 0) {
    throw new ReferenceWriteError(`The slug "${slug}" is already in use by another category.`, "conflict");
  }
}

export async function createCategory(actor: Actor, input: CategoryInput, db: Db): Promise<string> {
  assertCan(actor, "categories", "create");
  const slug = slugify(input.name);
  await assertSlugFree(db, slug, null);
  const id = newId("CAT");
  await db.insert(schema.categories).values({
    id,
    name: input.name,
    slug,
    parentId: input.parentId,
    description: input.description,
  });
  return id;
}

export async function updateCategory(
  actor: Actor,
  id: string,
  input: CategoryInput,
  db: Db,
): Promise<void> {
  assertCan(actor, "categories", "edit");
  if (input.parentId === id) {
    throw new ReferenceWriteError("A category cannot be its own parent.", "conflict");
  }
  const slug = slugify(input.name);
  await assertSlugFree(db, slug, id);
  const changed = await db
    .update(schema.categories)
    .set({ name: input.name, slug, parentId: input.parentId, description: input.description })
    .where(eq(schema.categories.id, id))
    .returning({ id: schema.categories.id });
  if (changed.length === 0) throw new ReferenceWriteError("Category not found.", "not-found");
}

export async function deleteCategory(actor: Actor, id: string, db: Db): Promise<void> {
  assertCan(actor, "categories", "delete");
  await guardedDelete(
    () => db.delete(schema.categories).where(eq(schema.categories.id, id)),
    "category",
  );
}

/* ------------------------------------------------------------------ warehouses --- */

export interface WarehouseInput {
  code: string;
  name: string;
  type: WarehouseType;
  status: "operational" | "maintenance" | "closed";
  addressLine: string;
  city: string;
  region: string;
  country: string;
  managerId: string;
  capacityPallets: number;
  timezone: string;
}

export async function createWarehouse(actor: Actor, input: WarehouseInput, db: Db): Promise<string> {
  assertCan(actor, "warehouses", "create");
  const id = newId("WH");
  await db.insert(schema.warehouses).values({
    id,
    ...input,
    // A brand-new site holds nothing and opens today; these are activity, not
    // fields an operator types.
    usedPallets: 0,
    openedAt: todayIso(),
  });
  return id;
}

export async function updateWarehouse(
  actor: Actor,
  id: string,
  input: WarehouseInput,
  db: Db,
): Promise<void> {
  assertCan(actor, "warehouses", "edit");
  const changed = await db
    .update(schema.warehouses)
    .set(input)
    .where(eq(schema.warehouses.id, id))
    .returning({ id: schema.warehouses.id });
  if (changed.length === 0) throw new ReferenceWriteError("Warehouse not found.", "not-found");
}

export async function deleteWarehouse(actor: Actor, id: string, db: Db): Promise<void> {
  assertCan(actor, "warehouses", "delete");
  await guardedDelete(
    () => db.delete(schema.warehouses).where(eq(schema.warehouses.id, id)),
    "warehouse",
  );
}

/* ------------------------------------------------------------------- locations --- */

export interface LocationInput {
  warehouseId: string;
  zone: string;
  aisle: string;
  rack: string;
  bin: string;
  type: LocationType;
  capacityUnits: number;
  restricted: boolean;
}

/** The shelf-label code — `zone-aisle-rack-bin` — derived here, not typed. */
const locationCode = (input: LocationInput): string =>
  [input.zone, input.aisle, input.rack, input.bin].map((p) => p.trim().toUpperCase()).join("-");

export async function createLocation(actor: Actor, input: LocationInput, db: Db): Promise<string> {
  assertCan(actor, "locations", "create");
  const id = newId("LOC");
  await db.insert(schema.locations).values({ id, ...input, code: locationCode(input), occupiedUnits: 0 });
  return id;
}

export async function updateLocation(
  actor: Actor,
  id: string,
  input: LocationInput,
  db: Db,
): Promise<void> {
  assertCan(actor, "locations", "edit");
  const changed = await db
    .update(schema.locations)
    .set({ ...input, code: locationCode(input) })
    .where(eq(schema.locations.id, id))
    .returning({ id: schema.locations.id });
  if (changed.length === 0) throw new ReferenceWriteError("Location not found.", "not-found");
}

/* ------------------------------------------------------------------- suppliers --- */

export interface SupplierInput {
  code: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  addressLine: string;
  city: string;
  country: string;
  paymentTerms: string;
  currency: string;
  leadTimeDays: number;
  categories: string[];
}

export async function createSupplier(actor: Actor, input: SupplierInput, db: Db): Promise<string> {
  assertCan(actor, "suppliers", "create");
  const id = newId("SUP");
  await db.insert(schema.suppliers).values({
    id,
    ...input,
    // Performance metrics are earned, not entered — a new supplier starts flat.
    onTimeRate: 0,
    fulfillmentRate: 0,
    defectRate: 0,
    totalSpend: 0,
    openOrders: 0,
    status: "active",
    since: todayIso(),
  });
  return id;
}

export async function updateSupplier(
  actor: Actor,
  id: string,
  input: SupplierInput,
  db: Db,
): Promise<void> {
  assertCan(actor, "suppliers", "edit");
  const changed = await db
    .update(schema.suppliers)
    .set(input)
    .where(eq(schema.suppliers.id, id))
    .returning({ id: schema.suppliers.id });
  if (changed.length === 0) throw new ReferenceWriteError("Supplier not found.", "not-found");
}

/* ------------------------------------------------------------------- customers --- */

export interface CustomerInput {
  code: string;
  name: string;
  type: CustomerType;
  contactName: string;
  email: string;
  phone: string;
  city: string;
  country: string;
  paymentTerms: string;
  creditLimit: number;
}

export async function createCustomer(actor: Actor, input: CustomerInput, db: Db): Promise<string> {
  assertCan(actor, "customers", "create");
  const id = newId("CUS");
  await db.insert(schema.customers).values({
    id,
    ...input,
    outstanding: 0,
    totalOrders: 0,
    totalSpend: 0,
    status: "active",
    since: todayIso(),
  });
  return id;
}

export async function updateCustomer(
  actor: Actor,
  id: string,
  input: CustomerInput,
  db: Db,
): Promise<void> {
  assertCan(actor, "customers", "edit");
  const changed = await db
    .update(schema.customers)
    .set(input)
    .where(eq(schema.customers.id, id))
    .returning({ id: schema.customers.id });
  if (changed.length === 0) throw new ReferenceWriteError("Customer not found.", "not-found");
}

/* -------------------------------------------------------------------- products --- */

export interface ProductInput {
  sku: string;
  name: string;
  categoryId: string;
  brand: string;
  /** The one supplier a reorder is raised against; also seeds `supplierIds`. */
  supplierId: string;
  unit: string;
  barcode: string;
  description: string;
  unitCost: number;
  sellPrice: number;
  reorderPoint: number;
  reorderQty: number;
  leadTimeDays: number;
  batchTracked: boolean;
  serialTracked: boolean;
  hasExpiry: boolean;
  /** Only meaningful when `hasExpiry`; stored as null otherwise. */
  shelfLifeDays: number;
}

/** A short label for tables — the form only asks for the full name. */
const shortNameOf = (name: string): string =>
  name.length <= 32 ? name : `${name.slice(0, 31).trimEnd()}…`;

/**
 * The columns the slim form owns, for both create and update. `status` and the
 * `supplierIds` list are deliberately absent: a new product gets them set once
 * in `createProduct`, and an edit must not reactivate a discontinued product or
 * collapse a multi-supplier list down to the one supplier the form knows about.
 */
function productColumns(input: ProductInput) {
  return {
    sku: input.sku,
    name: input.name,
    shortName: shortNameOf(input.name),
    categoryId: input.categoryId,
    brand: input.brand,
    description: input.description,
    barcode: input.barcode,
    unit: input.unit,
    unitCost: input.unitCost,
    sellPrice: input.sellPrice,
    primarySupplierId: input.supplierId,
    reorderPoint: input.reorderPoint,
    reorderQty: input.reorderQty,
    leadTimeDays: input.leadTimeDays,
    batchTracked: input.batchTracked,
    serialTracked: input.serialTracked,
    hasExpiry: input.hasExpiry,
    shelfLifeDays: input.hasExpiry ? input.shelfLifeDays : null,
  };
}

export async function createProduct(actor: Actor, input: ProductInput, db: Db): Promise<string> {
  assertCan(actor, "products", "create");
  const id = newId("PRD");
  const ts = nowIso();
  try {
    await db.insert(schema.products).values({
      id,
      ...productColumns(input),
      status: "active",
      supplierIds: [input.supplierId],
      // Details a slim form does not ask for; filled in on the record screen later.
      weightKg: 0,
      dimensionsCm: "",
      hsCode: "",
      createdAt: ts,
      updatedAt: ts,
    });
  } catch (error) {
    if (pgCode(error) === UNIQUE_VIOLATION) {
      throw new ReferenceWriteError(`SKU "${input.sku}" is already in the catalogue.`, "conflict");
    }
    throw error;
  }
  return id;
}

export async function updateProduct(
  actor: Actor,
  id: string,
  input: ProductInput,
  db: Db,
): Promise<void> {
  assertCan(actor, "products", "edit");
  try {
    const changed = await db
      .update(schema.products)
      .set({ ...productColumns(input), updatedAt: nowIso() })
      .where(eq(schema.products.id, id))
      .returning({ id: schema.products.id });
    if (changed.length === 0) throw new ReferenceWriteError("Product not found.", "not-found");
  } catch (error) {
    if (pgCode(error) === UNIQUE_VIOLATION) {
      throw new ReferenceWriteError(`SKU "${input.sku}" is already in the catalogue.`, "conflict");
    }
    throw error;
  }
}
