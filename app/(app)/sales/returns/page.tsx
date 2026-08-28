import Link from "next/link";
import type { Metadata } from "next";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { StatTile } from "@/components/record/field-grid";
import { ReturnsTable } from "@/components/record/returns-view";
import { Button } from "@/components/ui/button";
import { returnRowsSync } from "@/lib/repo/returns";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { money, percent, qty } from "@/lib/format";

export const metadata: Metadata = {
  title: "Sales returns",
  description: "Stock coming back from customers, and what happens to it.",
};

export default async function SalesReturnsPage() {
  const role = await getRole();
  if (!can(role, "sales-returns")) return <PermissionDenied module="sales-returns" role={role} />;

  const rows = returnRowsSync("sales");
  const open = rows.filter((r) => !["credited", "rejected"].includes(r.status));
  const refunded = rows.filter((r) => r.status === "credited");

  const totalUnits = rows.reduce((s, r) => s + r.units, 0);
  const restockedUnits = rows.reduce((s, r) => s + r.restockUnits, 0);
  const restockRate = totalUnits > 0 ? restockedUnits / totalUnits : 0;

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Sales", href: "/sales/orders" }, { label: "Sales returns" }]}
        title="Sales returns"
        description="Stock coming back from a customer. Everything is inspected on arrival — only units graded sellable go back into available stock, the rest are written off."
        actions={
          can(role, "sales-returns", "create") && (
            <Button size="sm" className="h-8" render={<Link href="/sales/returns/new" />}>
              <Plus className="size-3.5" aria-hidden />
              New return
            </Button>
          )
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile label="Returns" value={qty(rows.length)} />
          <StatTile
            label="Open"
            value={qty(open.length)}
            tone={open.length > 0 ? "warning" : "neutral"}
            hint="Awaiting inspection or credit"
          />
          <StatTile
            label="Restock rate"
            value={percent(restockRate, 0)}
            tone={restockRate >= 0.5 ? "success" : "warning"}
            hint={`${qty(restockedUnits)} of ${qty(totalUnits)} units resellable`}
          />
          <StatTile
            label="Refunded"
            value={money(refunded.reduce((s, r) => s + r.refundTotal, 0))}
            hint={`${qty(refunded.length)} settled`}
          />
        </div>
      </PageHeader>

      <div className="p-4 sm:p-6">
        <ReturnsTable
          rows={rows}
          kind="sales"
          detailBase="/sales/returns"
          emptyTitle="No sales returns"
          emptyDescription="Nothing has come back from a customer. Returns are raised against a shipped order and inspected on arrival."
        />
      </div>
    </>
  );
}
