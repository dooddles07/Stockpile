import Link from "next/link";
import type { Metadata } from "next";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { StatTile } from "@/components/record/field-grid";
import { Button } from "@/components/ui/button";
import { PoTable, type PoTableRow } from "./po-table";
import { db } from "@/lib/data/store";
import { supplierById, userById, warehouseById } from "@/lib/repo/inventory";
import { NOW } from "@/lib/data/rng";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { money, qty } from "@/lib/format";

export const metadata: Metadata = {
  title: "Purchase orders",
  description: "Committed spend with suppliers, from draft through to closed.",
};

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const role = await getRole();
  if (!can(role, "purchase-orders")) {
    return <PermissionDenied module="purchase-orders" role={role} />;
  }

  const { q } = await searchParams;
  const now = NOW.getTime();

  const rows: PoTableRow[] = db.purchaseOrders.map((p) => {
    const supplier = supplierById.get(p.supplierId);
    const units = p.lines.reduce((s, l) => s + l.quantity, 0);
    const receivedUnits = p.lines.reduce((s, l) => s + l.fulfilled, 0);
    const open = ["submitted", "approved", "ordered", "partially-received"].includes(p.status);

    return {
      id: p.id,
      number: p.number,
      supplier: supplier?.name ?? "—",
      supplierCode: supplier?.code ?? "—",
      warehouseCode: warehouseById.get(p.warehouseId)?.code ?? "—",
      status: p.status,
      createdAt: p.createdAt,
      orderedAt: p.orderedAt,
      expectedAt: p.expectedAt,
      receivedAt: p.receivedAt,
      lineCount: p.lines.length,
      units,
      receivedUnits,
      total: p.total,
      createdBy: userById.get(p.createdBy)?.name ?? "—",
      approvedBy: p.approvedBy ? (userById.get(p.approvedBy)?.name ?? null) : null,
      paymentTerms: p.paymentTerms,
      overdue: open && new Date(p.expectedAt).getTime() < now,
    };
  });

  const awaitingApproval = rows.filter((r) => r.status === "submitted");
  const open = rows.filter((r) =>
    ["submitted", "approved", "ordered", "partially-received"].includes(r.status),
  );
  const overdue = rows.filter((r) => r.overdue);

  const suppliers = [...new Set(rows.map((r) => r.supplier))].sort();
  const warehouses = [...new Set(db.warehouses.map((w) => w.code))].sort();

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Purchasing", href: "/purchasing/purchase-orders" }, { label: "Purchase orders" }]}
        title="Purchase orders"
        description="An approved order is a commitment: the spend is booked and the quantity counts as incoming stock, which is what reorder planning leans on. Orders above $5,000 route for sign-off."
        actions={
          can(role, "purchase-orders", "create") && (
            <Button size="sm" className="h-8" render={<Link href="/purchasing/purchase-orders/new" />}>
              <Plus className="size-3.5" aria-hidden />
              New purchase order
            </Button>
          )
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile label="Orders" value={qty(rows.length)} />
          <StatTile
            label="Awaiting approval"
            value={qty(awaitingApproval.length)}
            tone={awaitingApproval.length > 0 ? "warning" : "neutral"}
            hint={
              awaitingApproval.length > 0
                ? `${money(awaitingApproval.reduce((s, r) => s + r.total, 0))} held up`
                : "Queue is clear"
            }
          />
          <StatTile
            label="Open commitment"
            value={money(open.reduce((s, r) => s + r.total, 0))}
            hint={`${qty(open.length)} orders in flight`}
          />
          <StatTile
            label="Overdue"
            value={qty(overdue.length)}
            tone={overdue.length > 0 ? "danger" : "success"}
            hint={
              overdue.length > 0
                ? `${money(overdue.reduce((s, r) => s + r.total, 0))} past its date`
                : "Everything on schedule"
            }
          />
        </div>
      </PageHeader>

      <div className="p-4 sm:p-6">
        <PoTable rows={rows} suppliers={suppliers} warehouses={warehouses} initialSearch={q} />
      </div>
    </>
  );
}
