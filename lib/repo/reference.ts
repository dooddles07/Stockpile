/**
 * Reference data and people.
 *
 * Raw catalogue reads — the full list of each entity, unjoined. Screens that
 * build their own picker or filter list from `db` directly read one of these;
 * screens that need a joined shape use the purpose-built functions in
 * `inventory.ts`.
 */

import { cache } from "react";

import { getDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import type {
  Category,
  Customer,
  Product,
  RoleRow,
  StockLocation,
  Supplier,
  User,
  Warehouse,
} from "@/lib/types";

// Migrated tables — one ordered query each, deduped per request. Ordered by id
// to match the generator's order the recorded assertions were taken against.
export const products = cache(
  (): Promise<Product[]> => getDb().select().from(schema.products).orderBy(schema.products.id),
);

export const categories = cache(
  (): Promise<Category[]> => getDb().select().from(schema.categories).orderBy(schema.categories.id),
);

export const warehouses = cache(
  (): Promise<Warehouse[]> => getDb().select().from(schema.warehouses).orderBy(schema.warehouses.id),
);

export const locations = cache(
  (): Promise<StockLocation[]> => getDb().select().from(schema.locations).orderBy(schema.locations.id),
);

export const suppliers = cache(
  (): Promise<Supplier[]> => getDb().select().from(schema.suppliers).orderBy(schema.suppliers.id),
);

export const customers = cache(
  (): Promise<Customer[]> => getDb().select().from(schema.customers).orderBy(schema.customers.id),
);

export const users = cache(
  (): Promise<User[]> => getDb().select().from(schema.users).orderBy(schema.users.id),
);

/** Role rows for the permission engine and the admin screens, in matrix order. */
export const roles = cache(
  (): Promise<RoleRow[]> => getDb().select().from(schema.roles).orderBy(schema.roles.sortOrder),
);

/**
 * Index a list accessor by `id`. A screen doing many lookups against one
 * collection builds this once instead of awaiting a single-key accessor in a
 * loop or hand-rolling the same `new Map(...)` each time.
 */
export async function indexById<T extends { id: string }>(
  list: () => Promise<T[]>,
): Promise<Map<string, T>> {
  return new Map((await list()).map((item) => [item.id, item]));
}
