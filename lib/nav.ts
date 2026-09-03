import {
  ArrowLeftRight,
  BadgeCheck,
  Barcode,
  Boxes,
  Building2,
  CalendarCheck,
  ChartNoAxesCombined,
  ClipboardCheck,
  ClipboardList,
  Coins,
  Container,
  FileText,
  Gauge,
  History,
  Inbox,
  LayoutGrid,
  Map,
  PackageCheck,
  PackageMinus,
  PackageSearch,
  Scale,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Truck,
  Undo2,
  Upload,
  UserRound,
  Users,
  Warehouse,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import type { ModuleKey } from "@/lib/types";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  module: ModuleKey;
  /** Which live count to badge this entry with, if any. */
  badge?: "approvals" | "lowStock" | "receiving" | "notifications";
  /** Extra pathnames that should light this entry up. */
  match?: string[];
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV: NavSection[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: Gauge, module: "dashboard" },
      { label: "Approvals", href: "/approvals", icon: BadgeCheck, module: "approvals", badge: "approvals" },
      { label: "Notifications", href: "/notifications", icon: Inbox, module: "dashboard", badge: "notifications" },
    ],
  },
  {
    label: "Inventory",
    items: [
      { label: "Products", href: "/inventory/products", icon: Boxes, module: "products" },
      { label: "Categories", href: "/inventory/categories", icon: LayoutGrid, module: "categories" },
      { label: "Stock levels", href: "/inventory/stock-levels", icon: PackageSearch, module: "stock" },
      { label: "Low stock", href: "/inventory/stock-levels?view=low-stock", icon: PackageMinus, module: "stock", badge: "lowStock" },
      { label: "Movements", href: "/inventory/movements", icon: History, module: "movements" },
      { label: "Adjustments", href: "/inventory/adjustments", icon: SlidersHorizontal, module: "adjustments" },
      { label: "Stock counts", href: "/inventory/counts", icon: ClipboardCheck, module: "counts" },
      { label: "Import data", href: "/import", icon: Upload, module: "products" },
    ],
  },
  {
    label: "Warehousing",
    items: [
      { label: "Warehouses", href: "/warehousing/warehouses", icon: Warehouse, module: "warehouses" },
      { label: "Locations", href: "/warehousing/locations", icon: Map, module: "locations" },
      { label: "Transfers", href: "/warehousing/transfers", icon: ArrowLeftRight, module: "transfers" },
      { label: "Receiving", href: "/warehousing/receiving", icon: PackageCheck, module: "receiving", badge: "receiving" },
      { label: "Picking", href: "/warehousing/picking", icon: ClipboardList, module: "fulfillment" },
      { label: "Packing", href: "/warehousing/packing", icon: Container, module: "fulfillment" },
    ],
  },
  {
    label: "Purchasing",
    items: [
      { label: "Purchase orders", href: "/purchasing/purchase-orders", icon: ShoppingCart, module: "purchase-orders" },
      { label: "Suppliers", href: "/purchasing/suppliers", icon: Truck, module: "suppliers" },
      { label: "Goods received", href: "/purchasing/goods-received", icon: Barcode, module: "receiving" },
      { label: "Purchase returns", href: "/purchasing/returns", icon: Undo2, module: "purchase-returns" },
    ],
  },
  {
    label: "Sales",
    items: [
      { label: "Sales orders", href: "/sales/orders", icon: FileText, module: "sales-orders" },
      { label: "Customers", href: "/sales/customers", icon: UserRound, module: "customers" },
      { label: "Sales returns", href: "/sales/returns", icon: Undo2, module: "sales-returns" },
    ],
  },
  {
    label: "Analytics",
    items: [
      { label: "Inventory", href: "/analytics/inventory", icon: ChartNoAxesCombined, module: "analytics" },
      { label: "Valuation", href: "/analytics/valuation", icon: Coins, module: "valuation" },
      { label: "Sales", href: "/analytics/sales", icon: Scale, module: "analytics" },
      { label: "Purchasing", href: "/analytics/purchasing", icon: ShoppingCart, module: "analytics" },
      { label: "Warehouse", href: "/analytics/warehouse", icon: Building2, module: "analytics" },
      { label: "Reports", href: "/analytics/reports", icon: ScrollText, module: "reports" },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Users", href: "/admin/users", icon: Users, module: "users" },
      { label: "Roles & permissions", href: "/admin/roles", icon: ShieldCheck, module: "roles" },
      { label: "Audit logs", href: "/admin/audit-logs", icon: CalendarCheck, module: "audit" },
      { label: "Automation", href: "/admin/automation", icon: Workflow, module: "automation" },
      { label: "Settings", href: "/settings/company", icon: Settings, module: "settings", match: ["/settings"] },
    ],
  },
];

/** Flat index used by the command palette and breadcrumb resolution. */
export const NAV_INDEX = NAV.flatMap((section) =>
  section.items.map((item) => ({ ...item, section: section.label })),
);
