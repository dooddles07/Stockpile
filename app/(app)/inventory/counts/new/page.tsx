import type { Metadata } from "next";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { CountForm, type CountScope } from "./count-form";
import { db } from "@/lib/data/store";
import { locationById, productById } from "@/lib/repo/inventory";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";

export const metadata: Metadata = {
  title: "Schedule a stock count",
  description: "Plan a cycle, category, location or full count.",
};

export default async function NewCountPage() {
  const role = await getRole();
  if (!can(role, "counts", "create")) {
    return <PermissionDenied module="counts" role={role} action="create" />;
  }

  const warehouses = db.warehouses
    .filter((w) => w.status !== "closed")
    .map((w) => ({ id: w.id, code: w.code, name: w.name }));

  const counters = db.users
    .filter((u) => u.role === "warehouse-staff" && u.status === "active")
    .map((u) => ({ id: u.id, name: u.name, warehouseId: u.warehouseId }));

  // SKU counts per (site, zone, category) so the form can estimate the size of
  // a count before anyone commits a shift to it.
  const buckets = new Map<string, CountScope>();
  for (const row of db.stockRows) {
    const product = productById.get(row.productId);
    const location = locationById.get(row.locationId);
    if (!product || !location || product.status !== "active") continue;

    const key = `${row.warehouseId}:${location.zone}:${product.categoryId}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.skuCount += 1;
      continue;
    }
    buckets.set(key, {
      warehouseId: row.warehouseId,
      zone: location.zone,
      categoryId: product.categoryId,
      categoryName: db.categories.find((c) => c.id === product.categoryId)?.name ?? "—",
      skuCount: 1,
    });
  }

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Inventory", href: "/inventory/products" },
          { label: "Stock counts", href: "/inventory/counts" },
          { label: "Schedule a count" },
        ]}
        title="Schedule a stock count"
        description="Scope decides how long this takes and who it disrupts, so the estimate updates as you change it."
      />

      <div className="p-4 sm:p-6">
        <CountForm
          warehouses={warehouses}
          counters={counters}
          scopes={[...buckets.values()]}
          categories={db.categories.map((c) => ({ id: c.id, name: c.name }))}
        />
      </div>
    </>
  );
}
