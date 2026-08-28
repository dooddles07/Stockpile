import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight, Download, Printer, Truck } from "lucide-react";

import { RecordHeader, StatStrip } from "@/components/record/record-header";
import { DetailTabs } from "@/components/record/detail-tabs";
import { FieldGrid, Section, StatTile } from "@/components/record/field-grid";
import { SimpleTable } from "@/components/record/simple-table";
import { Timeline, type TimelineEntry } from "@/components/record/timeline";
import { ApprovalActions } from "@/components/record/approval-actions";
import { ReceivePanel } from "./receive-panel";
import { WorkflowStepper } from "@/components/status/workflow-stepper";
import { StatusBadge } from "@/components/status/status-badge";
import { EmptyState, PermissionDenied } from "@/components/states";
import { db } from "@/lib/data/store";
import { locationById, productById, userById, warehouseById } from "@/lib/repo/inventory";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { date, dateTime, dueLabel, money, plural, qty } from "@/lib/format";
import { humanize } from "@/lib/status";
import type { StatusTone } from "@/lib/types";
import { ActionButton } from "@/components/actions/action-button";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const transfer = db.transfers.find((t) => t.id === id);
  return transfer
    ? { title: transfer.number, description: `Stock transfer — ${transfer.reason}.` }
    : { title: "Transfer not found" };
}

const ACTION_TONE: Record<string, StatusTone> = {
  created: "neutral",
  submitted: "info",
  approved: "success",
  rejected: "danger",
  commented: "neutral",
};

export default async function TransferDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const role = await getRole();
  if (!can(role, "transfers")) return <PermissionDenied module="transfers" role={role} />;

  const { id } = await params;
  const transfer = db.transfers.find((t) => t.id === id);
  if (!transfer) notFound();

  const from = warehouseById.get(transfer.fromWarehouseId);
  const to = warehouseById.get(transfer.toWarehouseId);
  const canApprove = can(role, "transfers", "approve");
  const awaitingDecision = transfer.status === "pending-approval";
  const receivable = ["in-transit", "partially-received"].includes(transfer.status);

  const units = transfer.lines.reduce((s, l) => s + l.quantity, 0);
  const shipped = transfer.lines.reduce((s, l) => s + l.shipped, 0);
  const received = transfer.lines.reduce((s, l) => s + l.received, 0);
  const value = transfer.lines.reduce(
    (s, l) => s + l.quantity * (productById.get(l.productId)?.unitCost ?? 0),
    0,
  );

  const timeline: TimelineEntry[] = transfer.approvals.map((event) => ({
    id: event.id,
    ts: event.ts,
    tone: ACTION_TONE[event.action] ?? "neutral",
    title: `${humanize(event.action)} by ${userById.get(event.userId)?.name ?? "—"}`,
    detail: event.note,
  }));

  if (transfer.shippedAt) {
    timeline.push({
      id: "shipped",
      ts: transfer.shippedAt,
      tone: "info",
      icon: Truck,
      title: `Despatched from ${from?.code}`,
      detail: transfer.carrier
        ? `${transfer.carrier}${transfer.trackingNumber ? ` · ${transfer.trackingNumber}` : ""}`
        : undefined,
    });
  }
  if (transfer.receivedAt) {
    timeline.push({
      id: "received",
      ts: transfer.receivedAt,
      tone: "success",
      title: `Received at ${to?.code}`,
      detail: `${qty(received)} of ${qty(shipped)} despatched units booked into stock.`,
    });
  }
  timeline.sort((a, b) => a.ts.localeCompare(b.ts));

  /* --------------------------------------------------------------- lines -- */

  const linesTab = (
    <Section
      title="Transfer lines"
      description="What is moving, how much has been despatched and how much has landed."
      contentClassName="p-0"
    >
      <SimpleTable
        rows={transfer.lines}
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
            key: "fromLoc",
            header: "From bin",
            hideOnMobile: true,
            cell: (l) => (
              <span className="text-code text-muted-foreground">
                {locationById.get(l.fromLocationId)?.code ?? "—"}
              </span>
            ),
          },
          {
            key: "toLoc",
            header: "To bin",
            hideOnMobile: true,
            cell: (l) =>
              l.toLocationId ? (
                <span className="text-code text-muted-foreground">
                  {locationById.get(l.toLocationId)?.code}
                </span>
              ) : (
                <span className="text-muted-foreground">not put away</span>
              ),
          },
          { key: "qty", header: "Requested", align: "right", cell: (l) => qty(l.quantity) },
          {
            key: "shipped",
            header: "Despatched",
            align: "right",
            cell: (l) => (
              <span className={l.shipped === 0 ? "text-muted-foreground" : ""}>{qty(l.shipped)}</span>
            ),
          },
          {
            key: "received",
            header: "Received",
            align: "right",
            cell: (l) => (
              <span
                className={
                  l.received >= l.quantity
                    ? "font-semibold text-status-success"
                    : l.received > 0
                      ? "font-semibold text-status-warning"
                      : "text-muted-foreground"
                }
              >
                {qty(l.received)}
              </span>
            ),
          },
          {
            key: "outstanding",
            header: "Outstanding",
            align: "right",
            cell: (l) => {
              const out = Math.max(0, l.quantity - l.received);
              return out > 0 ? (
                <span className="font-medium text-status-warning">{qty(out)}</span>
              ) : (
                <span className="text-muted-foreground">—</span>
              );
            },
          },
          {
            key: "value",
            header: "Value",
            align: "right",
            hideOnMobile: true,
            cell: (l) => money(l.quantity * (productById.get(l.productId)?.unitCost ?? 0)),
          },
        ]}
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
            <span className="text-muted-foreground">
              {plural(transfer.lines.length, "line")}
            </span>
            <span className="tabular" data-numeric>
              <span className="text-muted-foreground">Requested </span>
              <span className="font-semibold">{qty(units)}</span>
              <span className="text-muted-foreground"> · Received </span>
              <span className="font-semibold">{qty(received)}</span>
              <span className="text-muted-foreground"> · Value </span>
              <span className="font-semibold">{money(value)}</span>
            </span>
          </div>
        }
        empty={
          <EmptyState
            title="No lines on this transfer"
            description="A transfer with no lines cannot be submitted."
            className="py-10"
          />
        }
      />
    </Section>
  );

  /* ------------------------------------------------------------ overview -- */

  const overview = (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="grid content-start gap-4 lg:col-span-2">
        <Section title="Route" description="Where this stock is coming from and going to.">
          <div className="grid items-center gap-4 sm:grid-cols-[1fr_auto_1fr]">
            <div className="rounded-md border bg-surface-sunken p-3">
              <p className="text-overline text-muted-foreground">From</p>
              <p className="mt-1 text-code text-[13px] font-semibold">{from?.code}</p>
              <p className="text-caption text-muted-foreground">{from?.name}</p>
              <p className="mt-1 text-caption text-muted-foreground">
                {from?.city}, {from?.region}
              </p>
            </div>
            <ArrowRight className="mx-auto hidden size-5 text-muted-foreground sm:block" aria-hidden />
            <div className="rounded-md border bg-surface-sunken p-3">
              <p className="text-overline text-muted-foreground">To</p>
              <p className="mt-1 text-code text-[13px] font-semibold">{to?.code}</p>
              <p className="text-caption text-muted-foreground">{to?.name}</p>
              <p className="mt-1 text-caption text-muted-foreground">
                {to?.city}, {to?.region}
              </p>
            </div>
          </div>
          <p className="mt-4 text-[13px] leading-relaxed">{transfer.reason}</p>
        </Section>

        {linesTab}
      </div>

      <div className="grid content-start gap-4">
        <Section title="Details">
          <FieldGrid
            columns={2}
            fields={[
              { label: "Transfer", value: transfer.number, mono: true },
              { label: "Status", value: <StatusBadge status={transfer.status} /> },
              { label: "Requested by", value: userById.get(transfer.requestedBy)?.name ?? "—" },
              {
                label: "Approved by",
                value: transfer.approvedBy
                  ? (userById.get(transfer.approvedBy)?.name ?? "—")
                  : "Not approved",
              },
              { label: "Raised", value: date(transfer.createdAt) },
              { label: "Expected", value: `${date(transfer.expectedAt)} · ${dueLabel(transfer.expectedAt)}` },
              { label: "Despatched", value: transfer.shippedAt ? dateTime(transfer.shippedAt) : "Not despatched" },
              { label: "Received", value: transfer.receivedAt ? dateTime(transfer.receivedAt) : "Not received" },
              { label: "Carrier", value: transfer.carrier ?? "Not assigned" },
              { label: "Tracking", value: transfer.trackingNumber ?? "—", mono: Boolean(transfer.trackingNumber) },
            ]}
          />
        </Section>

        <Section title="History" description="Every action taken on this transfer.">
          <Timeline entries={timeline} />
        </Section>
      </div>
    </div>
  );

  /* ------------------------------------------------------------- receive -- */

  const destinationLocations = db.locations
    .filter((l) => l.warehouseId === transfer.toWarehouseId && l.type !== "quarantine")
    .map((l) => ({ id: l.id, code: l.code }));

  const receiveTab = receivable ? (
    <ReceivePanel
      transferNumber={transfer.number}
      destination={to?.code ?? "—"}
      locations={destinationLocations}
      lines={transfer.lines.map((l) => ({
        id: l.id,
        sku: l.sku,
        name: productById.get(l.productId)?.shortName ?? l.name,
        shipped: l.shipped,
        alreadyReceived: l.received,
      }))}
    />
  ) : (
    <div className="rounded-lg border bg-surface">
      <EmptyState
        icon={Truck}
        title={
          transfer.status === "received"
            ? "Already received"
            : transfer.status === "cancelled"
              ? "Transfer was cancelled"
              : "Nothing to receive yet"
        }
        description={
          transfer.status === "received"
            ? `All ${qty(received)} units were booked into ${to?.code} on ${date(transfer.receivedAt)}.`
            : transfer.status === "cancelled"
              ? "This transfer was cancelled before despatch, so no stock moved."
              : "Stock has not been despatched from the source site yet. This tab becomes available once the transfer is in transit."
        }
      />
    </div>
  );

  const tabs = [
    { id: "overview", label: "Overview", content: overview },
    { id: "lines", label: "Lines", count: transfer.lines.length, content: linesTab },
  ];

  if (can(role, "transfers", "edit")) {
    tabs.push({ id: "receive", label: "Receive", count: transfer.lines.length, content: receiveTab });
  }

  return (
    <>
      <RecordHeader
        crumbs={[
          { label: "Warehousing", href: "/warehousing/warehouses" },
          { label: "Transfers", href: "/warehousing/transfers" },
          { label: transfer.number },
        ]}
        backHref="/warehousing/transfers"
        backLabel="Transfers"
        title={transfer.number}
        subtitle={transfer.reason}
        badge={<StatusBadge status={transfer.status} size="md" />}
        meta={
          <>
            <span className="flex items-center gap-1.5 text-caption font-medium">
              {from?.code}
              <ArrowRight className="size-3 text-muted-foreground" aria-hidden />
              {to?.code}
            </span>
            <span className="text-caption text-muted-foreground">
              {plural(transfer.lines.length, "line")} · {qty(units)} units
            </span>
            <span className="text-caption text-muted-foreground">
              {dueLabel(transfer.expectedAt)}
            </span>
          </>
        }
        actions={
          <>
            <ActionButton
              variant="outline" size="sm" className="h-8"
              feedback="Sent to printer"
              detail={`The walk sheet for ${transfer.number} is queued at ${from?.code ?? "the despatching site"}.`}
            >
              <Printer className="size-3.5" aria-hidden />
              Picking list
            </ActionButton>
            {can(role, "transfers", "export") && (
              <ActionButton
                variant="outline" size="sm" className="h-8"
                feedback="Export started"
                detail={`A PDF copy of ${transfer.number} downloads once it is rendered.`}
              >
                <Download className="size-3.5" aria-hidden />
                Export
              </ActionButton>
            )}
            {awaitingDecision && canApprove && (
              <ApprovalActions
                recordLabel={transfer.number}
                summary={`${qty(units)} units across ${plural(transfer.lines.length, "line")}, ${from?.code} → ${to?.code}.`}
                impact={`Approving releases the stock for despatch. It leaves ${from?.code} the moment it ships and does not count at ${to?.code} until it is received, so ${money(value)} of value sits in transit in between.`}
              />
            )}
            {awaitingDecision && !canApprove && (
              <StatusBadge label="Waiting on an approver" tone="warning" size="md" />
            )}
          </>
        }
      >
        <div className="grid gap-3">
          <WorkflowStepper workflow="transfer" status={transfer.status} />
          <StatStrip columns={5}>
            <StatTile label="Lines" value={transfer.lines.length} />
            <StatTile label="Requested" value={qty(units)} />
            <StatTile
              label="Despatched"
              value={qty(shipped)}
              tone={shipped > 0 ? "info" : "neutral"}
            />
            <StatTile
              label="Received"
              value={qty(received)}
              tone={received >= units ? "success" : received > 0 ? "warning" : "neutral"}
            />
            <StatTile label="Value in motion" value={money(value)} />
          </StatStrip>
        </div>
      </RecordHeader>

      <DetailTabs tabs={tabs} />
    </>
  );
}
