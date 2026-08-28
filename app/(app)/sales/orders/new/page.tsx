import type { Metadata } from "next";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { OrderForm, type OrderStockRow } from "./order-form";
import { stockLevelRows } from "@/lib/repo/inventory";
import {
  customers as allCustomers,
  indexById,
  products as allProducts,
  warehouses as allWarehouses,
} from "@/lib/repo/reference";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";

export const metadata: Metadata = {
  title: "New sales order",
  description: "Take an order and reserve stock against it.",
};

export default async function NewSalesOrderPage() {
  const role = await getRole();
  if (!can(role, "sales-orders", "create")) {
    return <PermissionDenied module="sales-orders" role={role} action="create" />;
  }

  const customers = (await allCustomers())
    .map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      type: c.type,
      city: c.city,
      status: c.status,
      creditLimit: c.creditLimit,
      outstanding: c.outstanding,
    }))
    .sort((a, b) => {
      // Active accounts first — the rest cannot have stock reserved anyway.
      if (a.status !== b.status) return a.status === "active" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  const warehouses = (await allWarehouses())
    .filter((w) => w.status === "operational")
    .map((w) => ({ id: w.id, code: w.code, name: w.name }));

  const productById = await indexById(allProducts);

  // Availability per product per site, since a sales order ships from one site.
  const byKey = new Map<string, OrderStockRow>();
  for (const row of await stockLevelRows()) {
    if (row.available <= 0) continue;
    const product = productById.get(row.productId);
    if (!product || product.status !== "active") continue;

    const key = `${row.productId}:${row.warehouseId}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.available += row.available;
      continue;
    }
    byKey.set(key, {
      productId: row.productId,
      sku: row.sku,
      name: product.shortName,
      unit: product.unit,
      unitCost: product.unitCost,
      sellPrice: product.sellPrice,
      warehouseId: row.warehouseId,
      available: row.available,
    });
  }

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Sales", href: "/sales/orders" },
          { label: "Sales orders", href: "/sales/orders" },
          { label: "New order" },
        ]}
        title="New sales order"
        description="Availability is checked against the chosen site, and the credit check runs on the order total before anything is reserved."
      />

      <div className="p-4 sm:p-6">
        <OrderForm customers={customers} warehouses={warehouses} stock={[...byKey.values()]} />
      </div>
    </>
  );
}
