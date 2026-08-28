import Link from "next/link";
import type { Metadata } from "next";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { StatTile } from "@/components/record/field-grid";
import { Button } from "@/components/ui/button";
import { AdjustmentsTable, type AdjustmentTableRow } from "./adjustments-table";
import { db } from "@/lib/data/store";
import { userById, warehouseById } from "@/lib/repo/inventory";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { humanize } from "@/lib/status";
import { money, qty } from "@/lib/format";

export const metadata: Metadata = {
  title: "Stock adjustments",
  description: "Controlled corrections to stock quantities, with approval above threshold.",
};

export default async function AdjustmentsPage() {
  const role = await getRole();
  if (!can(role, "adjustments")) return <PermissionDenied module="adjustments" role={role} />;

  const rows: AdjustmentTableRow[] = db.adjustments.map((a) => ({
    id: a.id,
    number: a.number,
    warehouseCode: warehouseById.get(a.warehouseId)?.code ?? "—",
    reason: a.reason,
    reasonLabel: humanize(a.reason),
    status: a.status,
    createdAt: a.createdAt,
    appliedAt: a.appliedAt,
    lineCount: a.lines.length,
    totalDelta: a.totalDelta,
    totalValueImpact: a.totalValueImpact,
    createdBy: userById.get(a.createdBy)?.name ?? "—",
    approvedBy: a.approvedBy ? (userById.get(a.approvedBy)?.name ?? null) : null,
    requiresApproval: a.requiresApproval,
  }));

  const pending = rows.filter((r) => r.status === "pending-approval");
  const applied = rows.filter((r) => r.status === "applied");
  const writeOff = applied.filter((r) => r.totalValueImpact < 0).reduce((s, r) => s + r.totalValueImpact, 0);
  const warehouses = [...new Set(db.warehouses.map((w) => w.code))].sort();

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Inventory", href: "/inventory/products" }, { label: "Adjustments" }]}
        title="Stock adjustments"
        description="Every deliberate correction to a quantity — damage, loss, expiry, a recount or internal use. Anything moving more than $500 of value routes for approval before it touches stock."
        actions={
          can(role, "adjustments", "create") && (
            <Button size="sm" className="h-8" render={<Link href="/inventory/adjustments/new" />}>
              <Plus className="size-3.5" aria-hidden />
              New adjustment
            </Button>
          )
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile label="Adjustments" value={qty(rows.length)} />
          <StatTile
            label="Awaiting approval"
            value={qty(pending.length)}
            tone={pending.length > 0 ? "warning" : "neutral"}
            hint={
              pending.length > 0
                ? `${money(Math.abs(pending.reduce((s, r) => s + r.totalValueImpact, 0)))} of value held`
                : "Nothing waiting"
            }
          />
          <StatTile label="Applied" value={qty(applied.length)} tone="success" />
          <StatTile
            label="Written off"
            value={money(Math.abs(writeOff))}
            tone="danger"
            hint="From applied adjustments"
          />
        </div>
      </PageHeader>

      <div className="p-4 sm:p-6">
        <AdjustmentsTable rows={rows} warehouses={warehouses} />
      </div>
    </>
  );
}
