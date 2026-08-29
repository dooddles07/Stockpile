/**
 * Roles and permissions.
 *
 * Access is declared per role as one level per module rather than a 7×28×7
 * matrix of booleans — the levels expand into actions below. The admin
 * permission editor renders the expanded matrix; this is its source.
 *
 * The role rows are no longer hardcoded here (ADR-0004): they live in the
 * `roles` table. `hydrateRoles` fills `ROLES`, `ROLE_BY_ID` and `MATRIX` from
 * those rows — the server calls it in `getRole()` (`lib/auth/session.ts`), the
 * client in `<RoleProvider>` from a prop, so every `can()` / `levelFor()` caller
 * still sees a populated matrix synchronously and unchanged.
 */

import type { AccessLevel, ModuleKey, PermissionAction, Role, RoleRow } from "@/lib/types";

export type { AccessLevel };

const LEVEL_ACTIONS: Record<AccessLevel, PermissionAction[]> = {
  none: [],
  read: ["view"],
  "read-export": ["view", "export"],
  write: ["view", "export", "create", "edit"],
  approve: ["view", "export", "create", "edit", "approve"],
  manage: ["view", "export", "create", "edit", "approve", "delete", "manage"],
};

export const LEVEL_LABEL: Record<AccessLevel, string> = {
  none: "No access",
  read: "View",
  "read-export": "View & export",
  write: "Edit",
  approve: "Edit & approve",
  manage: "Full control",
};

/** A role without its permission map — what the switcher and role admin show. */
export type RoleMeta = Pick<RoleRow, "id" | "label" | "summary" | "responsibilities">;

type Matrix = Record<Role, Partial<Record<ModuleKey, AccessLevel>>>;

/**
 * Populated by `hydrateRoles` from the `roles` table — empty until then.
 * `let` rather than `const` so the ESM live binding updates for importers; a
 * caller that reads these at module scope (rather than inside a render) will
 * see the empty value, so read them inside the function that uses them.
 *
 * ponytail: process-global, last-write-wins. Fine while roles are a static
 * fixture the seed loads once. When the admin write path lands (ticket 09) and
 * one request can edit roles mid-flight, this needs to become per-request state
 * (a matrix passed down, or an AsyncLocalStorage store) instead of a singleton.
 */
export let ROLES: RoleMeta[] = [];
export let ROLE_BY_ID = new Map<Role, RoleMeta>();
let MATRIX: Matrix = {} as Matrix;

/** Load the role rows into the permission engine. Idempotent; last call wins. */
export function hydrateRoles(rows: RoleRow[]): void {
  const sorted = [...rows].sort((a, b) => a.sortOrder - b.sortOrder);
  ROLES = sorted.map(({ id, label, summary, responsibilities }) => ({
    id,
    label,
    summary,
    responsibilities,
  }));
  ROLE_BY_ID = new Map(ROLES.map((r) => [r.id, r]));
  MATRIX = Object.fromEntries(sorted.map((r) => [r.id, r.permissions])) as Matrix;
}

const ALL_MODULES: ModuleKey[] = [
  "dashboard", "approvals", "products", "categories", "stock", "movements",
  "adjustments", "counts", "warehouses", "locations", "transfers", "receiving",
  "fulfillment", "purchase-orders", "suppliers", "purchase-returns",
  "sales-orders", "customers", "sales-returns", "analytics", "valuation",
  "reports", "users", "roles", "audit", "automation", "integrations", "settings",
];

export const MODULE_LABEL: Record<ModuleKey, string> = {
  dashboard: "Dashboard",
  approvals: "Approvals",
  products: "Products",
  categories: "Categories",
  stock: "Stock levels",
  movements: "Inventory movements",
  adjustments: "Stock adjustments",
  counts: "Stock counts",
  warehouses: "Warehouses",
  locations: "Locations",
  transfers: "Stock transfers",
  receiving: "Receiving",
  fulfillment: "Picking & packing",
  "purchase-orders": "Purchase orders",
  suppliers: "Suppliers",
  "purchase-returns": "Purchase returns",
  "sales-orders": "Sales orders",
  customers: "Customers",
  "sales-returns": "Sales returns",
  analytics: "Analytics",
  valuation: "Stock valuation",
  reports: "Reports",
  users: "Users",
  roles: "Roles & permissions",
  audit: "Audit logs",
  automation: "Automation",
  integrations: "Integrations",
  settings: "Settings",
};

export const MODULE_GROUP: Record<ModuleKey, string> = {
  dashboard: "Overview", approvals: "Overview",
  products: "Inventory", categories: "Inventory", stock: "Inventory",
  movements: "Inventory", adjustments: "Inventory", counts: "Inventory",
  warehouses: "Warehousing", locations: "Warehousing", transfers: "Warehousing",
  receiving: "Warehousing", fulfillment: "Warehousing",
  "purchase-orders": "Purchasing", suppliers: "Purchasing", "purchase-returns": "Purchasing",
  "sales-orders": "Sales", customers: "Sales", "sales-returns": "Sales",
  analytics: "Analytics", valuation: "Analytics", reports: "Analytics",
  users: "Administration", roles: "Administration", audit: "Administration",
  automation: "Administration", integrations: "Administration", settings: "Administration",
};

export function levelFor(role: Role, module: ModuleKey): AccessLevel {
  // `?.` covers the window before `hydrateRoles` has run (matrix still `{}`) and
  // an unknown role id — both resolve to no access rather than throwing.
  return MATRIX[role]?.[module] ?? "none";
}

export function can(role: Role, module: ModuleKey, action: PermissionAction = "view"): boolean {
  return LEVEL_ACTIONS[levelFor(role, module)].includes(action);
}

export function canAny(role: Role, modules: ModuleKey[], action: PermissionAction = "view"): boolean {
  return modules.some((m) => can(role, m, action));
}

/** True when the role can see a module but change nothing in it. */
export function isReadOnly(role: Role, module: ModuleKey): boolean {
  return can(role, module) && !can(role, module, "edit");
}

export function actionsFor(role: Role, module: ModuleKey): PermissionAction[] {
  return LEVEL_ACTIONS[levelFor(role, module)];
}

export const ALL_MODULE_KEYS = ALL_MODULES;
export const PERMISSION_ACTIONS: PermissionAction[] = [
  "view", "create", "edit", "delete", "approve", "export", "manage",
];
