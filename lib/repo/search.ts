import { db } from "@/lib/data/store";
import { summaryForSync } from "./inventory";
import type { ModuleKey, Role } from "@/lib/types";
import { can } from "@/lib/auth/permissions";

export type SearchKind =
  | "product"
  | "purchase-order"
  | "sales-order"
  | "transfer"
  | "supplier"
  | "customer"
  | "warehouse"
  | "adjustment"
  | "count";

export interface SearchHit {
  kind: SearchKind;
  id: string;
  title: string;
  subtitle: string;
  meta: string;
  href: string;
}

const KIND_LABEL: Record<SearchKind, string> = {
  product: "Products",
  "purchase-order": "Purchase orders",
  "sales-order": "Sales orders",
  transfer: "Transfers",
  supplier: "Suppliers",
  customer: "Customers",
  warehouse: "Warehouses",
  adjustment: "Adjustments",
  count: "Stock counts",
};

const KIND_MODULE: Record<SearchKind, ModuleKey> = {
  product: "products",
  "purchase-order": "purchase-orders",
  "sales-order": "sales-orders",
  transfer: "transfers",
  supplier: "suppliers",
  customer: "customers",
  warehouse: "warehouses",
  adjustment: "adjustments",
  count: "counts",
};

export function kindLabel(kind: SearchKind): string {
  return KIND_LABEL[kind];
}

/**
 * Global search. Ranks exact identifier matches (a scanned SKU, a typed PO
 * number) above name matches — an operator pasting "BCL-SCN-104" wants that
 * one row first, not every scanner in the catalogue.
 */
export function searchSync(query: string, role: Role, limitPerKind = 5): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const hits: (SearchHit & { score: number })[] = [];

  const push = (hit: SearchHit, haystacks: string[]) => {
    if (!can(role, KIND_MODULE[hit.kind])) return;
    let best = Infinity;
    for (let i = 0; i < haystacks.length; i++) {
      const h = haystacks[i].toLowerCase();
      if (h === q) best = Math.min(best, i * 10);
      else if (h.startsWith(q)) best = Math.min(best, 1 + i * 10);
      else if (h.includes(q)) best = Math.min(best, 4 + i * 10);
    }
    if (best !== Infinity) hits.push({ ...hit, score: best });
  };

  for (const p of db.products) {
    const stock = summaryForSync(p.id);
    push(
      {
        kind: "product",
        id: p.id,
        title: p.name,
        subtitle: p.sku,
        meta: `${stock.available} available`,
        href: `/inventory/products/${p.sku}`,
      },
      [p.sku, p.barcode, p.name, p.brand],
    );
  }

  for (const po of db.purchaseOrders) {
    const supplier = db.suppliers.find((s) => s.id === po.supplierId);
    push(
      {
        kind: "purchase-order",
        id: po.id,
        title: po.number,
        subtitle: supplier?.name ?? "—",
        meta: po.status,
        href: `/purchasing/purchase-orders/${po.id}`,
      },
      [po.number, supplier?.name ?? ""],
    );
  }

  for (const so of db.salesOrders) {
    const customer = db.customers.find((c) => c.id === so.customerId);
    push(
      {
        kind: "sales-order",
        id: so.id,
        title: so.number,
        subtitle: customer?.name ?? "—",
        meta: so.status,
        href: `/sales/orders/${so.id}`,
      },
      [so.number, customer?.name ?? "", so.trackingNumber ?? ""],
    );
  }

  for (const t of db.transfers) {
    push(
      {
        kind: "transfer",
        id: t.id,
        title: t.number,
        subtitle: `${db.warehouses.find((w) => w.id === t.fromWarehouseId)?.code} → ${db.warehouses.find((w) => w.id === t.toWarehouseId)?.code}`,
        meta: t.status,
        href: `/warehousing/transfers/${t.id}`,
      },
      [t.number, t.trackingNumber ?? ""],
    );
  }

  for (const s of db.suppliers) {
    push(
      {
        kind: "supplier",
        id: s.id,
        title: s.name,
        subtitle: s.code,
        meta: `${s.city}, ${s.country}`,
        href: `/purchasing/suppliers/${s.id}`,
      },
      [s.code, s.name, s.email, s.city],
    );
  }

  for (const c of db.customers) {
    push(
      {
        kind: "customer",
        id: c.id,
        title: c.name,
        subtitle: c.code,
        meta: `${c.totalOrders} orders`,
        href: `/sales/customers/${c.id}`,
      },
      [c.code, c.name, c.email, c.city],
    );
  }

  for (const w of db.warehouses) {
    push(
      {
        kind: "warehouse",
        id: w.id,
        title: w.name,
        subtitle: w.code,
        meta: `${w.city}, ${w.region}`,
        href: `/warehousing/warehouses/${w.id}`,
      },
      [w.code, w.name, w.city],
    );
  }

  for (const a of db.adjustments) {
    push(
      {
        kind: "adjustment",
        id: a.id,
        title: a.number,
        subtitle: a.reason.replace(/-/g, " "),
        meta: a.status,
        href: `/inventory/adjustments/${a.id}`,
      },
      [a.number],
    );
  }

  for (const c of db.stockCounts) {
    push(
      {
        kind: "count",
        id: c.id,
        title: c.number,
        subtitle: c.scopeLabel,
        meta: c.status,
        href: `/inventory/counts/${c.id}`,
      },
      [c.number],
    );
  }

  hits.sort((a, b) => a.score - b.score || a.title.localeCompare(b.title));

  const perKind = new Map<SearchKind, number>();
  const out: SearchHit[] = [];
  for (const hit of hits) {
    const used = perKind.get(hit.kind) ?? 0;
    if (used >= limitPerKind) continue;
    perKind.set(hit.kind, used + 1);
    const { score: _score, ...rest } = hit;
    void _score;
    out.push(rest);
    if (out.length >= 30) break;
  }
  return out;
}

export async function search(query: string, role: Role, limitPerKind = 5): Promise<SearchHit[]> {
  return searchSync(query, role, limitPerKind);
}
