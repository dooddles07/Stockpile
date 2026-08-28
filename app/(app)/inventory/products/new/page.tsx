import type { Metadata } from "next";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { ProductForm } from "./product-form";
import { db } from "@/lib/data/store";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";

export const metadata: Metadata = {
  title: "New product",
  description: "Add a product to the catalogue.",
};

const CATEGORY_PREFIX: Record<string, string> = {
  "barcode-labelling": "BCL",
  "material-handling": "MHE",
  "safety-ppe": "PPE",
  "packaging-shipping": "PKG",
  "storage-shelving": "STG",
  "computing-peripherals": "CMP",
  "power-electrical": "PWR",
  "facility-janitorial": "FAC",
  "consumables-paper": "CNS",
};

export default async function NewProductPage() {
  const role = await getRole();
  if (!can(role, "products", "create")) {
    return <PermissionDenied module="products" role={role} action="create" />;
  }

  const categories = db.categories.map((c) => ({ id: c.id, name: c.name }));
  const suppliers = db.suppliers
    .filter((s) => s.status === "active")
    .map((s) => ({ id: s.id, name: s.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Continue the existing numbering rather than restarting at 001 — SKUs are
  // scanned and spoken aloud, so collisions are expensive.
  const prefix = CATEGORY_PREFIX[db.categories[0].slug] ?? "GEN";
  const nextNumber = db.products.length + 101;
  const suggestedSku = `${prefix}-NEW-${nextNumber}`;

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Inventory", href: "/inventory/products" },
          { label: "Products", href: "/inventory/products" },
          { label: "New product" },
        ]}
        title="New product"
        description="Everything here can be changed later, except the SKU once stock has moved against it."
      />

      <div className="p-4 sm:p-6">
        <ProductForm categories={categories} suppliers={suppliers} suggestedSku={suggestedSku} />
      </div>
    </>
  );
}
