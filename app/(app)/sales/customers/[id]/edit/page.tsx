import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { CustomerForm } from "../../new/customer-form";
import { customers as allCustomers } from "@/lib/repo/reference";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { money } from "@/lib/format";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const customer = (await allCustomers()).find((c) => c.id === id);
  return customer
    ? {
        title: `Edit ${customer.code}`,
        description: `Change the account held for ${customer.name}.`,
      }
    : { title: "Customer not found" };
}

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const role = await getRole();
  const customer = (await allCustomers()).find((c) => c.id === id);
  if (!customer) notFound();
  if (!can(role, "customers", "edit")) {
    return <PermissionDenied module="customers" role={role} action="edit" />;
  }

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Sales", href: "/sales/orders" },
          { label: "Customers", href: "/sales/customers" },
          { label: customer.code, href: `/sales/customers/${customer.id}` },
          { label: "Edit" },
        ]}
        title={`Edit ${customer.name}`}
        description={`The credit limit gates what this account can order. ${money(
          customer.outstanding,
        )} is outstanding today, so a limit below that blocks the next order rather than the ones already placed.`}
      />

      <div className="p-4 sm:p-6">
        <CustomerForm
          suggestedCode={customer.code}
          id={customer.id}
          returnTo={`/sales/customers/${customer.id}`}
          initial={{
            code: customer.code,
            name: customer.name,
            type: customer.type,
            contactName: customer.contactName,
            email: customer.email,
            phone: customer.phone,
            city: customer.city,
            country: customer.country,
            creditLimit: customer.creditLimit,
          }}
        />
      </div>
    </>
  );
}
