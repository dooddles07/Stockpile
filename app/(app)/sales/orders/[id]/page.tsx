import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Download, MapPin, Printer, Truck, Undo2 } from "lucide-react";

import { RecordHeader, StatStrip } from "@/components/record/record-header";
import { DetailTabs } from "@/components/record/detail-tabs";
import { FieldGrid, Section, StatTile } from "@/components/record/field-grid";
import { SimpleTable } from "@/components/record/simple-table";
import { Timeline, type TimelineEntry } from "@/components/record/timeline";
import { FulfilmentPanel } from "./fulfilment-panel";
import { FulfilmentActionButton } from "./fulfilment-actions";
import { OPEN_SO_STATUSES } from "@/lib/domain/fulfilment";
import { WorkflowStepper } from "@/components/status/workflow-stepper";
import { StatusBadge } from "@/components/status/status-badge";
import { EmptyState, PermissionDenied } from "@/components/states";
import { Button } from "@/components/ui/button";
import { returns as allReturns, salesOrders as allSalesOrders } from "@/lib/repo/documents";
import {
  customerById,
  stockRowsFor,
  summaryFor,
  userById,
  warehouseById,
} from "@/lib/repo/inventory";
import { indexById, locations as allLocations, products as allProducts } from "@/lib/repo/reference";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { date, dateTime, deliveryLabel, money, percent, plural, qty } from "@/lib/format";
import { humanize } from "@/lib/status";
import { ActionButton } from "@/components/actions/action-button";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const order = (await allSalesOrders()).find((o) => o.id === id);
  return order
    ? { title: order.number, description: `Sales order — ${money(order.total)}.` }
    : { title: "Sales order not found" };
}


export default async function SalesOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const role = await getRole();
  if (!can(role, "sales-orders")) return <PermissionDenied module="sales-orders" role={role} />;

  const { id } = await params;
  const order = (await allSalesOrders()).find((o) => o.id === id);
  if (!order) notFound();

  const customer = await customerById(order.customerId);
  const warehouse = await warehouseById(order.warehouseId);
  const productById = await indexById(allProducts);
  const locationById = await indexById(allLocations);

  const units = order.lines.reduce((s, l) => s + l.quantity, 0);
  const fulfilledUnits = order.lines.reduce((s, l) => s + l.fulfilled, 0);
  const progress = units > 0 ? fulfilledUnits / units : 0;

  const stage = OPEN_SO_STATUSES.find((s) => s === order.status);
  const returns = (await allReturns()).filter(
    (r) => r.kind === "sales" && r.sourceOrderId === order.id,
  );

  // Availability at the order's own warehouse — the global figure would say a
  // line is fine when the stock is in the wrong building.
  const lineAvailability = new Map<string, { atSite: number; global: number; bin: string }>(
    await Promise.all(
      order.lines.map(async (line) => {
        const rows = (await stockRowsFor(line.productId)).filter(
          (r) => r.warehouseId === order.warehouseId,
        );
        const atSite = rows.reduce(
          (s, r) => s + Math.max(0, r.onHand - r.reserved - r.damaged),
          0,
        );
        return [
          line.id,
          {
            atSite,
            global: (await summaryFor(line.productId)).available,
            bin: rows[0] ? (locationById.get(rows[0].locationId)?.code ?? "—") : "—",
          },
        ] as const;
      }),
    ),
  );

  const shortLines = order.lines.filter(
    (l) => (lineAvailability.get(l.id)?.atSite ?? 0) < l.quantity - l.fulfilled,
  );

  const timeline: TimelineEntry[] = [
    {
      id: "placed",
      ts: order.placedAt,
      tone: "neutral",
      title: `Placed via ${humanize(order.channel)}`,
      detail: `${plural(order.lines.length, "line")} · ${money(order.total, { cents: true })}`,
      actor: (await userById(order.createdBy))?.name,
    },
  ];

  if (order.status !== "draft" && order.status !== "cancelled") {
    timeline.push({
      id: "reserved",
      ts: order.placedAt,
      tone: "purple",
      title: `Stock reserved at ${warehouse?.code}`,
      detail: `${qty(units)} units are no longer available to promise to anyone else.`,
    });
  }

  if (order.shippedAt) {
    timeline.push({
      id: "shipped",
      ts: order.shippedAt,
      tone: "info",
      icon: Truck,
      title: `Despatched to ${order.shipToCity}`,
      detail: order.carrier
        ? `${order.carrier}${order.trackingNumber ? ` · ${order.trackingNumber}` : ""}`
        : undefined,
    });
  }

  /* --------------------------------------------------------------- lines -- */

  const linesTab = (
    <Section
      title="Order lines"
      description="What was ordered, what is available at this site, and how much has gone out."
      contentClassName="p-0"
    >
      <SimpleTable
        rows={order.lines}
        getRowId={(l) => l.id}
        columns={[
          {
            key: "product",
            header: "Product",
            cell: (l) => (
              <Link href={`/inventory/products/${l.sku}`} className="grid gap-0.5 hover:underline">
                <span className="font-medium">{productById.get(l.productId)?.shortName ?? l.name}</span>
                <span className="text-code text-[11px] text-muted-foreground">{l.sku}</span>
              </Link>
            ),
          },
          {
            key: "bin",
            header: "Bin",
            hideOnMobile: true,
            cell: (l) => (
              <span className="text-code text-muted-foreground">
                {lineAvailability.get(l.id)?.bin ?? "—"}
              </span>
            ),
          },
          { key: "qty", header: "Ordered", align: "right", cell: (l) => qty(l.quantity) },
          {
            key: "fulfilled",
            header: "Fulfilled",
            align: "right",
            cell: (l) => (
              <span
                className={
                  l.fulfilled >= l.quantity
                    ? "font-semibold text-status-success"
                    : l.fulfilled > 0
                      ? "font-semibold text-status-warning"
                      : "text-muted-foreground"
                }
              >
                {qty(l.fulfilled)}
              </span>
            ),
          },
          {
            key: "available",
            header: `Available at ${warehouse?.code}`,
            align: "right",
            cell: (l) => {
              const a = lineAvailability.get(l.id);
              const outstanding = l.quantity - l.fulfilled;
              const short = (a?.atSite ?? 0) < outstanding;
              return (
                <span className="grid justify-items-end gap-0.5">
                  <span className={short ? "font-semibold text-status-danger" : ""}>
                    {qty(a?.atSite ?? 0)}
                  </span>
                  {short && (a?.global ?? 0) > (a?.atSite ?? 0) && (
                    <span className="text-[11px] font-normal text-muted-foreground">
                      {qty(a!.global)} elsewhere
                    </span>
                  )}
                </span>
              );
            },
          },
          {
            key: "unitPrice",
            header: "Unit price",
            align: "right",
            cell: (l) => money(l.unitPrice, { cents: true }),
          },
          {
            key: "discount",
            header: "Disc",
            align: "right",
            hideOnMobile: true,
            cell: (l) =>
              l.discountPct > 0 ? (
                <span className="text-status-success">{l.discountPct}%</span>
              ) : (
                <span className="text-muted-foreground">—</span>
              ),
          },
          {
            key: "total",
            header: "Line total",
            align: "right",
            cell: (l) => <span className="font-medium">{money(l.lineTotal, { cents: true })}</span>,
          },
        ]}
        footer={
          <dl className="ml-auto grid max-w-xs gap-1.5 text-[13px]">
            <div className="flex justify-between gap-6">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="tabular" data-numeric>
                {money(order.subtotal, { cents: true })}
              </dd>
            </div>
            {order.discountTotal > 0 && (
              <div className="flex justify-between gap-6">
                <dt className="text-muted-foreground">Discount</dt>
                <dd className="tabular text-status-success" data-numeric>
                  −{money(order.discountTotal, { cents: true })}
                </dd>
              </div>
            )}
            {order.taxTotal > 0 && (
              <div className="flex justify-between gap-6">
                <dt className="text-muted-foreground">Tax</dt>
                <dd className="tabular" data-numeric>
                  {money(order.taxTotal, { cents: true })}
                </dd>
              </div>
            )}
            {order.shipping > 0 && (
              <div className="flex justify-between gap-6">
                <dt className="text-muted-foreground">Shipping</dt>
                <dd className="tabular" data-numeric>
                  {money(order.shipping, { cents: true })}
                </dd>
              </div>
            )}
            <div className="mt-1 flex justify-between gap-6 border-t pt-2 text-[15px] font-semibold">
              <dt>Total</dt>
              <dd className="tabular" data-numeric>
                {money(order.total, { cents: true })}
              </dd>
            </div>
          </dl>
        }
      />
    </Section>
  );

  /* ------------------------------------------------------------ overview -- */

  const overview = (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="grid content-start gap-4 lg:col-span-2">
        {shortLines.length > 0 && order.status !== "delivered" && order.status !== "cancelled" && (
          <div className="rounded-lg border border-status-warning-border bg-status-warning-bg p-4">
            <p className="text-[13px] font-medium text-status-warning">
              {plural(shortLines.length, "line")} cannot be filled from {warehouse?.code}
            </p>
            <p className="mt-1 text-caption leading-relaxed text-status-warning/90">
              Either transfer stock in from another site, ship short and put the remainder on
              backorder, or move the order to a warehouse that can fill it.
            </p>
          </div>
        )}

        {linesTab}
      </div>

      <div className="grid content-start gap-4">
        <Section title="Customer">
          <FieldGrid
            columns={2}
            fields={[
              {
                label: "Customer",
                value: (
                  <Link href={`/sales/customers/${order.customerId}`} className="hover:underline">
                    {customer?.name}
                  </Link>
                ),
                span: 2,
              },
              { label: "Code", value: customer?.code ?? "—", mono: true },
              { label: "Type", value: customer ? humanize(customer.type) : "—" },
              { label: "Contact", value: customer?.contactName ?? "—" },
              { label: "Channel", value: humanize(order.channel) },
              {
                label: "Credit used",
                value:
                  customer && customer.creditLimit > 0
                    ? `${percent(customer.outstanding / customer.creditLimit, 0)} of ${money(customer.creditLimit)}`
                    : "—",
                span: 2,
              },
            ]}
          />
        </Section>

        <Section title="Fulfillment">
          <FieldGrid
            columns={2}
            fields={[
              { label: "Ship from", value: `${warehouse?.code} · ${warehouse?.name}` },
              { label: "Ship to", value: order.shipToCity },
              { label: "Placed", value: date(order.placedAt) },
              {
                label: "Promised",
                value: `${date(order.promisedAt)} · ${deliveryLabel(order.promisedAt, order.shippedAt)}`,
              },
              { label: "Despatched", value: order.shippedAt ? dateTime(order.shippedAt) : "Not despatched" },
              { label: "Carrier", value: order.carrier ?? "Not assigned" },
              {
                label: "Tracking",
                value: order.trackingNumber ?? "—",
                mono: Boolean(order.trackingNumber),
                span: 2,
              },
            ]}
          />
          {order.notes && (
            <div className="mt-4 rounded-md border bg-surface-sunken p-3">
              <p className="text-caption text-muted-foreground">Order notes</p>
              <p className="mt-1 text-[13px] leading-relaxed">{order.notes}</p>
            </div>
          )}
        </Section>

        {returns.length > 0 && (
          <Section title="Returns against this order">
            <ul className="grid gap-2">
              {returns.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/sales/returns/${r.id}`}
                    className="flex items-start justify-between gap-3 rounded-md border p-2.5 transition-colors hover:bg-surface-hover"
                  >
                    <span className="grid min-w-0 gap-0.5">
                      <span className="flex items-center gap-1.5">
                        <Undo2 className="size-3 text-muted-foreground" aria-hidden />
                        <span className="text-code font-medium">{r.number}</span>
                      </span>
                      <span className="truncate text-caption text-muted-foreground">{r.reason}</span>
                    </span>
                    <span className="grid shrink-0 justify-items-end gap-1">
                      <StatusBadge status={r.status} />
                      <span className="text-caption text-muted-foreground">
                        {money(r.refundTotal)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="History" description="Every step this order has been through.">
          <Timeline entries={timeline} />
        </Section>
      </div>
    </div>
  );

  /* ------------------------------------------------------------- fulfil -- */

  const fulfilTab = stage ? (
    <FulfilmentPanel
      salesOrderId={order.id}
      stage={stage}
      customer={customer?.name ?? "the customer"}
      shipToCity={order.shipToCity}
      lines={order.lines.map((l) => {
        const a = lineAvailability.get(l.id);
        return {
          id: l.id,
          sku: l.sku,
          name: productById.get(l.productId)?.shortName ?? l.name,
          locationCode: a?.bin ?? "—",
          ordered: l.quantity,
          alreadyPicked: l.fulfilled,
          available: a?.atSite ?? 0,
          unitPrice: l.unitPrice,
        };
      })}
    />
  ) : (
    <div className="rounded-lg border bg-surface">
      <EmptyState
        icon={Truck}
        title={
          ["shipped", "delivered"].includes(order.status)
            ? "Already despatched"
            : order.status === "cancelled"
              ? "Order was cancelled"
              : order.status === "backorder"
                ? "Waiting on stock"
                : "Not yet released"
        }
        description={
          ["shipped", "delivered"].includes(order.status)
            ? `${qty(fulfilledUnits)} units left ${warehouse?.code} on ${date(order.shippedAt)}${order.carrier ? ` with ${order.carrier}` : ""}.`
            : order.status === "cancelled"
              ? "This order was cancelled, so nothing was picked and the reserved stock was released."
              : order.status === "backorder"
                ? "There is not enough stock to fill this order. It becomes pickable once the shortfall arrives."
                : "This tab becomes available once the order is confirmed and stock is reserved against it."
        }
      />
    </div>
  );

  const tabs = [
    { id: "overview", label: "Overview", content: overview },
    { id: "lines", label: "Lines", count: order.lines.length, content: linesTab },
  ];

  if (can(role, "fulfillment")) {
    tabs.push({ id: "fulfil", label: "Fulfil", count: order.lines.length, content: fulfilTab });
  }

  return (
    <>
      <RecordHeader
        crumbs={[
          { label: "Sales", href: "/sales/orders" },
          { label: "Sales orders", href: "/sales/orders" },
          { label: order.number },
        ]}
        backHref="/sales/orders"
        backLabel="Sales orders"
        title={order.number}
        subtitle={`${customer?.name} · shipping from ${warehouse?.code} to ${order.shipToCity}`}
        badge={
          <span className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={order.status} size="md" />
            <StatusBadge status={order.paymentStatus} size="md" />
          </span>
        }
        meta={
          <>
            <span className="text-caption text-muted-foreground">
              {plural(order.lines.length, "line")} · {qty(units)} units
            </span>
            <span className="text-caption font-medium">{money(order.total, { cents: true })}</span>
            <span className="flex items-center gap-1.5 text-caption text-muted-foreground">
              <MapPin className="size-3" aria-hidden />
              {order.shipToCity}
            </span>
            <span className="text-caption text-muted-foreground">
              {deliveryLabel(order.promisedAt, order.shippedAt)}
            </span>
          </>
        }
        actions={
          <>
            {can(role, "fulfillment", "edit") && order.status === "draft" && (
              <FulfilmentActionButton
                salesOrderId={order.id}
                intent="confirm"
                pendingLabel="Confirming…"
                className="h-8"
              >
                Confirm order
              </FulfilmentActionButton>
            )}
            {can(role, "fulfillment", "edit") && stage && (
              <FulfilmentActionButton
                salesOrderId={order.id}
                intent="cancel"
                pendingLabel="Cancelling…"
                variant="outline"
                className="h-8"
              >
                Cancel order
              </FulfilmentActionButton>
            )}
            <Button variant="outline" size="sm" className="h-8" render={<Link href={`/warehousing/picking/${order.id}`} />}>
              <Printer className="size-3.5" aria-hidden />
              Pick list
            </Button>
            {can(role, "sales-orders", "export") && (
              <ActionButton
                variant="outline" size="sm" className="h-8"
                feedback="Export started"
                detail={`A PDF copy of ${order.number} downloads once it is rendered.`}
              >
                <Download className="size-3.5" aria-hidden />
                Export
              </ActionButton>
            )}
            {can(role, "sales-returns", "create") &&
              ["shipped", "delivered"].includes(order.status) && (
                <Button variant="outline" size="sm" className="h-8" render={<Link href={`/sales/returns/new?order=${order.id}`} />}>
                  <Undo2 className="size-3.5" aria-hidden />
                  Raise a return
                </Button>
              )}
          </>
        }
      >
        <div className="grid gap-3">
          <WorkflowStepper workflow="salesOrder" status={order.status} />
          <StatStrip>
            <StatTile label="Lines" value={order.lines.length} />
            <StatTile label="Units" value={qty(units)} />
            <StatTile
              label="Fulfilled"
              value={percent(progress, 0)}
              tone={progress >= 1 ? "success" : progress > 0 ? "warning" : "neutral"}
              hint={`${qty(fulfilledUnits)} of ${qty(units)}`}
            />
            <StatTile
              label="Short lines"
              value={qty(shortLines.length)}
              tone={shortLines.length > 0 ? "danger" : "success"}
              hint={shortLines.length > 0 ? `at ${warehouse?.code}` : "fully coverable"}
            />
            <StatTile label="Order total" value={money(order.total)} />
            <StatTile
              label="Promised"
              value={date(order.promisedAt)}
              hint={deliveryLabel(order.promisedAt, order.shippedAt)}
              tone={
                !order.shippedAt && deliveryLabel(order.promisedAt, null).includes("overdue")
                  ? "danger"
                  : "neutral"
              }
            />
          </StatStrip>
        </div>
      </RecordHeader>

      <DetailTabs tabs={tabs} defaultTab={stage ? "fulfil" : "overview"} />
    </>
  );
}
