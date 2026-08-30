import type { Metadata } from "next";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { RecordAdjustmentForm, type Holding } from "./record-adjustment-form";
import { allStockRows, productRows } from "@/lib/repo/inventory";
import {
  indexById,
  locations as allLocations,
  warehouses as allWarehouses,
} from "@/lib/repo/reference";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";

export const metadata: Metadata = {
  title: "New stock adjustment",
  description: "Record a deliberate correction to a stock quantity.",
};

export default async function NewAdjustmentPage() {
  const role = await getRole();
  if (!can(role, "adjustments", "create")) {
    return <PermissionDenied module="adjustments" role={role} action="create" />;
  }

  const [warehouseList, products, stockRows, locationById] = await Promise.all([
    allWarehouses(),
    productRows(),
    allStockRows(),
    indexById(allLocations),
  ]);

  const warehouses = warehouseList.map((w) => ({ id: w.id, code: w.code, name: w.name }));

  const activeProductIds = new Set(
    products.filter((p) => p.status === "active").map((p) => p.id),
  );
  const productMeta = new Map(
    products.map((p) => [p.id, { sku: p.sku, name: p.shortName }]),
  );

  // Every real holding for an active product, so the operator names the exact
  // Stock Row the choke point will lock rather than an aggregated "available".
  const holdings: Holding[] = stockRows
    .filter((r) => activeProductIds.has(r.productId))
    .map((r) => ({
      productId: r.productId,
      sku: productMeta.get(r.productId)?.sku ?? r.productId,
      productName: productMeta.get(r.productId)?.name ?? r.productId,
      warehouseId: r.warehouseId,
      locationId: r.locationId,
      locationCode: locationById.get(r.locationId)?.code ?? r.locationId,
      lotNumber: r.lotNumber ?? null,
      onHand: r.onHand,
    }))
    .sort((a, b) => a.productName.localeCompare(b.productName) || a.locationCode.localeCompare(b.locationCode));

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Inventory", href: "/inventory/products" },
          { label: "Adjustments", href: "/inventory/adjustments" },
          { label: "New adjustment" },
        ]}
        title="New stock adjustment"
        description="Records straight to the ledger the moment you submit. Pick the exact location, say why, and the on-hand balance changes with your name against it."
      />

      <div className="p-4 sm:p-6">
        <RecordAdjustmentForm warehouses={warehouses} holdings={holdings} />
      </div>
    </>
  );
}
