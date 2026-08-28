import Link from "next/link";
import type { Metadata } from "next";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { StatTile } from "@/components/record/field-grid";
import { ReturnsTable } from "@/components/record/returns-view";
import { Button } from "@/components/ui/button";
import { returnRows } from "@/lib/repo/returns";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { money, qty } from "@/lib/format";

export const metadata: Metadata = {
  title: "Purchase returns",
  description: "Stock sent back to suppliers, and the credit owed against it.",
};

export default async function PurchaseReturnsPage() {
  const role = await getRole();
  if (!can(role, "purchase-returns")) {
    return <PermissionDenied module="purchase-returns" role={role} />;
  }

  const rows = await returnRows("purchase");
  const open = rows.filter((r) => !["credited", "rejected"].includes(r.status));
  const credited = rows.filter((r) => r.status === "credited");
  const creditOutstanding = open.reduce((s, r) => s + r.refundTotal, 0);

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Purchasing", href: "/purchasing/purchase-orders" },
          { label: "Purchase returns" },
        ]}
        title="Purchase returns"
        description="Stock going back to a supplier — a failed inspection, a wrong variant, an over-delivery. The units leave stock when they ship; the credit is chased separately and often lags."
        actions={
          can(role, "purchase-returns", "create") && (
            <Button size="sm" className="h-8" render={<Link href="/purchasing/returns/new" />}>
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
          />
          <StatTile
            label="Credit outstanding"
            value={money(creditOutstanding)}
            tone={creditOutstanding > 0 ? "warning" : "success"}
            hint="Owed by suppliers"
          />
          <StatTile
            label="Credited"
            value={money(credited.reduce((s, r) => s + r.refundTotal, 0))}
            tone="success"
            hint={`${qty(credited.length)} settled`}
          />
        </div>
      </PageHeader>

      <div className="p-4 sm:p-6">
        <ReturnsTable
          rows={rows}
          kind="purchase"
          detailBase="/purchasing/returns"
          emptyTitle="No purchase returns"
          emptyDescription="Nothing has been sent back to a supplier. Returns are raised from a goods receipt when units fail inspection or arrive against a cancelled line."
        />
      </div>
    </>
  );
}
