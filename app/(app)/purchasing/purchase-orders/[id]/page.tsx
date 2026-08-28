import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Download, FileText, Mail, PackageCheck, Paperclip, Printer, Truck } from "lucide-react";

import { RecordHeader, StatStrip } from "@/components/record/record-header";
import { DetailTabs } from "@/components/record/detail-tabs";
import { FieldGrid, Section, StatTile } from "@/components/record/field-grid";
import { SimpleTable } from "@/components/record/simple-table";
import { Timeline, type TimelineEntry } from "@/components/record/timeline";
import { ApprovalActions } from "@/components/record/approval-actions";
import { GoodsReceipt } from "./goods-receipt";
import { WorkflowStepper } from "@/components/status/workflow-stepper";
import { StatusBadge } from "@/components/status/status-badge";
import { EmptyState, PermissionDenied } from "@/components/states";
import { db } from "@/lib/data/store";
import { productByIdSync, supplierByIdSync, userByIdSync, warehouseByIdSync } from "@/lib/repo/inventory";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { date, dateTime, deliveryLabel, money, percent, plural, qty } from "@/lib/format";
import { humanize } from "@/lib/status";
import type { StatusTone } from "@/lib/types";
import { ActionButton } from "@/components/actions/action-button";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const po = db.purchaseOrders.find((p) => p.id === id);
  return po
    ? { title: po.number, description: `Purchase order — ${money(po.total)}.` }
    : { title: "Purchase order not found" };
}

const ACTION_TONE: Record<string, StatusTone> = {
  created: "neutral",
  submitted: "info",
  approved: "success",
  rejected: "danger",
  commented: "neutral",
};

/** Orders above this need a purchasing manager to sign off. */
const APPROVAL_THRESHOLD = 5000;

export default async function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const role = await getRole();
  if (!can(role, "purchase-orders")) {
    return <PermissionDenied module="purchase-orders" role={role} />;
  }

  const { id } = await params;
  const po = db.purchaseOrders.find((p) => p.id === id);
  if (!po) notFound();

  const supplier = supplierByIdSync.get(po.supplierId);
  const warehouse = warehouseByIdSync.get(po.warehouseId);
  const canApprove = can(role, "purchase-orders", "approve");
  const awaitingDecision = po.status === "submitted";
  const receivable = ["ordered", "partially-received"].includes(po.status);

  const units = po.lines.reduce((s, l) => s + l.quantity, 0);
  const receivedUnits = po.lines.reduce((s, l) => s + l.fulfilled, 0);
  const receivedValue = po.lines.reduce((s, l) => s + l.fulfilled * l.unitPrice, 0);
  const progress = units > 0 ? receivedUnits / units : 0;

  const timeline: TimelineEntry[] = po.approvals.map((event) => ({
    id: event.id,
    ts: event.ts,
    tone: ACTION_TONE[event.action] ?? "neutral",
    title: `${humanize(event.action)} by ${userByIdSync.get(event.userId)?.name ?? "—"}`,
    detail: event.note,
  }));

  if (po.orderedAt) {
    timeline.push({
      id: "ordered",
      ts: po.orderedAt,
      tone: "info",
      icon: Mail,
      title: `Sent to ${supplier?.name}`,
      detail: `${po.paymentTerms} · expected ${date(po.expectedAt)}`,
    });
  }
  if (po.receivedAt) {
    timeline.push({
      id: "received",
      ts: po.receivedAt,
      tone: "success",
      icon: PackageCheck,
      title: `Received at ${warehouse?.code}`,
      detail: `${qty(receivedUnits)} of ${qty(units)} units booked into stock.`,
    });
  }
  timeline.sort((a, b) => a.ts.localeCompare(b.ts));

  /* --------------------------------------------------------------- lines -- */

  const linesTab = (
    <Section
      title="Line items"
      description="What was ordered, at what price, and how much has arrived."
      contentClassName="p-0"
    >
      <SimpleTable
        rows={po.lines}
        getRowId={(l) => l.id}
        columns={[
          {
            key: "product",
            header: "Product",
            cell: (l) => (
              <Link href={`/inventory/products/${l.sku}`} className="grid gap-0.5 hover:underline">
                <span className="font-medium">{productByIdSync.get(l.productId)?.shortName ?? l.name}</span>
                <span className="text-code text-[11px] text-muted-foreground">{l.sku}</span>
              </Link>
            ),
          },
          { key: "qty", header: "Ordered", align: "right", cell: (l) => qty(l.quantity) },
          {
            key: "received",
            header: "Received",
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
            key: "outstanding",
            header: "Outstanding",
            align: "right",
            cell: (l) => {
              const out = Math.max(0, l.quantity - l.fulfilled);
              return out > 0 ? (
                <span className="font-medium text-status-warning">{qty(out)}</span>
              ) : (
                <span className="text-muted-foreground">—</span>
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
            key: "tax",
            header: "Tax",
            align: "right",
            hideOnMobile: true,
            cell: (l) =>
              l.taxPct > 0 ? `${l.taxPct}%` : <span className="text-muted-foreground">—</span>,
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
                {money(po.subtotal, { cents: true })}
              </dd>
            </div>
            {po.discountTotal > 0 && (
              <div className="flex justify-between gap-6">
                <dt className="text-muted-foreground">Discount</dt>
                <dd className="tabular text-status-success" data-numeric>
                  −{money(po.discountTotal, { cents: true })}
                </dd>
              </div>
            )}
            {po.taxTotal > 0 && (
              <div className="flex justify-between gap-6">
                <dt className="text-muted-foreground">Tax</dt>
                <dd className="tabular" data-numeric>
                  {money(po.taxTotal, { cents: true })}
                </dd>
              </div>
            )}
            {po.shipping > 0 && (
              <div className="flex justify-between gap-6">
                <dt className="text-muted-foreground">Shipping</dt>
                <dd className="tabular" data-numeric>
                  {money(po.shipping, { cents: true })}
                </dd>
              </div>
            )}
            <div className="mt-1 flex justify-between gap-6 border-t pt-2 text-[15px] font-semibold">
              <dt>Total</dt>
              <dd className="tabular" data-numeric>
                {money(po.total, { cents: true })}
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
        {awaitingDecision && (
          <div className="rounded-lg border border-status-warning-border bg-status-warning-bg p-4">
            <p className="text-[13px] font-medium text-status-warning">
              Waiting on approval — nothing is committed yet
            </p>
            <p className="mt-1 text-caption leading-relaxed text-status-warning/90">
              {money(po.total)} is above the {money(APPROVAL_THRESHOLD)} sign-off threshold.
              Approving sends the order to {supplier?.name} and books {qty(units)} units as incoming
              stock at {warehouse?.code}, which reorder planning will then rely on.
            </p>
          </div>
        )}

        {linesTab}
      </div>

      <div className="grid content-start gap-4">
        <Section title="Supplier">
          <FieldGrid
            columns={2}
            fields={[
              {
                label: "Supplier",
                value: (
                  <Link href={`/purchasing/suppliers/${po.supplierId}`} className="hover:underline">
                    {supplier?.name}
                  </Link>
                ),
                span: 2,
              },
              { label: "Code", value: supplier?.code ?? "—", mono: true },
              { label: "Contact", value: supplier?.contactName ?? "—" },
              { label: "Payment terms", value: po.paymentTerms },
              { label: "Lead time", value: `${supplier?.leadTimeDays ?? "—"} days` },
              {
                label: "On-time rate",
                value: supplier ? percent(supplier.onTimeRate, 1) : "—",
                hint: supplier && supplier.onTimeRate < 0.85 ? "Below target — expect slippage" : undefined,
              },
              { label: "Defect rate", value: supplier ? percent(supplier.defectRate, 2) : "—" },
            ]}
          />
        </Section>

        <Section title="Delivery">
          <FieldGrid
            columns={2}
            fields={[
              { label: "Deliver to", value: `${warehouse?.code} · ${warehouse?.name}` },
              { label: "Address", value: `${warehouse?.addressLine}, ${warehouse?.city}`, span: 2 },
              { label: "Raised", value: date(po.createdAt) },
              { label: "Ordered", value: po.orderedAt ? date(po.orderedAt) : "Not sent" },
              {
                label: "Expected",
                value: `${date(po.expectedAt)} · ${deliveryLabel(po.expectedAt, po.receivedAt)}`,
              },
              { label: "Received", value: po.receivedAt ? dateTime(po.receivedAt) : "Not received" },
              { label: "Raised by", value: userByIdSync.get(po.createdBy)?.name ?? "—" },
              {
                label: "Approved by",
                value: po.approvedBy ? (userByIdSync.get(po.approvedBy)?.name ?? "—") : "Not approved",
              },
            ]}
          />
          {po.notes && (
            <div className="mt-4 rounded-md border bg-surface-sunken p-3">
              <p className="text-caption text-muted-foreground">Delivery notes</p>
              <p className="mt-1 text-[13px] leading-relaxed">{po.notes}</p>
            </div>
          )}
        </Section>

        <Section
          title="Attachments"
          description="Quotations and supplier paperwork."
          actions={<Paperclip className="size-4 text-muted-foreground" aria-hidden />}
        >
          {po.attachments.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">Nothing attached to this order.</p>
          ) : (
            <ul className="grid gap-2">
              {po.attachments.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-2.5 rounded-md border p-2.5 transition-colors hover:bg-surface-hover"
                >
                  <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="truncate text-[13px] font-medium">{a.name}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {a.sizeKb} KB · uploaded {date(a.uploadedAt)}
                    </span>
                  </span>
                  <ActionButton
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={`Download ${a.name}`}
                    feedback="Download started"
                    detail={`${a.name} · ${a.sizeKb} KB`}
                  >
                    <Download className="size-3.5" aria-hidden />
                  </ActionButton>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="History" description="Every action taken on this order.">
          <Timeline entries={timeline} />
        </Section>
      </div>
    </div>
  );

  /* ------------------------------------------------------------- receive -- */

  const receiptLocations = db.locations
    .filter((l) => l.warehouseId === po.warehouseId && l.type !== "quarantine")
    .map((l) => ({ id: l.id, code: l.code }));

  const receiveTab = receivable ? (
    <GoodsReceipt
      orderNumber={po.number}
      supplier={supplier?.name ?? "the supplier"}
      destination={warehouse?.code ?? "—"}
      locations={receiptLocations}
      lines={po.lines.map((l) => {
        const product = productByIdSync.get(l.productId);
        return {
          id: l.id,
          sku: l.sku,
          name: product?.shortName ?? l.name,
          ordered: l.quantity,
          alreadyReceived: l.fulfilled,
          unitPrice: l.unitPrice,
          batchTracked: product?.batchTracked ?? false,
          serialTracked: product?.serialTracked ?? false,
          hasExpiry: product?.hasExpiry ?? false,
          shelfLifeDays: product?.shelfLifeDays ?? null,
        };
      })}
    />
  ) : (
    <div className="rounded-lg border bg-surface">
      <EmptyState
        icon={Truck}
        title={
          ["received", "closed"].includes(po.status)
            ? "Fully received"
            : po.status === "cancelled"
              ? "Order was cancelled"
              : "Not yet ordered"
        }
        description={
          ["received", "closed"].includes(po.status)
            ? `All ${qty(units)} units were booked into ${warehouse?.code} on ${date(po.receivedAt)}.`
            : po.status === "cancelled"
              ? "This order was cancelled before delivery, so nothing was received."
              : "This tab becomes available once the order has been approved and sent to the supplier."
        }
      />
    </div>
  );

  const tabs = [
    { id: "overview", label: "Overview", content: overview },
    { id: "lines", label: "Lines", count: po.lines.length, content: linesTab },
  ];

  if (can(role, "receiving", "edit")) {
    tabs.push({ id: "receive", label: "Receive", count: po.lines.length, content: receiveTab });
  }

  return (
    <>
      <RecordHeader
        crumbs={[
          { label: "Purchasing", href: "/purchasing/purchase-orders" },
          { label: "Purchase orders", href: "/purchasing/purchase-orders" },
          { label: po.number },
        ]}
        backHref="/purchasing/purchase-orders"
        backLabel="Purchase orders"
        title={po.number}
        subtitle={`${supplier?.name} · delivering to ${warehouse?.code} ${warehouse?.name}`}
        badge={<StatusBadge status={po.status} size="md" />}
        meta={
          <>
            <span className="text-caption text-muted-foreground">
              {plural(po.lines.length, "line")} · {qty(units)} units
            </span>
            <span className="text-caption font-medium">{money(po.total, { cents: true })}</span>
            <span className="text-caption text-muted-foreground">
              {deliveryLabel(po.expectedAt, po.receivedAt)}
            </span>
          </>
        }
        actions={
          <>
            <ActionButton
              variant="outline" size="sm" className="h-8"
              feedback="Sent to printer"
              detail={`${po.number} is queued on the default printer.`}
            >
              <Printer className="size-3.5" aria-hidden />
              Print
            </ActionButton>
            {can(role, "purchase-orders", "export") && (
              <ActionButton
                variant="outline" size="sm" className="h-8"
                feedback="Export started"
                detail={`A PDF copy of ${po.number} downloads once it is rendered.`}
              >
                <Download className="size-3.5" aria-hidden />
                Export
              </ActionButton>
            )}
            {awaitingDecision && canApprove && (
              <ApprovalActions
                recordLabel={po.number}
                summary={`${plural(po.lines.length, "line")} from ${supplier?.name}, ${money(po.total, { cents: true })}.`}
                impact={`Approving commits ${money(po.total, { cents: true })} of spend, sends the order to ${supplier?.name}, and books ${qty(units)} units as incoming stock at ${warehouse?.code}. Reorder planning treats incoming stock as covered, so approving a duplicate order suppresses the reorder that should have been raised.`}
              />
            )}
            {awaitingDecision && !canApprove && (
              <StatusBadge label="Waiting on an approver" tone="warning" size="md" />
            )}
          </>
        }
      >
        <div className="grid gap-3">
          <WorkflowStepper workflow="purchaseOrder" status={po.status} />
          <StatStrip>
            <StatTile label="Lines" value={po.lines.length} />
            <StatTile label="Units" value={qty(units)} />
            <StatTile
              label="Received"
              value={`${percent(progress, 0)}`}
              tone={progress >= 1 ? "success" : progress > 0 ? "warning" : "neutral"}
              hint={`${qty(receivedUnits)} of ${qty(units)}`}
            />
            <StatTile label="Goods value" value={money(receivedValue)} hint="Booked in so far" />
            <StatTile label="Order total" value={money(po.total)} />
            <StatTile
              label="Expected"
              value={date(po.expectedAt)}
              tone={
                receivable && deliveryLabel(po.expectedAt, po.receivedAt).includes("overdue")
                  ? "danger"
                  : "neutral"
              }
              hint={deliveryLabel(po.expectedAt, po.receivedAt)}
            />
          </StatStrip>
        </div>
      </RecordHeader>

      <DetailTabs tabs={tabs} />
    </>
  );
}
