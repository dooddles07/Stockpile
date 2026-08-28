import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ClipboardCheck, Download, Printer, TriangleAlert, Users } from "lucide-react";

import { RecordHeader, StatStrip } from "@/components/record/record-header";
import { DetailTabs } from "@/components/record/detail-tabs";
import { FieldGrid, Section, StatTile } from "@/components/record/field-grid";
import { SimpleTable } from "@/components/record/simple-table";
import { ApprovalActions } from "@/components/record/approval-actions";
import { CountSheet } from "./count-sheet";
import { WorkflowStepper } from "@/components/status/workflow-stepper";
import { StatusBadge } from "@/components/status/status-badge";
import { EmptyState, PermissionDenied } from "@/components/states";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { db } from "@/lib/data/store";
import { locationById, productById, userById, warehouseById } from "@/lib/repo/inventory";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { date, dateTime, initials, plural, qty, relative, signed, signedMoney } from "@/lib/format";
import { humanize } from "@/lib/status";
import { ActionButton } from "@/components/actions/action-button";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const count = db.stockCounts.find((c) => c.id === id);
  return count
    ? { title: count.number, description: `${humanize(count.type)} count — ${count.scopeLabel}.` }
    : { title: "Count not found" };
}

const TOLERANCE = 8;

export default async function CountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const role = await getRole();
  if (!can(role, "counts")) return <PermissionDenied module="counts" role={role} />;

  const { id } = await params;
  const count = db.stockCounts.find((c) => c.id === id);
  if (!count) notFound();

  const warehouse = warehouseById.get(count.warehouseId);
  const canApprove = can(role, "counts", "approve");
  const canCount = can(role, "counts", "edit");
  const awaitingReview = count.status === "review";

  const counted = count.lines.filter((l) => l.counted !== null);
  const variances = counted.filter((l) => l.variance !== 0);
  const recounts = variances.filter((l) => Math.abs(l.variance) > TOLERANCE);
  const shrinkage = variances.filter((l) => l.variance < 0);
  const surplus = variances.filter((l) => l.variance > 0);

  /* ------------------------------------------------------------ variances */

  const varianceTab = (
    <div className="grid gap-4">
      {awaitingReview && (
        <div className="flex items-start gap-3 rounded-lg border border-status-warning-border bg-status-warning-bg p-4">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden />
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-status-warning">
              Nothing has posted to stock yet
            </p>
            <p className="mt-1 text-caption leading-relaxed text-status-warning/90">
              Approving this count writes {plural(variances.length, "variance line")} to the ledger as
              adjustments, moving {signed(variances.reduce((s, l) => s + l.variance, 0))} units and{" "}
              {signedMoney(count.totalVarianceValue)} of value. Recorded quantities are unchanged
              until then.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile
          label="Accuracy"
          value={counted.length > 0 ? `${count.accuracyPct.toFixed(1)}%` : "—"}
          tone={count.accuracyPct >= 99 ? "success" : count.accuracyPct >= 97 ? "warning" : "danger"}
          hint={`${qty(counted.length - variances.length)} of ${plural(counted.length, "line")} matched`}
        />
        <StatTile
          label="Shrinkage"
          value={qty(Math.abs(shrinkage.reduce((s, l) => s + l.variance, 0)))}
          tone={shrinkage.length > 0 ? "danger" : "neutral"}
          hint={`${plural(shrinkage.length, "line")} short`}
        />
        <StatTile
          label="Surplus"
          value={qty(surplus.reduce((s, l) => s + l.variance, 0))}
          tone={surplus.length > 0 ? "purple" : "neutral"}
          hint={`${plural(surplus.length, "line")} over`}
        />
        <StatTile
          label="Value impact"
          value={signedMoney(count.totalVarianceValue)}
          tone={count.totalVarianceValue < 0 ? "danger" : "success"}
        />
      </div>

      <Section
        title="Variance lines"
        description={`Only the ${plural(variances.length, "line")} where the count did not match. Everything else agreed with the system.`}
        contentClassName="p-0"
      >
        <SimpleTable
          rows={variances}
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
              key: "location",
              header: "Bin",
              hideOnMobile: true,
              cell: (l) => (
                <span className="text-code text-muted-foreground">
                  {locationById.get(l.locationId)?.code ?? "—"}
                </span>
              ),
            },
            { key: "expected", header: "Expected", align: "right", cell: (l) => qty(l.expected) },
            {
              key: "counted",
              header: "Counted",
              align: "right",
              cell: (l) => <span className="font-medium">{qty(l.counted ?? 0)}</span>,
            },
            {
              key: "variance",
              header: "Variance",
              align: "right",
              cell: (l) => (
                <span
                  className={
                    l.variance > 0
                      ? "font-semibold text-status-purple"
                      : "font-semibold text-status-danger"
                  }
                >
                  {signed(l.variance)}
                </span>
              ),
            },
            {
              key: "value",
              header: "Value",
              align: "right",
              cell: (l) => (
                <span className={l.varianceValue >= 0 ? "text-status-success" : "text-status-danger"}>
                  {signedMoney(l.varianceValue)}
                </span>
              ),
            },
            {
              key: "flag",
              header: "Tolerance",
              cell: (l) =>
                Math.abs(l.variance) > TOLERANCE ? (
                  <StatusBadge label="Recount" tone="danger" />
                ) : (
                  <StatusBadge label="Within ±8" tone="warning" />
                ),
            },
            {
              key: "countedBy",
              header: "Counted by",
              hideOnMobile: true,
              cell: (l) => (l.countedBy ? (userById.get(l.countedBy)?.name ?? "—") : "—"),
            },
          ]}
          footer={
            <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
              <span className="text-muted-foreground">
                {plural(variances.length, "line")} of {qty(count.lines.length)} varied
              </span>
              <span className="tabular" data-numeric>
                <span className="text-muted-foreground">Units </span>
                <span className="font-semibold">
                  {signed(variances.reduce((s, l) => s + l.variance, 0))}
                </span>
                <span className="text-muted-foreground"> · Value </span>
                <span
                  className={
                    count.totalVarianceValue < 0
                      ? "font-semibold text-status-danger"
                      : "font-semibold text-status-success"
                  }
                >
                  {signedMoney(count.totalVarianceValue)}
                </span>
              </span>
            </div>
          }
          empty={
            <EmptyState
              icon={ClipboardCheck}
              title="No variances"
              description={
                counted.length === 0
                  ? "Nothing has been counted yet, so there is nothing to compare against."
                  : "Every counted line matched the recorded quantity exactly. Nothing needs to post."
              }
              className="py-10"
            />
          }
        />
      </Section>
    </div>
  );

  /* ---------------------------------------------------------------- sheet */

  const sheetLines = count.lines.map((l) => ({
    id: l.id,
    sku: l.sku,
    name: productById.get(l.productId)?.shortName ?? l.name,
    locationCode: locationById.get(l.locationId)?.code ?? "—",
    expected: l.expected,
    counted: l.counted,
    unitCost: productById.get(l.productId)?.unitCost ?? 0,
  }));

  const sheetTab =
    count.status === "cancelled" || ["approved", "applied"].includes(count.status) ? (
      <div className="rounded-lg border bg-surface">
        <EmptyState
          icon={ClipboardCheck}
          title={count.status === "cancelled" ? "Count was cancelled" : "Counting is finished"}
          description={
            count.status === "cancelled"
              ? "This count was cancelled before it completed, so no quantities were recorded."
              : `All ${plural(count.lines.length, "line")} were counted and the result was ${count.status === "applied" ? "posted to stock" : "approved"}. The sheet is closed.`
          }
        />
      </div>
    ) : (
      <CountSheet countNumber={count.number} lines={sheetLines} />
    );

  /* ------------------------------------------------------------ overview */

  const overview = (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="grid content-start gap-4 lg:col-span-2">
        <Section title="All counted lines" description="The full sheet, including lines that matched." contentClassName="p-0">
          <SimpleTable
            rows={count.lines}
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
                key: "location",
                header: "Bin",
                hideOnMobile: true,
                cell: (l) => (
                  <span className="text-code text-muted-foreground">
                    {locationById.get(l.locationId)?.code ?? "—"}
                  </span>
                ),
              },
              { key: "expected", header: "Expected", align: "right", cell: (l) => qty(l.expected) },
              {
                key: "counted",
                header: "Counted",
                align: "right",
                cell: (l) =>
                  l.counted === null ? (
                    <span className="text-muted-foreground">not counted</span>
                  ) : (
                    <span className="font-medium">{qty(l.counted)}</span>
                  ),
              },
              {
                key: "variance",
                header: "Variance",
                align: "right",
                cell: (l) =>
                  l.counted === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : l.variance === 0 ? (
                    <span className="text-status-success">match</span>
                  ) : (
                    <span
                      className={
                        l.variance > 0 ? "font-semibold text-status-purple" : "font-semibold text-status-danger"
                      }
                    >
                      {signed(l.variance)}
                    </span>
                  ),
              },
              {
                key: "countedAt",
                header: "Counted",
                align: "right",
                hideOnMobile: true,
                cell: (l) => (
                  <span className="text-muted-foreground">
                    {l.countedAt ? relative(l.countedAt) : "—"}
                  </span>
                ),
              },
            ]}
          />
        </Section>
      </div>

      <div className="grid content-start gap-4">
        <Section title="Details">
          <FieldGrid
            columns={2}
            fields={[
              { label: "Count", value: count.number, mono: true },
              { label: "Type", value: humanize(count.type) },
              { label: "Warehouse", value: `${warehouse?.code} · ${warehouse?.name}` },
              { label: "Scope", value: count.scopeLabel },
              { label: "Scheduled", value: date(count.scheduledFor) },
              { label: "Started", value: count.startedAt ? dateTime(count.startedAt) : "Not started" },
              {
                label: "Completed",
                value: count.completedAt ? dateTime(count.completedAt) : "Not completed",
              },
              { label: "Raised by", value: userById.get(count.createdBy)?.name ?? "—" },
              {
                label: "Approved by",
                value: count.approvedBy ? (userById.get(count.approvedBy)?.name ?? "—") : "Not approved",
              },
            ]}
          />
        </Section>

        <Section
          title="Counters"
          description="Who is assigned to walk this count."
          actions={<Users className="size-4 text-muted-foreground" aria-hidden />}
        >
          <ul className="grid gap-2.5">
            {count.assignedTo.map((userId) => {
              const user = userById.get(userId);
              const lines = counted.filter((l) => l.countedBy === userId);
              return (
                <li key={userId} className="flex items-center gap-2.5">
                  <Avatar className="size-7">
                    <AvatarFallback className="bg-surface-sunken text-[10px] font-semibold text-muted-foreground">
                      {initials(user?.name ?? "?")}
                    </AvatarFallback>
                  </Avatar>
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="truncate text-[13px] font-medium">{user?.name}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {warehouseById.get(user?.warehouseId ?? "")?.code ?? "roaming"}
                    </span>
                  </span>
                  <span className="tabular shrink-0 text-caption text-muted-foreground" data-numeric>
                    {plural(lines.length, "line")}
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>
      </div>
    </div>
  );

  const tabs = [
    { id: "overview", label: "Overview", count: count.lines.length, content: overview },
    { id: "variances", label: "Variances", count: variances.length, content: varianceTab },
  ];

  if (canCount) {
    tabs.push({ id: "sheet", label: "Count sheet", count: count.lines.length, content: sheetTab });
  }

  return (
    <>
      <RecordHeader
        crumbs={[
          { label: "Inventory", href: "/inventory/products" },
          { label: "Stock counts", href: "/inventory/counts" },
          { label: count.number },
        ]}
        backHref="/inventory/counts"
        backLabel="Stock counts"
        title={count.number}
        subtitle={`${humanize(count.type)} count · ${count.scopeLabel} at ${warehouse?.code}`}
        badge={<StatusBadge status={count.status} size="md" />}
        meta={
          <>
            <span className="text-caption text-muted-foreground">
              {plural(count.lines.length, "line")} · {qty(counted.length)} counted
            </span>
            <span className="text-caption text-muted-foreground">
              Scheduled {date(count.scheduledFor)}
            </span>
            {recounts.length > 0 && (
              <StatusBadge label={`${plural(recounts.length, "line")} need a recount`} tone="danger" />
            )}
          </>
        }
        actions={
          <>
            <ActionButton
              variant="outline" size="sm" className="h-8"
              feedback="Sent to printer"
              detail={`The count sheet for ${count.number} is queued on the default printer.`}
            >
              <Printer className="size-3.5" aria-hidden />
              Print sheet
            </ActionButton>
            {can(role, "counts", "export") && (
              <ActionButton
                variant="outline" size="sm" className="h-8"
                feedback="Export started"
                detail={`A PDF copy of ${count.number} downloads once it is rendered.`}
              >
                <Download className="size-3.5" aria-hidden />
                Export
              </ActionButton>
            )}
            {awaitingReview && canApprove && (
              <ApprovalActions
                recordLabel={count.number}
                summary={`${plural(variances.length, "variance line")} out of ${qty(counted.length)} counted, ${count.accuracyPct.toFixed(1)}% accurate.`}
                impact={`Approving posts every variance to the movement ledger as an adjustment: ${signed(variances.reduce((s, l) => s + l.variance, 0))} units and ${signedMoney(count.totalVarianceValue)} of value at ${warehouse?.code}. Recorded quantities become the counted quantities and cannot be reverted, only adjusted again.`}
              />
            )}
            {awaitingReview && !canApprove && (
              <StatusBadge label="Waiting on an approver" tone="warning" size="md" />
            )}
          </>
        }
      >
        <div className="grid gap-3">
          <WorkflowStepper workflow="count" status={count.status} />
          <StatStrip columns={5}>
            <StatTile label="Lines" value={qty(count.lines.length)} />
            <StatTile
              label="Counted"
              value={qty(counted.length)}
              tone={counted.length === count.lines.length ? "success" : "warning"}
            />
            <StatTile
              label="Variances"
              value={qty(variances.length)}
              tone={variances.length > 0 ? "warning" : "success"}
            />
            <StatTile
              label="Accuracy"
              value={counted.length > 0 ? `${count.accuracyPct.toFixed(1)}%` : "—"}
              tone={count.accuracyPct >= 99 ? "success" : count.accuracyPct >= 97 ? "warning" : "danger"}
            />
            <StatTile
              label="Value impact"
              value={signedMoney(count.totalVarianceValue)}
              tone={count.totalVarianceValue < 0 ? "danger" : "success"}
            />
          </StatStrip>
        </div>
      </RecordHeader>

      <DetailTabs tabs={tabs} defaultTab={awaitingReview ? "variances" : "overview"} />
    </>
  );
}
