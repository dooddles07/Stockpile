import Link from "next/link";
import type { Metadata } from "next";
import { Download, TriangleAlert } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { Section, StatTile } from "@/components/record/field-grid";
import { SimpleTable } from "@/components/record/simple-table";
import { RankedBarChart, TrendAreaChart } from "@/components/charts";
import { MeterBar } from "@/components/status/meter-bar";
import { StatusBadge } from "@/components/status/status-badge";
import { spendByCategory, supplierScorecards } from "@/lib/repo/analytics";
import { purchasesVsSales } from "@/lib/repo/metrics";
import { purchaseOrders } from "@/lib/repo/documents";
import { NOW } from "@/lib/data/rng";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { money, percent, plural, qty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ActionButton } from "@/components/actions/action-button";

export const metadata: Metadata = {
  title: "Purchasing analytics",
  description: "Where the money goes, and which suppliers earn it.",
};

export default async function PurchasingAnalyticsPage() {
  const role = await getRole();
  if (!can(role, "analytics")) return <PermissionDenied module="analytics" role={role} />;

  const [scorecards, spend, allPurchaseOrders, monthly] = await Promise.all([
    supplierScorecards(),
    spendByCategory(),
    purchaseOrders(),
    purchasesVsSales(),
  ]);

  const placed = allPurchaseOrders.filter((p) => !["cancelled", "draft"].includes(p.status));
  const totalSpend = placed.reduce((s, p) => s + p.total, 0);
  const open = allPurchaseOrders.filter((p) =>
    ["submitted", "approved", "ordered", "partially-received"].includes(p.status),
  );
  const overdue = open.filter((p) => new Date(p.expectedAt).getTime() < NOW.getTime());

  const settled = scorecards.filter((s) => s.settledOrders > 0);
  const meanOnTime =
    settled.length > 0
      ? settled.reduce((s, x) => s + (x.observedOnTime ?? 0), 0) / settled.length
      : 0;

  const underperforming = scorecards.filter(
    (s) => (s.observedOnTime !== null && s.observedOnTime < 0.85) || s.defectRate > 0.04,
  );

  // Spend concentration: how much of the total sits with the top three.
  const topThreeSpend = scorecards.slice(0, 3).reduce((s, x) => s + x.spend, 0);
  const concentration = totalSpend > 0 ? topThreeSpend / totalSpend : 0;

  const monthlySpend = monthly.map((p) => ({
    label: p.label,
    value: p.purchases,
  }));

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Analytics", href: "/analytics/inventory" }, { label: "Purchasing" }]}
        title="Purchasing analytics"
        description="Lead time and reliability cost money even when the price is right: an unreliable supplier forces buffer stock, and buffer stock is capital that could be somewhere else."
        actions={
          can(role, "analytics", "export") && (
            <ActionButton
              variant="outline" size="sm" className="h-8"
              feedback="Export started"
              detail="Every figure on this page, at the period selected, as CSV."
            >
              <Download className="size-3.5" aria-hidden />
              Export
            </ActionButton>
          )
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <StatTile label="Total spend" value={money(totalSpend)} hint={`${plural(placed.length, "order")}`} />
          <StatTile
            label="Open commitment"
            value={money(open.reduce((s, p) => s + p.total, 0))}
            hint={`${plural(open.length, "order")} in flight`}
          />
          <StatTile
            label="Mean on-time rate"
            value={percent(meanOnTime, 1)}
            tone={meanOnTime >= 0.95 ? "success" : meanOnTime >= 0.85 ? "warning" : "danger"}
            hint="Observed from the order book"
          />
          <StatTile
            label="Overdue orders"
            value={qty(overdue.length)}
            tone={overdue.length > 0 ? "danger" : "success"}
            hint={overdue.length > 0 ? money(overdue.reduce((s, p) => s + p.total, 0)) : "All on schedule"}
          />
          <StatTile
            label="Top 3 concentration"
            value={percent(concentration, 0)}
            tone={concentration > 0.5 ? "warning" : "neutral"}
            hint="Share of spend with three suppliers"
          />
        </div>
      </PageHeader>

      <div className="grid gap-4 p-4 sm:p-6">
        <div className="grid gap-4 lg:grid-cols-3">
          <TrendAreaChart
            className="lg:col-span-2"
            title="Purchase spend"
            description="Committed spend by month, from the order book."
            data={monthlySpend}
            dataKey="value"
            label="Spend"
            color="var(--chart-3)"
          />
          <RankedBarChart
            title="Spend by category"
            description="What the money is actually buying."
            data={spend.map((c) => ({ label: c.name, value: c.value }))}
            dataKey="value"
            label="Spend"
          />
        </div>

        {underperforming.length > 0 && (
          <div className="flex items-start gap-3 rounded-lg border border-status-warning-border bg-status-warning-bg p-4">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden />
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-status-warning">
                {plural(underperforming.length, "supplier")} below the performance threshold
              </p>
              <p className="mt-1 text-caption leading-relaxed text-status-warning/90">
                {money(underperforming.reduce((s, x) => s + x.spend, 0))} of spend sits with
                suppliers delivering under 85% on time or failing over 4% of inspections. Every SKU
                they supply carries extra buffer stock to compensate.
              </p>
            </div>
          </div>
        )}

        <Section
          title="Supplier scorecard"
          description="On-time is measured from the order book, not the stored rate — this is the number that survives an audit."
          contentClassName="p-0"
        >
          <SimpleTable
            rows={scorecards}
            getRowId={(s) => s.id}
            columns={[
              {
                key: "supplier",
                header: "Supplier",
                cell: (s) => (
                  <Link href={`/purchasing/suppliers/${s.id}`} className="grid gap-0.5 hover:underline">
                    <span className="font-medium">{s.name}</span>
                    <span className="text-code text-[11px] text-muted-foreground">{s.code}</span>
                  </Link>
                ),
              },
              { key: "status", header: "Status", cell: (s) => <StatusBadge status={s.status} /> },
              {
                key: "spend",
                header: "Spend",
                align: "right",
                cell: (s) => <span className="font-medium">{money(s.spend)}</span>,
              },
              {
                key: "share",
                header: "Share",
                align: "right",
                hideOnMobile: true,
                cell: (s) => (
                  <span className="text-muted-foreground">
                    {totalSpend > 0 ? percent(s.spend / totalSpend, 1) : "—"}
                  </span>
                ),
              },
              { key: "lead", header: "Lead time", align: "right", cell: (s) => `${s.leadTimeDays}d` },
              {
                key: "onTime",
                header: "On time (observed)",
                align: "right",
                cell: (s) =>
                  s.observedOnTime === null ? (
                    <span className="text-muted-foreground">no history</span>
                  ) : (
                    <span className="flex items-center justify-end gap-2">
                      <MeterBar
                        value={s.observedOnTime}
                        tone={
                          s.observedOnTime >= 0.95
                            ? "success"
                            : s.observedOnTime >= 0.85
                              ? "warning"
                              : "danger"
                        }
                        size="sm"
                        className="w-12"
                        label={`${s.name} delivered on time ${percent(s.observedOnTime, 1)} of the time`}
                      />
                      <span
                        className={cn(
                          "w-12 text-right",
                          s.observedOnTime < 0.85 && "font-semibold text-status-danger",
                        )}
                      >
                        {percent(s.observedOnTime, 0)}
                      </span>
                    </span>
                  ),
              },
              {
                key: "settled",
                header: "Completed",
                align: "right",
                hideOnMobile: true,
                cell: (s) => <span className="text-muted-foreground">{qty(s.settledOrders)}</span>,
              },
              {
                key: "defects",
                header: "Defects",
                align: "right",
                cell: (s) => (
                  <span
                    className={
                      s.defectRate > 0.04
                        ? "font-semibold text-status-danger"
                        : s.defectRate > 0.02
                          ? "text-status-warning"
                          : "text-muted-foreground"
                    }
                  >
                    {percent(s.defectRate, 2)}
                  </span>
                ),
              },
              {
                key: "overdue",
                header: "Overdue",
                align: "right",
                cell: (s) =>
                  s.overdueOrders > 0 ? (
                    <span className="font-semibold text-status-danger">{qty(s.overdueOrders)}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  ),
              },
              {
                key: "returns",
                header: "Returns",
                align: "right",
                hideOnMobile: true,
                cell: (s) =>
                  s.returns > 0 ? (
                    <span className="text-status-warning">
                      {qty(s.returns)}
                      <span className="text-[11px] text-muted-foreground"> · {money(s.returnValue)}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  ),
              },
            ]}
            footer={
              <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
                <span className="text-muted-foreground">{plural(scorecards.length, "supplier")}</span>
                <span className="tabular" data-numeric>
                  <span className="text-muted-foreground">Total spend </span>
                  <span className="font-semibold">{money(totalSpend)}</span>
                </span>
              </div>
            }
          />
        </Section>
      </div>
    </>
  );
}
