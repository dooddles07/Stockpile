import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { ProductForm } from "../../new/product-form";
import { db } from "@/lib/data/store";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ sku: string }>;
}): Promise<Metadata> {
  const { sku } = await params;
  const product = db.products.find((p) => p.sku === sku);
  return product
    ? {
        title: `Edit ${product.sku}`,
        description: `Change the catalogue record for ${product.name}.`,
      }
    : { title: "Product not found" };
}

export default async function EditProductPage({ params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
  const role = await getRole();
  const product = db.products.find((p) => p.sku === sku);
  if (!product) notFound();
  if (!can(role, "products", "edit")) {
    return <PermissionDenied module="products" role={role} action="edit" />;
  }

  const categories = db.categories.map((c) => ({ id: c.id, name: c.name }));
  // The current supplier stays selectable even if it has since been put on
  // hold — otherwise saving an unrelated field would silently reassign it.
  const suppliers = db.suppliers
    .filter((s) => s.status === "active" || s.id === product.primarySupplierId)
    .map((s) => ({ id: s.id, name: s.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Inventory", href: "/inventory/products" },
          { label: "Products", href: "/inventory/products" },
          { label: product.sku, href: `/inventory/products/${product.sku}` },
          { label: "Edit" },
        ]}
        title={`Edit ${product.sku}`}
        description="Cost and reorder changes apply from the next movement. Stock already on the shelf keeps the cost it was received at."
      />

      <div className="p-4 sm:p-6">
        <ProductForm
          categories={categories}
          suppliers={suppliers}
          suggestedSku={product.sku}
          returnTo={`/inventory/products/${product.sku}`}
          initial={{
            sku: product.sku,
            name: product.name,
            categoryId: product.categoryId,
            brand: product.brand,
            supplierId: product.primarySupplierId,
            unit: product.unit,
            barcode: product.barcode,
            unitCost: product.unitCost,
            sellPrice: product.sellPrice,
            reorderPoint: product.reorderPoint,
            reorderQty: product.reorderQty,
            leadTimeDays: product.leadTimeDays,
            description: product.description,
            batchTracked: product.batchTracked,
            serialTracked: product.serialTracked,
            hasExpiry: product.hasExpiry,
            shelfLifeDays: product.shelfLifeDays ?? 0,
          }}
        />
      </div>
    </>
  );
}
