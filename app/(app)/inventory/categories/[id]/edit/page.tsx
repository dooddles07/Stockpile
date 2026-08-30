import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { CategoryForm } from "../../new/category-form";
import { categories as allCategories } from "@/lib/repo/reference";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const category = (await allCategories()).find((c) => c.id === id);
  return category
    ? { title: `Edit ${category.name}`, description: `Change the catalogue record for ${category.name}.` }
    : { title: "Category not found" };
}

export default async function EditCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const role = await getRole();
  const categoryList = await allCategories();
  const category = categoryList.find((c) => c.id === id);
  if (!category) notFound();
  if (!can(role, "categories", "edit")) {
    return <PermissionDenied module="categories" role={role} action="edit" />;
  }

  // A category cannot be filed under itself or one of its own descendants; the
  // simplest safe rule for a shallow tree is to offer only the other top-level
  // categories as parents.
  const parents = categoryList
    .filter((c) => c.parentId === null && c.id !== id)
    .map((c) => ({ id: c.id, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Inventory", href: "/inventory/products" },
          { label: "Categories", href: "/inventory/categories" },
          { label: category.name, href: "/inventory/categories" },
          { label: "Edit" },
        ]}
        title={`Edit ${category.name}`}
        description="Renaming a category changes the slug that reports and filters group on, so an existing grouping can split. The name change itself is safe."
      />

      <div className="p-4 sm:p-6">
        <CategoryForm
          id={category.id}
          parents={parents}
          takenSlugs={categoryList.filter((c) => c.id !== id).map((c) => c.slug)}
          returnTo="/inventory/categories"
          initial={{
            name: category.name,
            parentId: category.parentId ?? "—none—",
            description: category.description,
          }}
        />
      </div>
    </>
  );
}
