import type { Metadata } from "next";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { PoForm, type PoProduct } from "./po-form";
import { summaryFor } from "@/lib/repo/inventory";
import {
  products as allProducts,
  suppliers as allSuppliers,
  warehouses as allWarehouses,
} from "@/lib/repo/reference";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";

export const metadata: Metadata = {
  title: "New purchase order",
  description: "Raise an order with a supplier.",
};

export default async function NewPurchaseOrderPage() {
  const role = await getRole();
  if (!can(role, "purchase-orders", "create")) {
    return <PermissionDenied module="purchase-orders" role={role} action="create" />;
  }

  const suppliers = (await allSuppliers())
    .map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      leadTimeDays: s.leadTimeDays,
      paymentTerms: s.paymentTerms,
      onTimeRate: s.onTimeRate,
      defectRate: s.defectRate,
      status: s.status,
    }))
    .sort((a, b) => {
      // Active suppliers first — you cannot order from a supplier on hold.
      if (a.status !== b.status) return a.status === "active" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  const products: PoProduct[] = await Promise.all(
    (await allProducts())
      .filter((p) => p.status === "active")
      .map(async (p) => {
      const stock = await summaryFor(p.id);
      const belowReorder = stock.available < p.reorderPoint;
      // Bring the SKU back to its reorder point plus its standard order
      // quantity, less whatever is already on its way.
      const shortfall = Math.max(0, p.reorderPoint - stock.available);
      const suggested = Math.max(
        p.reorderQty,
        Math.ceil((shortfall + p.reorderQty - stock.incoming) / 5) * 5,
      );

      return {
        id: p.id,
        sku: p.sku,
        name: p.shortName,
        unit: p.unit,
        unitCost: p.unitCost,
        sellPrice: p.sellPrice,
        available: stock.available,
        supplierIds: p.supplierIds,
        suggestedQty: Math.max(1, suggested),
        belowReorder,
        reorderPoint: p.reorderPoint,
      };
    }),
  );

  const warehouses = (await allWarehouses())
    .filter((w) => w.status === "operational")
    .map((w) => ({ id: w.id, code: w.code, name: w.name }));

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Purchasing", href: "/purchasing/purchase-orders" },
          { label: "Purchase orders", href: "/purchasing/purchase-orders" },
          { label: "New order" },
        ]}
        title="New purchase order"
        description="Products are filtered to what the selected supplier can provide, and anything below its reorder point is offered as a suggestion with a quantity already worked out."
      />

      <div className="p-4 sm:p-6">
        <PoForm suppliers={suppliers} products={products} warehouses={warehouses} />
      </div>
    </>
  );
}
