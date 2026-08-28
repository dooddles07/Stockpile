import Link from "next/link";
import type { Metadata } from "next";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { StatTile } from "@/components/record/field-grid";
import { Button } from "@/components/ui/button";
import { OrdersTable, type OrderTableRow } from "./orders-table";
import { salesOrders as allSalesOrders } from "@/lib/repo/documents";
import { customers as allCustomers, indexById, warehouses as allWarehouses } from "@/lib/repo/reference";
import { NOW } from "@/lib/data/rng";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { humanize } from "@/lib/status";
import { money, qty } from "@/lib/format";

export const metadata: Metadata = {
  title: "Sales orders",
  description: "Demand, from confirmation through picking, packing and despatch.",
};

const OPEN_STATUSES = ["confirmed", "reserved", "picking", "packing", "shipped", "backorder"];

export default async function SalesOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const role = await getRole();
  if (!can(role, "sales-orders")) return <PermissionDenied module="sales-orders" role={role} />;

  const { q } = await searchParams;
  const now = NOW.getTime();

  const customerById = await indexById(allCustomers);
  const warehouseById = await indexById(allWarehouses);

  const rows: OrderTableRow[] = (await allSalesOrders()).map((o) => {
    const customer = customerById.get(o.customerId);
    const units = o.lines.reduce((s, l) => s + l.quantity, 0);
    const fulfilledUnits = o.lines.reduce((s, l) => s + l.fulfilled, 0);

    return {
      id: o.id,
      number: o.number,
      customer: customer?.name ?? "—",
      customerCode: customer?.code ?? "—",
      warehouseCode: warehouseById.get(o.warehouseId)?.code ?? "—",
      status: o.status,
      paymentStatus: o.paymentStatus,
      fulfillmentStatus: o.fulfillmentStatus,
      channel: o.channel,
      channelLabel: humanize(o.channel),
      placedAt: o.placedAt,
      promisedAt: o.promisedAt,
      shippedAt: o.shippedAt,
      lineCount: o.lines.length,
      units,
      fulfilledUnits,
      total: o.total,
      shipToCity: o.shipToCity,
      carrier: o.carrier,
      late: OPEN_STATUSES.includes(o.status) && new Date(o.promisedAt).getTime() < now,
    };
  });

  const open = rows.filter((r) => OPEN_STATUSES.includes(r.status));
  const backorders = rows.filter((r) => r.status === "backorder");
  const late = rows.filter((r) => r.late);
  const unpaid = rows.filter((r) => r.paymentStatus === "unpaid" && r.status !== "cancelled");

  const customers = [...new Set(rows.map((r) => r.customer))].sort();
  const warehouses = [...new Set([...warehouseById.values()].map((w) => w.code))].sort();

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Sales", href: "/sales/orders" }, { label: "Sales orders" }]}
        title="Sales orders"
        description="Confirming an order reserves stock against it. Reserved stock still sits in the warehouse but is no longer available to promise to anyone else — that gap is where most fulfillment surprises come from."
        actions={
          can(role, "sales-orders", "create") && (
            <Button size="sm" className="h-8" render={<Link href="/sales/orders/new" />}>
              <Plus className="size-3.5" aria-hidden />
              New sales order
            </Button>
          )
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile
            label="Open orders"
            value={qty(open.length)}
            hint={`${money(open.reduce((s, r) => s + r.total, 0))} of demand`}
          />
          <StatTile
            label="Past promised date"
            value={qty(late.length)}
            tone={late.length > 0 ? "danger" : "success"}
            hint={late.length > 0 ? `${money(late.reduce((s, r) => s + r.total, 0))} at risk` : "All on time"}
          />
          <StatTile
            label="On backorder"
            value={qty(backorders.length)}
            tone={backorders.length > 0 ? "warning" : "neutral"}
            hint="Cannot be filled from stock"
          />
          <StatTile
            label="Unpaid"
            value={money(unpaid.reduce((s, r) => s + r.total, 0))}
            tone={unpaid.length > 0 ? "warning" : "neutral"}
            hint={`${qty(unpaid.length)} orders`}
          />
        </div>
      </PageHeader>

      <div className="p-4 sm:p-6">
        <OrdersTable
          rows={rows}
          customers={customers}
          warehouses={warehouses}
          initialSearch={q}
        />
      </div>
    </>
  );
}
