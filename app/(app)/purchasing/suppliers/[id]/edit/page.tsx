import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { SupplierForm } from "../../new/supplier-form";
import { categories as allCategories, suppliers as allSuppliers } from "@/lib/repo/reference";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supplier = (await allSuppliers()).find((s) => s.id === id);
  return supplier
    ? {
        title: `Edit ${supplier.code}`,
        description: `Change the trading terms held for ${supplier.name}.`,
      }
    : { title: "Supplier not found" };
}

export default async function EditSupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const role = await getRole();
  const supplier = (await allSuppliers()).find((s) => s.id === id);
  if (!supplier) notFound();
  if (!can(role, "suppliers", "edit")) {
    return <PermissionDenied module="suppliers" role={role} action="edit" />;
  }

  const categories = (await allCategories()).map((c) => ({ id: c.id, name: c.name }));

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Purchasing", href: "/purchasing/purchase-orders" },
          { label: "Suppliers", href: "/purchasing/suppliers" },
          { label: supplier.code, href: `/purchasing/suppliers/${supplier.id}` },
          { label: "Edit" },
        ]}
        title={`Edit ${supplier.name}`}
        description="Lead time feeds every reorder point that names this supplier, so changing it moves when the next purchase order is raised."
      />

      <div className="p-4 sm:p-6">
        <SupplierForm
          categories={categories}
          suggestedCode={supplier.code}
          returnTo={`/purchasing/suppliers/${supplier.id}`}
          initial={{
            code: supplier.code,
            name: supplier.name,
            contactName: supplier.contactName,
            email: supplier.email,
            phone: supplier.phone,
            addressLine: supplier.addressLine,
            city: supplier.city,
            country: supplier.country,
            paymentTerms: supplier.paymentTerms,
            currency: supplier.currency,
            leadTimeDays: supplier.leadTimeDays,
            categories: supplier.categories,
          }}
        />
      </div>
    </>
  );
}
