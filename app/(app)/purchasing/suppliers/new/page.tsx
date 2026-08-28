import type { Metadata } from "next";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { SupplierForm } from "./supplier-form";
import { categories as allCategories, suppliers as allSuppliers } from "@/lib/repo/reference";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";

export const metadata: Metadata = {
  title: "New supplier",
  description: "Add a supplier so purchase orders can be raised against it.",
};

export default async function NewSupplierPage() {
  const role = await getRole();
  if (!can(role, "suppliers", "create")) {
    return <PermissionDenied module="suppliers" role={role} action="create" />;
  }

  const categories = (await allCategories()).map((c) => ({ id: c.id, name: c.name }));

  // Continue the existing numbering in the format already in use. Supplier
  // codes are read aloud on the phone and typed into remittance advice, so a
  // collision — or a second format — is expensive.
  const highest = Math.max(
    ...(await allSuppliers()).map((s) => Number(s.code.replace(/\D/g, "")) || 0),
  );
  const suggestedCode = `S-${highest + 1}`;

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Purchasing", href: "/purchasing/purchase-orders" },
          { label: "Suppliers", href: "/purchasing/suppliers" },
          { label: "New supplier" },
        ]}
        title="New supplier"
        description="A supplier starts with no performance history. On-time and defect rates build up from the orders you actually receive against it."
      />

      <div className="p-4 sm:p-6">
        <SupplierForm categories={categories} suggestedCode={suggestedCode} />
      </div>
    </>
  );
}
