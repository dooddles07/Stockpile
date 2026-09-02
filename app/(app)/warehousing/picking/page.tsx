import Link from "next/link";
import type { Metadata } from "next";
import { ClipboardList, Printer } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { EmptyState, PermissionDenied } from "@/components/states";
import { Section, StatTile } from "@/components/record/field-grid";
import { SimpleTable } from "@/components/record/simple-table";
import { StatusBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import { salesOrders as allSalesOrders } from "@/lib/repo/documents";
import { customers as allCustomers, indexById, warehouses as allWarehouses } from "@/lib/repo/reference";
import { NOW } from "@/lib/data/rng";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { dueLabel, money, qty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ActionButton } from "@/components/actions/action-button";
import { FulfilmentActionButton } from "@/app/(app)/sales/orders/[id]/fulfilment-actions";

export const metadata: Metadata = {
  title: "Picking",
  description: "Orders released to the floor and waiting to be picked.",
};

export default async function PickingPage() {
  const role = await getRole();
  if (!can(role, "fulfillment")) return <PermissionDenied module="fulfillment" role={role} />;

  const now = NOW.getTime();

  const customerById = await indexById(allCustomers);
  const warehouseById = await indexById(allWarehouses);

  const queue = (await allSalesOrders())
    .filter((o) => ["reserved", "picking"].includes(o.status))
    .map((o) => {
      const units = o.lines.reduce((s, l) => s + l.quantity, 0);
      const picked = o.lines.reduce((s, l) => s + l.fulfilled, 0);
      return {
        id: o.id,
        number: o.number,
        customer: customerById.get(o.customerId)?.name ?? "—",
        warehouse: warehouseById.get(o.warehouseId)?.code ?? "—",
        status: o.status,
        promisedAt: o.promisedAt,
        late: new Date(o.promisedAt).getTime() < now,
        lines: o.lines.length,
        units,
        picked,
        value: o.total,
        channel: o.channel,
      };
    })
    .sort((a, b) => a.promisedAt.localeCompare(b.promisedAt));

  const late = queue.filter((o) => o.late);
  const started = queue.filter((o) => o.status === "picking");

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Warehousing", href: "/warehousing/warehouses" }, { label: "Picking" }]}
        title="Picking"
        description="Orders with stock reserved against them, waiting to be walked. The queue is ordered by promised date, so the most urgent job is always at the top."
        actions={
          <ActionButton
            variant="outline" size="sm" className="h-8"
            feedback="Sent to printer"
            detail="Every job in the queue prints as one walk sheet, in pick order."
          >
            <Printer className="size-3.5" aria-hidden />
            Print pick list
          </ActionButton>
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile label="In the queue" value={qty(queue.length)} />
          <StatTile
            label="Started"
            value={qty(started.length)}
            tone={started.length > 0 ? "info" : "neutral"}
          />
          <StatTile
            label="Units to pick"
            value={qty(queue.reduce((s, o) => s + o.units - o.picked, 0))}
          />
          <StatTile
            label="Past promised date"
            value={qty(late.length)}
            tone={late.length > 0 ? "danger" : "success"}
            hint={late.length > 0 ? `${money(late.reduce((s, o) => s + o.value, 0))} of orders` : "All on time"}
          />
        </div>
      </PageHeader>

      <div className="p-4 sm:p-6">
        <Section
          title="Pick queue"
          description="Ordered by promised date. Starting a pick moves the order to Picking and locks the reserved stock to it."
          contentClassName="p-0"
        >
          <SimpleTable
            rows={queue}
            getRowId={(o) => o.id}
            columns={[
              {
                key: "number",
                header: "Order",
                cell: (o) => (
                  <Link href={`/sales/orders/${o.id}`} className="text-code font-medium hover:underline">
                    {o.number}
                  </Link>
                ),
              },
              { key: "customer", header: "Customer", cell: (o) => <span className="truncate">{o.customer}</span> },
              { key: "warehouse", header: "Site", cell: (o) => <span className="font-medium">{o.warehouse}</span> },
              { key: "status", header: "Status", cell: (o) => <StatusBadge status={o.status} /> },
              { key: "lines", header: "Lines", align: "right", hideOnMobile: true, cell: (o) => qty(o.lines) },
              {
                key: "units",
                header: "To pick",
                align: "right",
                cell: (o) => (
                  <span className="font-medium">
                    {qty(o.units - o.picked)}
                    <span className="text-muted-foreground"> / {qty(o.units)}</span>
                  </span>
                ),
              },
              {
                key: "value",
                header: "Value",
                align: "right",
                hideOnMobile: true,
                cell: (o) => money(o.value),
              },
              {
                key: "promised",
                header: "Promised",
                align: "right",
                cell: (o) => (
                  <span className={cn(o.late ? "font-semibold text-status-danger" : "text-muted-foreground")}>
                    {dueLabel(o.promisedAt)}
                  </span>
                ),
              },
              {
                key: "action",
                header: "",
                align: "right",
                // A reserved order starts its pick here — one advance through
                // `advanceSalesOrder`, so the queue is where the work happens.
                // Once picking, the walk sheet is the next screen.
                cell: (o) =>
                  o.status === "picking" ? (
                    <Button variant="outline" size="sm" className="h-7" render={<Link href={`/warehousing/picking/${o.id}`} />}>
                      Continue
                    </Button>
                  ) : (
                    <FulfilmentActionButton
                      salesOrderId={o.id}
                      intent="pick"
                      pendingLabel="Starting…"
                      variant="outline"
                      size="sm"
                      className="h-7"
                    >
                      Start pick
                    </FulfilmentActionButton>
                  ),
              },
            ]}
            empty={
              <EmptyState
                icon={ClipboardList}
                title="Nothing to pick"
                description="No orders currently have stock reserved and waiting. Confirmed orders appear here once their stock is allocated."
              />
            }
          />
        </Section>
      </div>
    </>
  );
}
