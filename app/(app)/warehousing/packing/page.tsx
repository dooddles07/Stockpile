import Link from "next/link";
import type { Metadata } from "next";
import { Container, Printer, Truck } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { EmptyState, PermissionDenied } from "@/components/states";
import { Section, StatTile } from "@/components/record/field-grid";
import { SimpleTable } from "@/components/record/simple-table";
import { StatusBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/data/store";
import { customerByIdSync, warehouseByIdSync } from "@/lib/repo/inventory";
import { NOW } from "@/lib/data/rng";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { dueLabel, money, qty } from "@/lib/format";
import { humanize } from "@/lib/status";
import { cn } from "@/lib/utils";
import { ActionButton } from "@/components/actions/action-button";

export const metadata: Metadata = {
  title: "Packing",
  description: "Picked orders waiting to be packed and manifested.",
};

/** The last collection of the day. Orders packed after this ship tomorrow. */
const CUTOFF = "16:30";

export default async function PackingPage() {
  const role = await getRole();
  if (!can(role, "fulfillment")) return <PermissionDenied module="fulfillment" role={role} />;

  const now = NOW.getTime();

  const queue = db.salesOrders
    .filter((o) => o.status === "packing")
    .map((o) => {
      const units = o.lines.reduce((s, l) => s + l.quantity, 0);
      return {
        id: o.id,
        number: o.number,
        customer: customerByIdSync.get(o.customerId)?.name ?? "—",
        warehouse: warehouseByIdSync.get(o.warehouseId)?.code ?? "—",
        shipToCity: o.shipToCity,
        channel: humanize(o.channel),
        promisedAt: o.promisedAt,
        late: new Date(o.promisedAt).getTime() < now,
        lines: o.lines.length,
        units,
        value: o.total,
      };
    })
    .sort((a, b) => a.promisedAt.localeCompare(b.promisedAt));

  const late = queue.filter((o) => o.late);

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Warehousing", href: "/warehousing/warehouses" }, { label: "Packing" }]}
        title="Packing"
        description={`Picked orders waiting to be boxed, labelled and manifested. Carrier cut-off is ${CUTOFF} — anything packed after that ships the next working day.`}
        actions={
          <>
            <ActionButton
              variant="outline" size="sm" className="h-8"
              feedback="Sent to printer"
              detail="Carrier labels for every packed order are queued on the label printer."
            >
              <Printer className="size-3.5" aria-hidden />
              Print labels
            </ActionButton>
            <ActionButton
              size="sm" className="h-8"
              feedback="Manifest closed"
              detail="Nothing packed after this point ships today. The carrier collection is booked."
              confirm={{ title: "Close today's manifest?", body: `Anything packed after the manifest closes ships tomorrow instead. Cut-off is ${CUTOFF}.`, action: "Close manifest" }}
            >
              <Truck className="size-3.5" aria-hidden />
              Close manifest
            </ActionButton>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile label="Awaiting packing" value={qty(queue.length)} />
          <StatTile label="Units" value={qty(queue.reduce((s, o) => s + o.units, 0))} />
          <StatTile
            label="Value on the bench"
            value={money(queue.reduce((s, o) => s + o.value, 0))}
          />
          <StatTile
            label="Past promised date"
            value={qty(late.length)}
            tone={late.length > 0 ? "danger" : "success"}
            hint={`Cut-off ${CUTOFF}`}
          />
        </div>
      </PageHeader>

      <div className="p-4 sm:p-6">
        <Section
          title="Packing bench"
          description="Everything picked and waiting to go out. Closing the manifest ships every packed order on it."
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
              {
                key: "destination",
                header: "Ship to",
                hideOnMobile: true,
                cell: (o) => <span className="text-muted-foreground">{o.shipToCity}</span>,
              },
              { key: "warehouse", header: "From", cell: (o) => <span className="font-medium">{o.warehouse}</span> },
              {
                key: "channel",
                header: "Channel",
                hideOnMobile: true,
                cell: (o) => <StatusBadge label={o.channel} tone="neutral" showDot={false} />,
              },
              { key: "lines", header: "Lines", align: "right", hideOnMobile: true, cell: (o) => qty(o.lines) },
              { key: "units", header: "Units", align: "right", cell: (o) => qty(o.units) },
              { key: "value", header: "Value", align: "right", hideOnMobile: true, cell: (o) => money(o.value) },
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
                cell: (o) => (
                  <Button variant="outline" size="sm" className="h-7" render={<Link href={`/sales/orders/${o.id}`} />}>
                    Pack
                  </Button>
                ),
              },
            ]}
            empty={
              <EmptyState
                icon={Container}
                title="The bench is clear"
                description="Nothing is waiting to be packed. Orders arrive here once picking is complete."
              />
            }
          />
        </Section>
      </div>
    </>
  );
}
