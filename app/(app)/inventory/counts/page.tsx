import Link from "next/link";
import type { Metadata } from "next";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { StatTile } from "@/components/record/field-grid";
import { Button } from "@/components/ui/button";
import { CountsTable, type CountTableRow } from "./counts-table";
import { db } from "@/lib/data/store";
import { userById, warehouseById } from "@/lib/repo/inventory";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { humanize } from "@/lib/status";
import { money, percent, qty } from "@/lib/format";

export const metadata: Metadata = {
  title: "Stock counts",
  description: "Proving recorded quantities against what is physically on the shelf.",
};

export default async function CountsPage() {
  const role = await getRole();
  if (!can(role, "counts")) return <PermissionDenied module="counts" role={role} />;

  const rows: CountTableRow[] = db.stockCounts.map((c) => {
    const counted = c.lines.filter((l) => l.counted !== null);
    return {
      id: c.id,
      number: c.number,
      type: c.type,
      typeLabel: humanize(c.type),
      warehouseCode: warehouseById.get(c.warehouseId)?.code ?? "—",
      scopeLabel: c.scopeLabel,
      status: c.status,
      scheduledFor: c.scheduledFor,
      completedAt: c.completedAt,
      lineCount: c.lines.length,
      countedLines: counted.length,
      varianceLines: counted.filter((l) => l.variance !== 0).length,
      accuracyPct: c.accuracyPct,
      totalVarianceValue: c.totalVarianceValue,
      assignedTo: c.assignedTo.map((id) => userById.get(id)?.name ?? "—"),
      createdBy: userById.get(c.createdBy)?.name ?? "—",
    };
  });

  const active = rows.filter((r) => ["scheduled", "in-progress"].includes(r.status));
  const review = rows.filter((r) => r.status === "review");
  const settled = rows.filter((r) => ["approved", "applied"].includes(r.status));
  const meanAccuracy =
    settled.length > 0 ? settled.reduce((s, r) => s + r.accuracyPct, 0) / settled.length / 100 : 0;
  const varianceValue = settled.reduce((s, r) => s + r.totalVarianceValue, 0);
  const warehouses = [...new Set(db.warehouses.map((w) => w.code))].sort();

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Inventory", href: "/inventory/products" }, { label: "Stock counts" }]}
        title="Stock counts"
        description="A count is the only thing that proves a recorded quantity. Variances outside tolerance are recounted before anything posts, and an approved count writes its differences to the ledger as adjustments."
        actions={
          can(role, "counts", "create") && (
            <Button size="sm" className="h-8" render={<Link href="/inventory/counts/new" />}>
              <Plus className="size-3.5" aria-hidden />
              Schedule a count
            </Button>
          )
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile
            label="Open"
            value={qty(active.length)}
            tone={active.length > 0 ? "info" : "neutral"}
            hint={`${qty(active.reduce((s, r) => s + r.lineCount - r.countedLines, 0))} lines still to count`}
          />
          <StatTile
            label="Awaiting review"
            value={qty(review.length)}
            tone={review.length > 0 ? "warning" : "neutral"}
          />
          <StatTile
            label="Mean accuracy"
            value={settled.length > 0 ? percent(meanAccuracy, 1) : "—"}
            tone={meanAccuracy >= 0.99 ? "success" : meanAccuracy >= 0.97 ? "warning" : "danger"}
            hint={`Across ${qty(settled.length)} settled counts`}
          />
          <StatTile
            label="Net variance value"
            value={money(varianceValue)}
            tone={varianceValue < 0 ? "danger" : "success"}
            hint="Posted from approved counts"
          />
        </div>
      </PageHeader>

      <div className="p-4 sm:p-6">
        <CountsTable rows={rows} warehouses={warehouses} />
      </div>
    </>
  );
}
