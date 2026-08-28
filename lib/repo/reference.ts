/**
 * Reference data and people.
 *
 * Raw catalogue reads — the full list of each entity, unjoined. Screens that
 * build their own picker or filter list from `db` directly read one of these;
 * screens that need a joined shape use the purpose-built functions in
 * `inventory.ts`.
 */

import { db } from "@/lib/data/store";
import type { Category, Customer, Product, StockLocation, Supplier, User, Warehouse } from "@/lib/types";

export async function products(): Promise<Product[]> {
  return db.products;
}

export async function categories(): Promise<Category[]> {
  return db.categories;
}

export async function warehouses(): Promise<Warehouse[]> {
  return db.warehouses;
}

export async function locations(): Promise<StockLocation[]> {
  return db.locations;
}

export async function suppliers(): Promise<Supplier[]> {
  return db.suppliers;
}

export async function customers(): Promise<Customer[]> {
  return db.customers;
}

export async function users(): Promise<User[]> {
  return db.users;
}

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
