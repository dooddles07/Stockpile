import type { Metadata } from "next";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { TransferForm, type TransferStockRow } from "./transfer-form";
import { stockLevelRows } from "@/lib/repo/inventory";
import { indexById, products as allProducts, warehouses as allWarehouses } from "@/lib/repo/reference";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";

export const metadata: Metadata = {
  title: "New stock transfer",
  description: "Move stock between sites.",
};

export default async function NewTransferPage() {
  const role = await getRole();
  if (!can(role, "transfers", "create")) {
    return <PermissionDenied module="transfers" role={role} action="create" />;
  }

  const warehouses = (await allWarehouses())
    .filter((w) => w.status !== "closed")
    .map((w) => ({ id: w.id, code: w.code, name: w.name }));

  const productById = await indexById(allProducts);

  // One row per product per site: the source site's availability is what
  // constrains the transfer, not the global figure.
  const byKey = new Map<string, TransferStockRow>();
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
          { label: "Warehousing", href: "/warehousing/warehouses" },
          { label: "Transfers", href: "/warehousing/transfers" },
          { label: "New transfer" },
        ]}
        title="New stock transfer"
        description="Only stock the source site actually holds can be moved out of it, so the product list changes when you change the source."
      />

      <div className="p-4 sm:p-6">
        <TransferForm warehouses={warehouses} stock={[...byKey.values()]} />
      </div>
    </>
  );
}
