import type { Metadata } from "next";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { AdjustmentForm } from "./adjustment-form";
import { productRows } from "@/lib/repo/inventory";
import { warehouses as allWarehouses } from "@/lib/repo/reference";
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

  const warehouses = (await allWarehouses()).map((w) => ({ id: w.id, code: w.code, name: w.name }));

  const products = (await productRows())
    .filter((p) => p.status === "active")
    .map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.shortName,
      unit: p.unit,
      unitCost: p.unitCost,
      sellPrice: p.sellPrice,
      available: p.stock.available,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Inventory", href: "/inventory/products" },
          { label: "Adjustments", href: "/inventory/adjustments" },
          { label: "New adjustment" },
        ]}
        title="New stock adjustment"
        description="Adjustments are permanent once posted. Nothing is written to stock until you submit, and anything over $500 of value routes to an inventory manager first."
      />

      <div className="p-4 sm:p-6">
        <AdjustmentForm warehouses={warehouses} products={products} />
      </div>
    </>
  );
}
