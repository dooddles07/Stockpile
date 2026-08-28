import Link from "next/link";
import type { Metadata } from "next";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { StatTile } from "@/components/record/field-grid";
import { Button } from "@/components/ui/button";
import { CustomersTable, type CustomerTableRow } from "./customers-table";
import { db } from "@/lib/data/store";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { humanize } from "@/lib/status";
import { money, qty } from "@/lib/format";

export const metadata: Metadata = {
  title: "Customers",
  description: "Who you sell to, what they owe and what they have bought.",
};

export default async function CustomersPage() {
  const role = await getRole();
  if (!can(role, "customers")) return <PermissionDenied module="customers" role={role} />;

  const openStatuses = ["confirmed", "reserved", "picking", "packing", "shipped", "backorder"];

  const rows: CustomerTableRow[] = db.customers.map((c) => {
    const orders = db.salesOrders.filter((o) => o.customerId === c.id);
    const openOrders = orders.filter((o) => openStatuses.includes(o.status)).length;
    const lastOrder = orders
      .map((o) => o.placedAt)
      .sort((a, b) => b.localeCompare(a))[0];

    return {
      id: c.id,
      code: c.code,
      name: c.name,
      type: c.type,
      typeLabel: humanize(c.type),
      contactName: c.contactName,
      email: c.email,
      city: c.city,
      country: c.country,
      status: c.status,
      creditLimit: c.creditLimit,
      outstanding: c.outstanding,
      creditUsed: c.creditLimit > 0 ? c.outstanding / c.creditLimit : 0,
      totalOrders: c.totalOrders,
      totalSpend: c.totalSpend,
      openOrders,
      lastOrderAt: lastOrder ?? null,
      since: c.since,
    };
  });

  const totalSpend = rows.reduce((s, r) => s + r.totalSpend, 0);
  const outstanding = rows.reduce((s, r) => s + r.outstanding, 0);
  const nearLimit = rows.filter((r) => r.creditUsed > 0.9);
  const countries = [...new Set(db.customers.map((c) => c.country))].sort();

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Sales", href: "/sales/orders" }, { label: "Customers" }]}
        title="Customers"
        description="A customer's credit limit gates what they can order — an account over its limit cannot have new stock reserved against it until the balance comes down."
        actions={
          can(role, "customers", "create") && (
            <Button size="sm" className="h-8" render={<Link href="/sales/customers/new" />}>
              <Plus className="size-3.5" aria-hidden />
              New customer
            </Button>
          )
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile
            label="Customers"
            value={qty(rows.length)}
            hint={`${qty(rows.filter((r) => r.status === "active").length)} active`}
          />
          <StatTile label="Lifetime value" value={money(totalSpend)} />
          <StatTile
            label="Outstanding"
            value={money(outstanding)}
            tone={outstanding > 0 ? "warning" : "neutral"}
            hint="Invoiced and unpaid"
          />
          <StatTile
            label="Near credit limit"
            value={qty(nearLimit.length)}
            tone={nearLimit.length > 0 ? "danger" : "success"}
            hint="Over 90% of their limit"
          />
        </div>
      </PageHeader>

      <div className="p-4 sm:p-6">
        <CustomersTable rows={rows} countries={countries} />
      </div>
    </>
  );
}
