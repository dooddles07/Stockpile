import type { Metadata } from "next";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { CategoryForm } from "./category-form";
import { db } from "@/lib/data/store";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";

export const metadata: Metadata = {
  title: "New category",
  description: "Add a category to the catalogue tree.",
};

export default async function NewCategoryPage() {
  const role = await getRole();
  if (!can(role, "categories", "create")) {
    return <PermissionDenied module="categories" role={role} action="create" />;
  }

  const parents = db.categories
    .filter((c) => c.parentId === null)
    .map((c) => ({ id: c.id, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Inventory", href: "/inventory/products" },
          { label: "Categories", href: "/inventory/categories" },
          { label: "New category" },
        ]}
        title="New category"
        description="Categories drive reorder defaults, valuation grouping and half the filters in the product. Splitting one later means re-filing every product in it, so it is worth naming carefully now."
      />

      <div className="p-4 sm:p-6">
        <CategoryForm parents={parents} takenSlugs={db.categories.map((c) => c.slug)} />
      </div>
    </>
  );
}
