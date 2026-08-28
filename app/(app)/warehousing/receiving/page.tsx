import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeftRight, PackageCheck, Truck } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { EmptyState, PermissionDenied } from "@/components/states";
import { StatTile } from "@/components/record/field-grid";
import { SimpleTable } from "@/components/record/simple-table";
import { Section } from "@/components/record/field-grid";
import { StatusBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/data/store";
import { productByIdSync, supplierByIdSync, warehouseByIdSync } from "@/lib/repo/inventory";
import { NOW } from "@/lib/data/rng";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { date, dueLabel, money, qty } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Receiving",
  description: "Everything due in at a goods-in dock, from suppliers and from other sites.",
};

export default async function ReceivingPage() {
  const role = await getRole();
  if (!can(role, "receiving")) return <PermissionDenied module="receiving" role={role} />;

  const now = NOW.getTime();

  const purchaseReceipts = db.purchaseOrders
    .filter((p) => ["ordered", "partially-received"].includes(p.status))
    .map((p) => {
      const ordered = p.lines.reduce((s, l) => s + l.quantity, 0);
      const received = p.lines.reduce((s, l) => s + l.fulfilled, 0);
      return {
        id: p.id,
        number: p.number,
        source: supplierByIdSync.get(p.supplierId)?.name ?? "—",
        warehouse: warehouseByIdSync.get(p.warehouseId)?.code ?? "—",
        status: p.status,
        expectedAt: p.expectedAt,
        overdue: new Date(p.expectedAt).getTime() < now,
        lines: p.lines.length,
        ordered,
        received,
        outstanding: ordered - received,
        value: p.total,
        href: `/purchasing/purchase-orders/${p.id}`,
      };
    })
    .sort((a, b) => a.expectedAt.localeCompare(b.expectedAt));

  const transferReceipts = db.transfers
    .filter((t) => ["in-transit", "partially-received"].includes(t.status))
    .map((t) => {
      const shipped = t.lines.reduce((s, l) => s + l.shipped, 0);
      const received = t.lines.reduce((s, l) => s + l.received, 0);
      return {
        id: t.id,
        number: t.number,
        source: `${warehouseByIdSync.get(t.fromWarehouseId)?.code} · ${warehouseByIdSync.get(t.fromWarehouseId)?.name}`,
        warehouse: warehouseByIdSync.get(t.toWarehouseId)?.code ?? "—",
        status: t.status,
        expectedAt: t.expectedAt,
        overdue: new Date(t.expectedAt).getTime() < now,
        lines: t.lines.length,
        ordered: shipped,
        received,
        outstanding: shipped - received,
        value: Math.round(
          t.lines.reduce((s, l) => s + l.quantity * (productByIdSync.get(l.productId)?.unitCost ?? 0), 0),
        ),
        href: `/warehousing/transfers/${t.id}?tab=receive`,
      };
    })
    .sort((a, b) => a.expectedAt.localeCompare(b.expectedAt));

  const all = [...purchaseReceipts, ...transferReceipts];
  const overdue = all.filter((r) => r.overdue);
  const dueToday = all.filter((r) => !r.overdue && (r.expectedAt ?? "").slice(0, 10) === NOW.toISOString().slice(0, 10));

  const columns = (kind: "purchase" | "transfer") => [
    {
      key: "number",
      header: kind === "purchase" ? "Purchase order" : "Transfer",
      cell: (r: (typeof all)[number]) => (
        <Link href={r.href} className="text-code font-medium hover:underline">
          {r.number}
        </Link>
      ),
    },
    {
      key: "source",
      header: kind === "purchase" ? "Supplier" : "From",
      cell: (r: (typeof all)[number]) => <span className="truncate">{r.source}</span>,
    },
    {
      key: "warehouse",
      header: "Into",
      cell: (r: (typeof all)[number]) => <span className="font-medium">{r.warehouse}</span>,
    },
    {
      key: "status",
      header: "Status",
      cell: (r: (typeof all)[number]) => <StatusBadge status={r.status} />,
    },
    {
      key: "lines",
      header: "Lines",
      align: "right" as const,
      hideOnMobile: true,
      cell: (r: (typeof all)[number]) => qty(r.lines),
    },
    {
      key: "outstanding",
      header: "Outstanding",
      align: "right" as const,
      cell: (r: (typeof all)[number]) => (
        <span className="font-medium">
          {qty(r.outstanding)}
          <span className="text-muted-foreground"> / {qty(r.ordered)}</span>
        </span>
      ),
    },
    {
      key: "value",
      header: "Value",
      align: "right" as const,
      hideOnMobile: true,
      cell: (r: (typeof all)[number]) => money(r.value),
    },
    {
      key: "expected",
      header: "Expected",
      align: "right" as const,
      cell: (r: (typeof all)[number]) => (
        <span className={cn(r.overdue ? "font-semibold text-status-danger" : "text-muted-foreground")}>
          {date(r.expectedAt)}
          <span className="block text-[11px] font-normal">{dueLabel(r.expectedAt)}</span>
        </span>
      ),
    },
    {
      key: "action",
      header: "",
      align: "right" as const,
      cell: (r: (typeof all)[number]) => (
        <Button variant="outline" size="sm" className="h-7" render={<Link href={r.href} />}>
          Receive
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Warehousing", href: "/warehousing/warehouses" }, { label: "Receiving" }]}
        title="Receiving"
        description="Everything due in at a goods-in dock, whether it is coming from a supplier or from another site. Nothing counts as stock until it is checked in against its document."
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile label="Awaiting receipt" value={qty(all.length)} />
          <StatTile
            label="From suppliers"
            value={qty(purchaseReceipts.length)}
            hint={`${qty(purchaseReceipts.reduce((s, r) => s + r.outstanding, 0))} units outstanding`}
          />
          <StatTile
            label="From other sites"
            value={qty(transferReceipts.length)}
            tone={transferReceipts.length > 0 ? "info" : "neutral"}
            hint={`${qty(transferReceipts.reduce((s, r) => s + r.outstanding, 0))} units in transit`}
          />
          <StatTile
            label="Overdue"
            value={qty(overdue.length)}
            tone={overdue.length > 0 ? "danger" : "success"}
            hint={dueToday.length > 0 ? `${qty(dueToday.length)} due today` : "Nothing due today"}
          />
        </div>
      </PageHeader>

      <div className="grid gap-4 p-4 sm:p-6">
        <Section
          title="Inbound from suppliers"
          description="Purchase orders that have been placed and not yet fully booked in."
          actions={
            <Button variant="outline" size="sm" className="h-7" render={<Link href="/purchasing/purchase-orders" />}>
              All purchase orders
            </Button>
          }
          contentClassName="p-0"
        >
          <SimpleTable
            rows={purchaseReceipts}
            getRowId={(r) => r.id}
            columns={columns("purchase")}
            empty={
              <EmptyState
                icon={PackageCheck}
                title="Nothing inbound from suppliers"
                description="Every placed purchase order has been fully received. New orders appear here once they are placed with the supplier."
                className="py-10"
              />
            }
          />
        </Section>

        <Section
          title="Inbound from other sites"
          description="Transfers despatched from another warehouse and not yet landed."
          actions={
            <Button variant="outline" size="sm" className="h-7" render={<Link href="/warehousing/transfers" />}>
              All transfers
            </Button>
          }
          contentClassName="p-0"
        >
          <SimpleTable
            rows={transferReceipts}
            getRowId={(r) => r.id}
            columns={columns("transfer")}
            empty={
              <EmptyState
                icon={ArrowLeftRight}
                title="Nothing in transit"
                description="No stock is currently moving between sites, so there is nothing to book in from a transfer."
                className="py-10"
              />
            }
          />
        </Section>

        {overdue.length > 0 && (
          <div className="flex items-start gap-3 rounded-lg border border-status-danger-border bg-status-danger-bg p-4">
            <Truck className="mt-0.5 size-4 shrink-0 text-status-danger" aria-hidden />
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-status-danger">
                {qty(overdue.length)} deliveries are past their expected date
              </p>
              <p className="mt-1 text-caption leading-relaxed text-status-danger/90">
                {money(overdue.reduce((s, r) => s + r.value, 0))} of committed stock has not arrived
                when it should have. Chase the supplier or carrier, and update the expected date so
                planning downstream stays honest.
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
