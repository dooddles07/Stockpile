import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Check, Download, Pencil, Printer, TriangleAlert } from "lucide-react";

import { RecordHeader, StatStrip } from "@/components/record/record-header";
import { FieldGrid, Section, StatTile } from "@/components/record/field-grid";
import { SimpleTable } from "@/components/record/simple-table";
import { Timeline, type TimelineEntry } from "@/components/record/timeline";
import { ApprovalActions } from "@/components/record/approval-actions";
import { WorkflowStepper } from "@/components/status/workflow-stepper";
import { StatusBadge } from "@/components/status/status-badge";
import { PermissionDenied } from "@/components/states";
import { Button } from "@/components/ui/button";
import { adjustments as allAdjustments } from "@/lib/repo/documents";
import { warehouseById } from "@/lib/repo/inventory";
import { indexById, locations as allLocations, products as allProducts, users as allUsers } from "@/lib/repo/reference";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { date, dateTime, money, plural, qty, signed, signedMoney } from "@/lib/format";
import { humanize } from "@/lib/status";
import type { StatusTone } from "@/lib/types";
import { ActionButton } from "@/components/actions/action-button";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const adjustment = (await allAdjustments()).find((a) => a.id === id);
  return adjustment
    ? { title: adjustment.number, description: `Stock adjustment — ${humanize(adjustment.reason)}.` }
    : { title: "Adjustment not found" };
}

const ACTION_TONE: Record<string, StatusTone> = {
  created: "neutral",
  submitted: "info",
  approved: "success",
  rejected: "danger",
  commented: "neutral",
};

export default async function AdjustmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const role = await getRole();
  if (!can(role, "adjustments")) return <PermissionDenied module="adjustments" role={role} />;

  const { id } = await params;
  const adjustment = (await allAdjustments()).find((a) => a.id === id);
  if (!adjustment) notFound();

  const warehouse = await warehouseById(adjustment.warehouseId);
  const productById = await indexById(allProducts);
  const locationById = await indexById(allLocations);
  const userById = await indexById(allUsers);
  const canApprove = can(role, "adjustments", "approve");
  const awaitingDecision = adjustment.status === "pending-approval";
  const isNegative = adjustment.totalValueImpact < 0;

  const timeline: TimelineEntry[] = adjustment.approvals.map((event) => ({
    id: event.id,
    ts: event.ts,
    tone: ACTION_TONE[event.action] ?? "neutral",
    title: `${humanize(event.action)} by ${userById.get(event.userId)?.name ?? "—"}`,
    detail: event.note,
  }));

  if (adjustment.appliedAt) {
    timeline.push({
      id: "applied",
      ts: adjustment.appliedAt,
      tone: "success",
      title: "Posted to stock",
      detail: `${plural(adjustment.lines.length, "line")} written to the movement ledger.`,
    });
  }

  return (
    <>
      <RecordHeader
        crumbs={[
          { label: "Inventory", href: "/inventory/products" },
          { label: "Adjustments", href: "/inventory/adjustments" },
          { label: adjustment.number },
        ]}
        backHref="/inventory/adjustments"
        backLabel="Adjustments"
        title={adjustment.number}
        subtitle={adjustment.note}
        badge={<StatusBadge status={adjustment.status} size="md" />}
        meta={
          <>
            <span className="text-caption text-muted-foreground">
              {humanize(adjustment.reason)} · {warehouse?.code} {warehouse?.name}
            </span>
            <span className="text-caption text-muted-foreground">
              Raised {date(adjustment.createdAt)} by {userById.get(adjustment.createdBy)?.name}
            </span>
          </>
        }
        actions={
          <>
            <ActionButton
              variant="outline" size="sm" className="h-8"
              feedback="Sent to printer"
              detail={`${adjustment.number} is queued on the default printer.`}
            >
              <Printer className="size-3.5" aria-hidden />
              Print
            </ActionButton>
            {can(role, "adjustments", "export") && (
              <ActionButton
                variant="outline" size="sm" className="h-8"
                feedback="Export started"
                detail={`A PDF copy of ${adjustment.number} downloads once it is rendered.`}
              >
                <Download className="size-3.5" aria-hidden />
                Export
              </ActionButton>
            )}
            {can(role, "adjustments", "edit") && adjustment.status === "draft" && (
              <Button variant="outline" size="sm" className="h-8" render={<Link href={`/inventory/adjustments/${adjustment.id}/edit`} />}>
                <Pencil className="size-3.5" aria-hidden />
                Edit
              </Button>
            )}
            {awaitingDecision && canApprove && (
              <ApprovalActions
                recordLabel={adjustment.number}
                summary={`${plural(adjustment.lines.length, "line")} at ${warehouse?.code}, reason "${humanize(adjustment.reason)}".`}
                impact={`Stock changes by ${signed(adjustment.totalDelta)} units and inventory value by ${signedMoney(adjustment.totalValueImpact)}. Each line is written to the movement ledger and cannot be edited afterwards — a further correction would be a new adjustment.`}
              />
            )}
            {awaitingDecision && !canApprove && (
              <StatusBadge label="Waiting on an approver" tone="warning" size="md" />
            )}
          </>
        }
      >
        <div className="grid gap-3">
          <WorkflowStepper workflow="adjustment" status={adjustment.status} />
          <StatStrip columns={4}>
            <StatTile label="Lines" value={adjustment.lines.length} />
            <StatTile
              label="Unit change"
              value={signed(adjustment.totalDelta)}
              tone={adjustment.totalDelta >= 0 ? "success" : "danger"}
            />
            <StatTile
              label="Value impact"
              value={signedMoney(adjustment.totalValueImpact)}
              tone={isNegative ? "danger" : "success"}
            />
            <StatTile
              label="Approval"
              value={adjustment.requiresApproval ? "Required" : "Not required"}
              tone={adjustment.requiresApproval ? "warning" : "neutral"}
              hint={adjustment.requiresApproval ? "Over the $500 threshold" : "Under the $500 threshold"}
            />
          </StatStrip>
        </div>
      </RecordHeader>

      <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-3">
        <div className="grid content-start gap-4 lg:col-span-2">
          {awaitingDecision && (
            <div className="flex items-start gap-3 rounded-lg border border-status-warning-border bg-status-warning-bg p-4">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden />
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-status-warning">
                  This adjustment has not been posted
                </p>
                <p className="mt-1 text-caption leading-relaxed text-status-warning/90">
                  Stock is unchanged until it is approved. On approval,{" "}
                  {signed(adjustment.totalDelta)} units and {signedMoney(adjustment.totalValueImpact)}{" "}
                  of value are written to the ledger at {warehouse?.code}.
                </p>
              </div>
            </div>
          )}

          <Section
            title="Adjustment lines"
            description="Before and after quantity for each SKU, with the value each line moves."
            contentClassName="p-0"
          >
            <SimpleTable
              rows={adjustment.lines}
              getRowId={(line) => line.id}
              columns={[
                {
                  key: "product",
                  header: "Product",
                  cell: (line) => (
                    <Link href={`/inventory/products/${line.sku}`} className="grid gap-0.5 hover:underline">
                      <span className="font-medium">
                        {productById.get(line.productId)?.shortName ?? line.name}
                      </span>
                      <span className="text-code text-[11px] text-muted-foreground">{line.sku}</span>
                    </Link>
                  ),
                },
                {
                  key: "location",
                  header: "Location",
                  hideOnMobile: true,
                  cell: (line) => (
                    <span className="text-code text-muted-foreground">
                      {locationById.get(line.locationId)?.code ?? "—"}
                    </span>
                  ),
                },
                {
                  key: "lot",
                  header: "Lot",
                  hideOnMobile: true,
                  cell: (line) =>
                    line.lotNumber ? (
                      <span className="text-code text-muted-foreground">{line.lotNumber}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    ),
                },
                { key: "before", header: "Before", align: "right", cell: (line) => qty(line.qtyBefore) },
                {
                  key: "delta",
                  header: "Change",
                  align: "right",
                  cell: (line) => (
                    <span
                      className={
                        line.delta >= 0
                          ? "font-semibold text-status-success"
                          : "font-semibold text-status-danger"
                      }
                    >
                      {signed(line.delta)}
                    </span>
                  ),
                },
                {
                  key: "after",
                  header: "After",
                  align: "right",
                  cell: (line) => <span className="font-medium">{qty(line.qtyAfter)}</span>,
                },
                {
                  key: "cost",
                  header: "Unit cost",
                  align: "right",
                  hideOnMobile: true,
                  cell: (line) => (
                    <span className="text-muted-foreground">{money(line.unitCost, { cents: true })}</span>
                  ),
                },
                {
                  key: "value",
                  header: "Value impact",
                  align: "right",
                  cell: (line) => (
                    <span className={line.valueImpact >= 0 ? "text-status-success" : "text-status-danger"}>
                      {signedMoney(line.valueImpact)}
                    </span>
                  ),
                },
              ]}
              footer={
                <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
                  <span className="text-muted-foreground">
                    {plural(adjustment.lines.length, "line")}
                  </span>
                  <span className="flex items-center gap-4">
                    <span className="tabular" data-numeric>
                      <span className="text-muted-foreground">Units </span>
                      <span className={adjustment.totalDelta >= 0 ? "font-semibold text-status-success" : "font-semibold text-status-danger"}>
                        {signed(adjustment.totalDelta)}
                      </span>
                    </span>
                    <span className="tabular" data-numeric>
                      <span className="text-muted-foreground">Value </span>
                      <span className={isNegative ? "font-semibold text-status-danger" : "font-semibold text-status-success"}>
                        {signedMoney(adjustment.totalValueImpact)}
                      </span>
                    </span>
                  </span>
                </div>
              }
            />
          </Section>
        </div>

        <div className="grid content-start gap-4">
          <Section title="Details">
            <FieldGrid
              columns={2}
              fields={[
                { label: "Adjustment", value: adjustment.number, mono: true },
                { label: "Reason", value: humanize(adjustment.reason) },
                { label: "Warehouse", value: `${warehouse?.code} · ${warehouse?.name}` },
                { label: "Raised by", value: userById.get(adjustment.createdBy)?.name ?? "—" },
                { label: "Raised", value: dateTime(adjustment.createdAt) },
                {
                  label: "Approved by",
                  value: adjustment.approvedBy
                    ? (userById.get(adjustment.approvedBy)?.name ?? "—")
                    : "Not approved",
                },
                {
                  label: "Posted to stock",
                  value: adjustment.appliedAt ? dateTime(adjustment.appliedAt) : "Not posted",
                },
                { label: "Note", value: adjustment.note, span: 2 },
              ]}
            />
          </Section>

          <Section
            title="Approval trail"
            description="Every action taken on this adjustment, in order."
          >
            <Timeline entries={timeline} />
            {adjustment.status === "applied" && (
              <div className="mt-4 flex items-start gap-2 rounded-md border border-status-success-border bg-status-success-bg p-3">
                <Check className="mt-0.5 size-3.5 shrink-0 text-status-success" aria-hidden />
                <p className="text-caption leading-relaxed text-status-success">
                  This adjustment is posted and immutable. Any further correction is a new
                  adjustment, so the original record and its reason are preserved.
                </p>
              </div>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}
