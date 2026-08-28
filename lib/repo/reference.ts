/**
 * Reference data and people.
 *
 * Raw catalogue reads — the full list of each entity, unjoined. Screens that
 * build their own picker or filter list from `db` directly read one of these
 * once they migrate; screens that need a joined shape keep using the
 * purpose-built functions in `inventory.ts`.
 *
 * Every function here exists twice during this phase: the original body
 * under a `Sync` suffix (unused until a caller migrates to it under this
 * name), and a clean async name that only wraps it. See `inventory.ts` for
 * the fuller explanation of the pattern.
 */

import { db } from "@/lib/data/store";
import type { Category, Customer, Product, StockLocation, Supplier, User, Warehouse } from "@/lib/types";

export function productsSync(): Product[] {
  return db.products;
}

export async function products(): Promise<Product[]> {
  return productsSync();
}

export function categoriesSync(): Category[] {
  return db.categories;
}

export async function categories(): Promise<Category[]> {
  return categoriesSync();
}

export function warehousesSync(): Warehouse[] {
  return db.warehouses;
}

export async function warehouses(): Promise<Warehouse[]> {
  return warehousesSync();
}

export function locationsSync(): StockLocation[] {
  return db.locations;
}

export async function locations(): Promise<StockLocation[]> {
  return locationsSync();
}

export function suppliersSync(): Supplier[] {
  return db.suppliers;
}

export async function suppliers(): Promise<Supplier[]> {
  return suppliersSync();
}

export function customersSync(): Customer[] {
  return db.customers;
}

export async function customers(): Promise<Customer[]> {
  return customersSync();
}

export function usersSync(): User[] {
  return db.users;
}

export async function users(): Promise<User[]> {
  return usersSync();
}
