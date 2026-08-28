/**
 * Roles and permissions.
 *
 * Access is declared per role as one level per module rather than a 7×28×7
 * matrix of booleans — the levels expand into actions below. The admin
 * permission editor renders the expanded matrix; this is its source.
 */

import type { ModuleKey, PermissionAction, Role } from "@/lib/types";

export type AccessLevel =
  | "none"
  | "read"
  | "read-export"
  | "write"
  | "approve"
  | "manage";

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

export interface RoleMeta {
  id: Role;
  label: string;
  summary: string;
  /** What this role is accountable for, shown in the switcher and role admin. */
  responsibilities: string[];
}

export const ROLES: RoleMeta[] = [
  {
    id: "super-admin",
    label: "Super Admin",
    summary: "Unrestricted access to every module and setting.",
    responsibilities: ["System configuration", "Users and roles", "Integrations", "All operational modules"],
  },
  {
    id: "inventory-manager",
    label: "Inventory Manager",
    summary: "Owns stock accuracy across every site.",
    responsibilities: ["Stock levels", "Warehouses and transfers", "Adjustments and counts", "Inventory reporting"],
  },
  {
    id: "warehouse-staff",
    label: "Warehouse Staff",
    summary: "Executes the physical work on the floor.",
    responsibilities: ["Receiving", "Picking and packing", "Transfer execution", "Counting"],
  },
  {
    id: "purchasing-manager",
    label: "Purchasing Manager",
    summary: "Owns supply, cost and supplier relationships.",
    responsibilities: ["Purchase orders", "Suppliers", "Goods receiving", "Purchase returns"],
  },
  {
    id: "sales-manager",
    label: "Sales Manager",
    summary: "Owns demand, orders and customer outcomes.",
    responsibilities: ["Sales orders", "Customers", "Fulfillment", "Sales returns"],
  },
  {
    id: "finance",
    label: "Finance",
    summary: "Values the inventory and reconciles the cost of it.",
    responsibilities: ["Inventory valuation", "Purchase costs", "Financial reporting", "Export"],
  },
  {
    id: "auditor",
    label: "Auditor",
    summary: "Read-only across the transaction record. Cannot change anything.",
    responsibilities: ["Inventory movements", "Adjustments", "Audit logs", "Transaction history"],
  },
];

export const ROLE_BY_ID = new Map(ROLES.map((r) => [r.id, r]));

type Matrix = Record<Role, Partial<Record<ModuleKey, AccessLevel>>>;

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

const MATRIX: Matrix = {
  "super-admin": Object.fromEntries(ALL_MODULES.map((m) => [m, "manage"])) as Matrix["super-admin"],

  "inventory-manager": {
    dashboard: "read-export", approvals: "approve",
    products: "write", categories: "write", stock: "write",
    movements: "read-export", adjustments: "approve", counts: "approve",
    warehouses: "write", locations: "write", transfers: "approve",
    receiving: "write", fulfillment: "read",
    "purchase-orders": "read-export", suppliers: "read", "purchase-returns": "read",
    "sales-orders": "read", customers: "read", "sales-returns": "read",
    analytics: "read-export", valuation: "read-export", reports: "read-export",
    users: "none", roles: "none", audit: "read",
    automation: "read", integrations: "none", settings: "read",
  },

  "warehouse-staff": {
    dashboard: "read", approvals: "none",
    products: "read", categories: "read", stock: "read",
    movements: "read", adjustments: "write", counts: "write",
    warehouses: "read", locations: "read", transfers: "write",
    receiving: "write", fulfillment: "write",
    "purchase-orders": "read", suppliers: "none", "purchase-returns": "none",
    "sales-orders": "read", customers: "none", "sales-returns": "none",
    analytics: "none", valuation: "none", reports: "none",
    users: "none", roles: "none", audit: "none",
    automation: "none", integrations: "none", settings: "none",
  },

  "purchasing-manager": {
    dashboard: "read-export", approvals: "approve",
    products: "read-export", categories: "read", stock: "read-export",
    movements: "read", adjustments: "read", counts: "none",
    warehouses: "read", locations: "read", transfers: "read",
    receiving: "write", fulfillment: "none",
    "purchase-orders": "approve", suppliers: "approve", "purchase-returns": "approve",
    "sales-orders": "none", customers: "none", "sales-returns": "none",
    analytics: "read-export", valuation: "read-export", reports: "read-export",
    users: "none", roles: "none", audit: "none",
    automation: "read", integrations: "none", settings: "read",
  },

  "sales-manager": {
    dashboard: "read-export", approvals: "read",
    products: "read-export", categories: "read", stock: "read",
    movements: "none", adjustments: "none", counts: "none",
    warehouses: "read", locations: "none", transfers: "none",
    receiving: "none", fulfillment: "write",
    "purchase-orders": "none", suppliers: "none", "purchase-returns": "none",
    "sales-orders": "approve", customers: "write", "sales-returns": "approve",
    analytics: "read-export", valuation: "none", reports: "read-export",
    users: "none", roles: "none", audit: "none",
    automation: "read", integrations: "none", settings: "read",
  },

  finance: {
    dashboard: "read-export", approvals: "read",
    products: "read-export", categories: "read", stock: "read-export",
    movements: "read-export", adjustments: "read-export", counts: "read-export",
    warehouses: "read-export", locations: "read", transfers: "read-export",
    receiving: "read", fulfillment: "read",
    "purchase-orders": "read-export", suppliers: "read-export", "purchase-returns": "read-export",
    "sales-orders": "read-export", customers: "read-export", "sales-returns": "read-export",
    analytics: "read-export", valuation: "read-export", reports: "write",
    users: "none", roles: "none", audit: "read-export",
    automation: "none", integrations: "none", settings: "read",
  },

  auditor: {
    dashboard: "read", approvals: "read",
    products: "read-export", categories: "read", stock: "read-export",
    movements: "read-export", adjustments: "read-export", counts: "read-export",
    warehouses: "read", locations: "read", transfers: "read-export",
    receiving: "read", fulfillment: "read",
    "purchase-orders": "read-export", suppliers: "read", "purchase-returns": "read-export",
    "sales-orders": "read-export", customers: "read", "sales-returns": "read-export",
    analytics: "read", valuation: "read-export", reports: "read-export",
    users: "read", roles: "read", audit: "read-export",
    automation: "read", integrations: "read", settings: "read",
  },
};

export function levelFor(role: Role, module: ModuleKey): AccessLevel {
  return MATRIX[role][module] ?? "none";
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
