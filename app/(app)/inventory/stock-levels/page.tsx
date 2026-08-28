import type { Metadata } from "next";
import { Download } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { StatTile } from "@/components/record/field-grid";
import { StockTable, type StockTableRow } from "./stock-table";
import {
  STOCK_VIEWS,
  applyStockView,
  stockLevelRows,
  type StockViewKey,
} from "@/lib/repo/inventory";
import { categories as allCategories, warehouses as allWarehouses } from "@/lib/repo/reference";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { money, qty } from "@/lib/format";
import { ActionButton } from "@/components/actions/action-button";

export const metadata: Metadata = {
  title: "Stock levels",
  description: "Every stock record across every warehouse, with health, value and expiry.",
};

export default async function StockLevelsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const role = await getRole();
  if (!can(role, "stock")) return <PermissionDenied module="stock" role={role} />;

  const { view: rawView } = await searchParams;
  const view: StockViewKey = rawView && rawView in STOCK_VIEWS ? (rawView as StockViewKey) : "all";
  const meta = STOCK_VIEWS[view];

  const all = await stockLevelRows();
  const filtered = applyStockView(all, view);

  const rows: StockTableRow[] = filtered.map((r) => ({
    id: r.id,
    sku: r.sku,
    name: r.name,
    category: r.categoryName,
    warehouseCode: r.warehouseCode,
    warehouseName: r.warehouseName,
    locationCode: r.locationCode,
    onHand: r.onHand,
    reserved: r.reserved,
    damaged: r.damaged,
    available: r.available,
    incoming: r.incoming,
    inTransit: r.inTransit,
    reorderPoint: r.reorderPoint,
    unitCost: r.unitCost,
    value: r.value,
    health: r.health,
    expiresAt: r.expiresAt,
    daysToExpiry: r.daysToExpiry,
    lotNumber: r.lotNumber,
    lastCountedAt: r.lastCountedAt,
  }));

  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const totalUnits = rows.reduce((s, r) => s + r.onHand, 0);
  const reserved = rows.reduce((s, r) => s + r.reserved, 0);
  const damaged = rows.reduce((s, r) => s + r.damaged, 0);
  const skus = new Set(rows.map((r) => r.sku)).size;

  const warehouses = [...new Set((await allWarehouses()).map((w) => w.code))].sort();
  const categories = [...new Set((await allCategories()).map((c) => c.name))].sort();

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Inventory", href: "/inventory/products" }, { label: meta.label }]}
        title={view === "all" ? "Stock levels" : meta.label}
        description={meta.description}
        actions={
          can(role, "stock", "export") && (
            <ActionButton
              variant="outline" size="sm" className="h-8"
              feedback="Export started"
              detail="Every stock row across all sites, not only the current filters, as CSV."
            >
              <Download className="size-3.5" aria-hidden />
              Export
            </ActionButton>
          )
        }
      >
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          <StatTile label="Stock records" value={qty(rows.length)} hint={`${qty(skus)} distinct SKUs`} />
          <StatTile label="Units on hand" value={qty(totalUnits)} />
          <StatTile label="Reserved" value={qty(reserved)} tone="purple" />
          <StatTile
            label="Damaged"
            value={qty(damaged)}
            tone={damaged > 0 ? "danger" : "neutral"}
          />
          <StatTile
            label="Value"
            value={can(role, "valuation") ? money(totalValue) : "—"}
            hint={can(role, "valuation") ? "At unit cost" : "Restricted to Finance"}
          />
        </div>
      </PageHeader>

      <div className="p-4 sm:p-6">
        <StockTable rows={rows} view={view} warehouses={warehouses} categories={categories} />
      </div>
    </>
  );
}
