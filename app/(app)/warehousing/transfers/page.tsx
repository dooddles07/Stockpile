import Link from "next/link";
import type { Metadata } from "next";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { StatTile } from "@/components/record/field-grid";
import { Button } from "@/components/ui/button";
import { TransfersTable, type TransferTableRow } from "./transfers-table";
import { db } from "@/lib/data/store";
import { productById, userById, warehouseById } from "@/lib/repo/inventory";
import { NOW } from "@/lib/data/rng";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { money, qty } from "@/lib/format";

export const metadata: Metadata = {
  title: "Stock transfers",
  description: "Stock moving between sites, from request through to receipt.",
};

export default async function TransfersPage() {
  const role = await getRole();
  if (!can(role, "transfers")) return <PermissionDenied module="transfers" role={role} />;

  const rows: TransferTableRow[] = db.transfers.map((t) => {
    const units = t.lines.reduce((s, l) => s + l.quantity, 0);
    const receivedUnits = t.lines.reduce((s, l) => s + l.received, 0);
    const value = t.lines.reduce(
      (s, l) => s + l.quantity * (productById.get(l.productId)?.unitCost ?? 0),
      0,
    );
    const open = !["received", "cancelled"].includes(t.status);

    return {
      id: t.id,
      number: t.number,
      fromCode: warehouseById.get(t.fromWarehouseId)?.code ?? "—",
      toCode: warehouseById.get(t.toWarehouseId)?.code ?? "—",
      status: t.status,
      createdAt: t.createdAt,
      expectedAt: t.expectedAt,
      receivedAt: t.receivedAt,
      lineCount: t.lines.length,
      units,
      receivedUnits,
      value: Math.round(value),
      requestedBy: userById.get(t.requestedBy)?.name ?? "—",
      approvedBy: t.approvedBy ? (userById.get(t.approvedBy)?.name ?? null) : null,
      carrier: t.carrier,
      reason: t.reason,
      overdue: open && new Date(t.expectedAt).getTime() < NOW.getTime(),
    };
  });

  const pending = rows.filter((r) => r.status === "pending-approval");
  const inFlight = rows.filter((r) => ["in-transit", "partially-received"].includes(r.status));
  const overdue = rows.filter((r) => r.overdue);
  const warehouses = [...new Set(db.warehouses.map((w) => w.code))].sort();

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Warehousing", href: "/warehousing/warehouses" }, { label: "Transfers" }]}
        title="Stock transfers"
        description="Stock moving between sites. A transfer leaves the source the moment it is despatched and does not count at the destination until it is received — the gap is visible as in-transit stock."
        actions={
          can(role, "transfers", "create") && (
            <Button size="sm" className="h-8" render={<Link href="/warehousing/transfers/new" />}>
              <Plus className="size-3.5" aria-hidden />
              New transfer
            </Button>
          )
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile label="Transfers" value={qty(rows.length)} />
          <StatTile
            label="Awaiting approval"
            value={qty(pending.length)}
            tone={pending.length > 0 ? "warning" : "neutral"}
          />
          <StatTile
            label="In flight"
            value={qty(inFlight.length)}
            tone={inFlight.length > 0 ? "info" : "neutral"}
            hint={`${qty(inFlight.reduce((s, r) => s + r.units - r.receivedUnits, 0))} units still moving`}
          />
          <StatTile
            label="Overdue"
            value={qty(overdue.length)}
            tone={overdue.length > 0 ? "danger" : "success"}
            hint={
              overdue.length > 0
                ? `${money(overdue.reduce((s, r) => s + r.value, 0))} of stock past its date`
                : "Everything on schedule"
            }
          />
        </div>
      </PageHeader>

      <div className="p-4 sm:p-6">
        <TransfersTable rows={rows} warehouses={warehouses} />
      </div>
    </>
  );
}
