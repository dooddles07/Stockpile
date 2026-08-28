import type { Metadata } from "next";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { CustomerForm } from "./customer-form";
import { db } from "@/lib/data/store";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";

export const metadata: Metadata = {
  title: "New customer",
  description: "Open an account so orders can be placed against it.",
};

export default async function NewCustomerPage() {
  const role = await getRole();
  if (!can(role, "customers", "create")) {
    return <PermissionDenied module="customers" role={role} action="create" />;
  }

  // Continue the numbering already in use rather than starting a second format.
  const suggestedCode = `C-${
    Math.max(...db.customers.map((c) => Number(c.code.replace(/\D/g, "")) || 0)) + 1
  }`;

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Sales", href: "/sales/orders" },
          { label: "Customers", href: "/sales/customers" },
          { label: "New customer" },
        ]}
        title="New customer"
        description="Terms and credit limit take effect on the first order. Everything else can be edited afterwards."
      />

      <div className="p-4 sm:p-6">
        <CustomerForm suggestedCode={suggestedCode} />
      </div>
    </>
  );
}
