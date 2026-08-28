import Link from "next/link";
import type { Metadata } from "next";
import { PackageCheck } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { EmptyState, PermissionDenied } from "@/components/states";
import { Section, StatTile } from "@/components/record/field-grid";
import { SimpleTable } from "@/components/record/simple-table";
import { StatusBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/data/store";
import { supplierByIdSync, userByIdSync, warehouseByIdSync } from "@/lib/repo/inventory";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { date, money, plural, qty, relative } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Goods received",
  description: "Every delivery booked in against a purchase order.",
};

export default async function GoodsReceivedPage() {
  const role = await getRole();
  if (!can(role, "receiving")) return <PermissionDenied module="receiving" role={role} />;

  const receipts = db.purchaseOrders
    .filter((p) => ["partially-received", "received", "closed"].includes(p.status))
    .map((p) => {
      const ordered = p.lines.reduce((s, l) => s + l.quantity, 0);
      const received = p.lines.reduce((s, l) => s + l.fulfilled, 0);
      const receivedValue = p.lines.reduce((s, l) => s + l.fulfilled * l.unitPrice, 0);
      const onTime =
        p.receivedAt !== null &&
        new Date(p.receivedAt).getTime() <= new Date(p.expectedAt).getTime();

      return {
        id: p.id,
        number: p.number,
        supplier: supplierByIdSync.get(p.supplierId)?.name ?? "—",
        supplierId: p.supplierId,
        warehouse: warehouseByIdSync.get(p.warehouseId)?.code ?? "—",
        status: p.status,
        receivedAt: p.receivedAt,
        expectedAt: p.expectedAt,
        onTime,
        lines: p.lines.length,
        ordered,
        received,
        receivedValue: Math.round(receivedValue),
        complete: received >= ordered,
        bookedBy: userByIdSync.get(p.createdBy)?.name ?? "—",
      };
    })
    .sort((a, b) => (b.receivedAt ?? "").localeCompare(a.receivedAt ?? ""));

  const complete = receipts.filter((r) => r.complete);
  const partial = receipts.filter((r) => !r.complete);
  const late = receipts.filter((r) => r.receivedAt && !r.onTime);
  const totalValue = receipts.reduce((s, r) => s + r.receivedValue, 0);

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Purchasing", href: "/purchasing/purchase-orders" },
          { label: "Goods received" },
        ]}
        title="Goods received"
        description="Every delivery that has been booked in against a purchase order. This is the record a supplier's on-time rate is calculated from."
        actions={
          can(role, "receiving") && (
            <Button variant="outline" size="sm" className="h-8" render={<Link href="/warehousing/receiving" />}>
              <PackageCheck className="size-3.5" aria-hidden />
              Receiving desk
            </Button>
          )
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile label="Receipts" value={qty(receipts.length)} />
          <StatTile
            label="Fully received"
            value={qty(complete.length)}
            tone="success"
            hint={`${qty(partial.length)} still partial`}
          />
          <StatTile
            label="Delivered late"
            value={qty(late.length)}
            tone={late.length > 0 ? "warning" : "success"}
            hint={
              receipts.length > 0
                ? `${Math.round(((receipts.length - late.length) / receipts.length) * 100)}% on time`
                : undefined
            }
          />
          <StatTile
            label="Goods value booked"
            value={money(totalValue)}
            hint="At the price on the order"
          />
        </div>
      </PageHeader>

      <div className="p-4 sm:p-6">
        <Section
          title="Receipt history"
          description="Newest first. A partially received order stays open until the outstanding lines arrive or are cancelled."
          contentClassName="p-0"
        >
          <SimpleTable
            rows={receipts}
            getRowId={(r) => r.id}
            columns={[
              {
                key: "number",
                header: "Order",
                cell: (r) => (
                  <Link
                    href={`/purchasing/purchase-orders/${r.id}`}
                    className="text-code font-medium hover:underline"
                  >
                    {r.number}
                  </Link>
                ),
              },
              {
                key: "supplier",
                header: "Supplier",
                cell: (r) => (
                  <Link href={`/purchasing/suppliers/${r.supplierId}`} className="truncate hover:underline">
                    {r.supplier}
                  </Link>
                ),
              },
              { key: "warehouse", header: "Into", cell: (r) => <span className="font-medium">{r.warehouse}</span> },
              { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
              {
                key: "lines",
                header: "Lines",
                align: "right",
                hideOnMobile: true,
                cell: (r) => qty(r.lines),
              },
              {
                key: "received",
                header: "Received",
                align: "right",
                cell: (r) => (
                  <span className={cn(r.complete ? "text-status-success" : "text-status-warning", "font-medium")}>
                    {qty(r.received)}
                    <span className="font-normal text-muted-foreground"> / {qty(r.ordered)}</span>
                  </span>
                ),
              },
              {
                key: "value",
                header: "Value",
                align: "right",
                hideOnMobile: true,
                cell: (r) => money(r.receivedValue),
              },
              {
                key: "timing",
                header: "Timing",
                cell: (r) =>
                  r.receivedAt ? (
                    r.onTime ? (
                      <StatusBadge label="On time" tone="success" />
                    ) : (
                      <StatusBadge label="Late" tone="warning" />
                    )
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  ),
              },
              {
                key: "receivedAt",
                header: "Booked in",
                align: "right",
                cell: (r) => (
                  <span className="text-muted-foreground">
                    {r.receivedAt ? relative(r.receivedAt) : "part received"}
                  </span>
                ),
              },
              {
                key: "expected",
                header: "Expected",
                align: "right",
                hideOnMobile: true,
                cell: (r) => <span className="text-muted-foreground">{date(r.expectedAt)}</span>,
              },
            ]}
            empty={
              <EmptyState
                icon={PackageCheck}
                title="Nothing received yet"
                description="Deliveries appear here once they are booked in against a purchase order at a goods-in dock."
              />
            }
          />
        </Section>

        {partial.length > 0 && (
          <p className="mt-3 text-caption text-muted-foreground">
            {plural(partial.length, "order")} are partially received — the outstanding lines are
            still tracked as incoming stock and still count towards reorder cover.
          </p>
        )}
      </div>
    </>
  );
}
