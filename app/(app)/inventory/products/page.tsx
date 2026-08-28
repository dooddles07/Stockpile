import Link from "next/link";
import type { Metadata } from "next";
import { Download, Plus, Upload } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { Button } from "@/components/ui/button";
import { ProductsTable, type ProductTableRow } from "./products-table";
import { productRows } from "@/lib/repo/inventory";
import { categories as allCategories, suppliers as allSuppliers } from "@/lib/repo/reference";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { money, qty } from "@/lib/format";
import { ActionButton } from "@/components/actions/action-button";

export const metadata: Metadata = {
  title: "Products",
  description: "The product catalogue with live stock position across every warehouse.",
};

export default async function ProductsPage() {
  const role = await getRole();
  if (!can(role, "products")) return <PermissionDenied module="products" role={role} />;

  const rows: ProductTableRow[] = (await productRows()).map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    shortName: p.shortName,
    category: p.categoryName,
    brand: p.brand,
    supplier: p.supplierName,
    status: p.status,
    health: p.stock.health,
    available: p.stock.available,
    reserved: p.stock.reserved,
    incoming: p.stock.incoming,
    onHand: p.stock.onHand,
    reorderPoint: p.reorderPoint,
    unitCost: p.unitCost,
    sellPrice: p.sellPrice,
    margin: p.sellPrice > 0 ? (p.sellPrice - p.unitCost) / p.sellPrice : 0,
    stockValue: p.stock.value,
    sites: p.stock.warehouseCount,
    updatedAt: p.updatedAt,
    unit: p.unit,
  }));

  const totalValue = rows.reduce((s, r) => s + r.stockValue, 0);
  const activeCount = rows.filter((r) => r.status === "active").length;
  const categories = [...new Set((await allCategories()).map((c) => c.name))].sort();
  const suppliers = [...new Set((await allSuppliers()).map((s) => s.name))].sort();

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Inventory", href: "/inventory/products" }, { label: "Products" }]}
        title="Products"
        description={`${qty(rows.length)} SKUs in the catalogue · ${qty(activeCount)} active · ${money(totalValue)} of stock on hand.`}
        actions={
          <>
            {can(role, "products", "export") && (
              <ActionButton
                variant="outline" size="sm" className="h-8"
                feedback="Export started"
                detail="The whole catalogue, not only the rows the table is filtered to, as CSV."
              >
                <Download className="size-3.5" aria-hidden />
                Export
              </ActionButton>
            )}
            {can(role, "products", "create") && (
              <>
                <Button variant="outline" size="sm" className="h-8" render={<Link href="/import" />}>
                  <Upload className="size-3.5" aria-hidden />
                  Import
                </Button>
                <Button size="sm" className="h-8" render={<Link href="/inventory/products/new" />}>
                  <Plus className="size-3.5" aria-hidden />
                  New product
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="p-4 sm:p-6">
        <ProductsTable rows={rows} categories={categories} suppliers={suppliers} />
      </div>
    </>
  );
}
