import Link from "next/link";
import type { Metadata } from "next";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { StatTile } from "@/components/record/field-grid";
import { Button } from "@/components/ui/button";
import { SuppliersTable, type SupplierTableRow } from "./suppliers-table";
import { products as allProducts, suppliers as allSuppliers } from "@/lib/repo/reference";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { money, percent, qty } from "@/lib/format";

export const metadata: Metadata = {
  title: "Suppliers",
  description: "Who you buy from, and how reliably they deliver.",
};

export default async function SuppliersPage() {
  const role = await getRole();
  if (!can(role, "suppliers")) return <PermissionDenied module="suppliers" role={role} />;

  const skusBySupplier = new Map<string, number>();
  for (const p of await allProducts()) {
    for (const sid of p.supplierIds) {
      skusBySupplier.set(sid, (skusBySupplier.get(sid) ?? 0) + 1);
    }
  }

  const suppliers = await allSuppliers();

  const rows: SupplierTableRow[] = suppliers.map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    contactName: s.contactName,
    email: s.email,
    city: s.city,
    country: s.country,
    status: s.status,
    paymentTerms: s.paymentTerms,
    leadTimeDays: s.leadTimeDays,
    onTimeRate: s.onTimeRate,
    fulfillmentRate: s.fulfillmentRate,
    defectRate: s.defectRate,
    totalSpend: s.totalSpend,
    openOrders: s.openOrders,
    skuCount: skusBySupplier.get(s.id) ?? 0,
    categories: s.categories,
  }));

  const active = rows.filter((r) => r.status === "active");
  const totalSpend = rows.reduce((s, r) => s + r.totalSpend, 0);
  const meanOnTime = rows.length > 0 ? rows.reduce((s, r) => s + r.onTimeRate, 0) / rows.length : 0;
  const underperforming = rows.filter((r) => r.onTimeRate < 0.85 || r.defectRate > 0.04);
  const countries = [...new Set(suppliers.map((s) => s.country))].sort();

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Purchasing", href: "/purchasing/purchase-orders" }, { label: "Suppliers" }]}
        title="Suppliers"
        description="Lead time and reliability are not administrative detail — they set reorder points and decide how much buffer stock the business has to carry."
        actions={
          can(role, "suppliers", "create") && (
            <Button size="sm" className="h-8" render={<Link href="/purchasing/suppliers/new" />}>
              <Plus className="size-3.5" aria-hidden />
              New supplier
            </Button>
          )
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile
            label="Suppliers"
            value={qty(rows.length)}
            hint={`${qty(active.length)} active`}
          />
          <StatTile label="Total spend" value={money(totalSpend)} hint="Across all placed orders" />
          <StatTile
            label="Mean on-time rate"
            value={percent(meanOnTime, 1)}
            tone={meanOnTime >= 0.95 ? "success" : meanOnTime >= 0.85 ? "warning" : "danger"}
          />
          <StatTile
            label="Underperforming"
            value={qty(underperforming.length)}
            tone={underperforming.length > 0 ? "warning" : "success"}
            hint="Under 85% on time, or over 4% defects"
          />
        </div>
      </PageHeader>

      <div className="p-4 sm:p-6">
        <SuppliersTable rows={rows} countries={countries} />
      </div>
    </>
  );
}
