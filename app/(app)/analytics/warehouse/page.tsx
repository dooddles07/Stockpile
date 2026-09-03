import Link from "next/link";
import type { Metadata } from "next";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { Section, StatTile } from "@/components/record/field-grid";
import { SimpleTable } from "@/components/record/simple-table";
import { RankedBarChart, StackedBarChart } from "@/components/charts";
import { MeterBar, capacityTone } from "@/components/status/meter-bar";
import { StatusBadge } from "@/components/status/status-badge";
import { warehousePerformance } from "@/lib/repo/analytics";
import { warehouseComposition } from "@/lib/repo/metrics";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { money, percent, plural, qty } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Warehouse performance",
  description: "How each site is running: capacity, accuracy, timeliness and shrinkage.",
};

export default async function WarehouseAnalyticsPage() {
  const role = await getRole();
  if (!can(role, "analytics")) return <PermissionDenied module="analytics" role={role} />;

  const [sites, composition] = await Promise.all([
    warehousePerformance(),
    warehouseComposition(),
  ]);

  const capacity = sites.reduce((s, w) => s + w.capacityPallets, 0);
  const used = sites.reduce((s, w) => s + w.usedPallets, 0);
  const shrinkage = sites.reduce((s, w) => s + w.shrinkageValue, 0);
  const totalValue = sites.reduce((s, w) => s + w.inventoryValue, 0);

  const withAccuracy = sites.filter((w) => w.countAccuracy !== null);
  const meanAccuracy =
    withAccuracy.length > 0
      ? withAccuracy.reduce((s, w) => s + (w.countAccuracy ?? 0), 0) / withAccuracy.length
      : null;

  const withShipping = sites.filter((w) => w.shippingOnTime !== null);
  const meanShipping =
    withShipping.length > 0
      ? withShipping.reduce((s, w) => s + (w.shippingOnTime ?? 0), 0) / withShipping.length
      : null;

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Analytics", href: "/analytics/inventory" }, { label: "Warehouse" }]}
        title="Warehouse performance"
        description="Four things decide whether a site is healthy: is it full, is the recorded stock true, does work leave on time, and how much walks out unaccounted for."
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <StatTile label="Sites" value={qty(sites.length)} />
          <StatTile
            label="Capacity used"
            value={percent(capacity > 0 ? used / capacity : 0, 0)}
            tone={capacityTone(capacity > 0 ? used / capacity : 0)}
            hint={`${qty(used)} of ${qty(capacity)} pallet positions`}
          />
          <StatTile
            label="Count accuracy"
            value={meanAccuracy !== null ? percent(meanAccuracy, 1) : "—"}
            tone={
              meanAccuracy === null
                ? "neutral"
                : meanAccuracy >= 0.99
                  ? "success"
                  : meanAccuracy >= 0.97
                    ? "warning"
                    : "danger"
            }
            hint="Mean across settled counts"
          />
          <StatTile
            label="Shipped on time"
            value={meanShipping !== null ? percent(meanShipping, 1) : "—"}
            tone={
              meanShipping === null
                ? "neutral"
                : meanShipping >= 0.95
                  ? "success"
                  : meanShipping >= 0.85
                    ? "warning"
                    : "danger"
            }
          />
          <StatTile
            label="Shrinkage"
            value={money(shrinkage)}
            tone={shrinkage > 0 ? "danger" : "success"}
            hint={
              totalValue > 0 ? `${percent(shrinkage / totalValue, 2)} of stock value` : undefined
            }
          />
        </div>
      </PageHeader>

      <div className="grid gap-4 p-4 sm:p-6">
        <div className="grid gap-4 lg:grid-cols-3">
          <StackedBarChart
            className="lg:col-span-2"
            title="Stock composition by site"
            description="Available, reserved, in transit and damaged."
            data={composition}
            series={[
              { key: "available", label: "Available", color: "var(--chart-2)" },
              { key: "reserved", label: "Reserved", color: "var(--chart-5)" },
              { key: "inTransit", label: "In transit", color: "var(--chart-3)" },
              { key: "damaged", label: "Damaged", color: "var(--chart-4)" },
            ]}
          />
          <RankedBarChart
            title="Inventory value by site"
            description="Where the capital sits."
            data={sites.map((w) => ({ label: w.code, value: w.inventoryValue }))}
            dataKey="value"
            label="Value"
          />
        </div>

        <Section
          title="Site scorecard"
          description="Every operational measure that would appear in a site review, side by side."
          contentClassName="p-0"
        >
          <SimpleTable
            rows={sites}
            getRowId={(w) => w.id}
            columns={[
              {
                key: "site",
                header: "Site",
                cell: (w) => (
                  <Link href={`/warehousing/warehouses/${w.id}`} className="grid gap-0.5 hover:underline">
                    <span className="text-code font-medium">{w.code}</span>
                    <span className="truncate text-[11px] text-muted-foreground">{w.city}</span>
                  </Link>
                ),
              },
              { key: "status", header: "Status", cell: (w) => <StatusBadge status={w.status} /> },
              {
                key: "utilisation",
                header: "Capacity",
                align: "right",
                cell: (w) => (
                  <span className="flex items-center justify-end gap-2">
                    <MeterBar
                      value={w.utilization}
                      tone={capacityTone(w.utilization)}
                      size="sm"
                      className="w-12"
                      label={`${w.code} is at ${percent(w.utilization, 0)} capacity`}
                    />
                    <span
                      className={cn(
                        "w-10 text-right",
                        w.utilization > 0.9 && "font-semibold text-status-danger",
                      )}
                    >
                      {percent(w.utilization, 0)}
                    </span>
                  </span>
                ),
              },
              { key: "skus", header: "SKUs", align: "right", hideOnMobile: true, cell: (w) => qty(w.skuCount) },
              {
                key: "value",
                header: "Value",
                align: "right",
                cell: (w) => <span className="font-medium">{money(w.inventoryValue)}</span>,
              },
              {
                key: "accuracy",
                header: "Count accuracy",
                align: "right",
                cell: (w) =>
                  w.countAccuracy === null ? (
                    <span className="text-muted-foreground">no counts</span>
                  ) : (
                    <span
                      className={
                        w.countAccuracy >= 0.99
                          ? "font-semibold text-status-success"
                          : w.countAccuracy >= 0.97
                            ? "text-status-warning"
                            : "font-semibold text-status-danger"
                      }
                    >
                      {percent(w.countAccuracy, 1)}
                    </span>
                  ),
              },
              {
                key: "receiving",
                header: "Receipts on time",
                align: "right",
                hideOnMobile: true,
                cell: (w) =>
                  w.receivingOnTime === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span className={w.receivingOnTime < 0.85 ? "text-status-warning" : ""}>
                      {percent(w.receivingOnTime, 0)}
                      <span className="text-[11px] text-muted-foreground"> of {qty(w.receipts)}</span>
                    </span>
                  ),
              },
              {
                key: "shipping",
                header: "Shipped on time",
                align: "right",
                cell: (w) =>
                  w.shippingOnTime === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span
                      className={
                        w.shippingOnTime >= 0.95
                          ? "text-status-success"
                          : w.shippingOnTime >= 0.85
                            ? "text-status-warning"
                            : "font-semibold text-status-danger"
                      }
                    >
                      {percent(w.shippingOnTime, 0)}
                      <span className="text-[11px] text-muted-foreground">
                        {" "}
                        of {qty(w.ordersShipped)}
                      </span>
                    </span>
                  ),
              },
              {
                key: "transfers",
                header: "Transfers",
                align: "right",
                hideOnMobile: true,
                cell: (w) => (
                  <span className="text-muted-foreground">
                    {qty(w.transfersIn)} in · {qty(w.transfersOut)} out
                  </span>
                ),
              },
              {
                key: "shrinkage",
                header: "Shrinkage",
                align: "right",
                cell: (w) => (
                  <span className={w.shrinkageValue > 0 ? "text-status-danger" : "text-muted-foreground"}>
                    {money(w.shrinkageValue)}
                    {w.shrinkageRate > 0 && (
                      <span className="text-[11px] text-muted-foreground">
                        {" "}
                        · {percent(w.shrinkageRate, 2)}
                      </span>
                    )}
                  </span>
                ),
              },
            ]}
          />
        </Section>

        <div className="grid gap-4 lg:grid-cols-2">
          <Section
            title="Space"
            description="Pallet positions used against capacity. Above 90% and put-away starts costing time."
          >
            <ul className="grid gap-4">
              {[...sites].sort((a, b) => b.utilization - a.utilization).map((w) => (
                <li key={w.id} className="grid gap-1.5">
                  <div className="flex items-baseline justify-between gap-3 text-[13px]">
                    <span className="min-w-0 truncate">
                      <span className="text-code font-medium">{w.code}</span>{" "}
                      <span className="text-muted-foreground">{w.name}</span>
                    </span>
                    <span className="shrink-0 tabular text-caption" data-numeric>
                      {qty(w.usedPallets)} / {qty(w.capacityPallets)} ·{" "}
                      {percent(w.utilization, 0)}
                    </span>
                  </div>
                  <MeterBar
                    value={w.utilization}
                    tone={capacityTone(w.utilization)}
                    size="sm"
                    label={`${w.code} is at ${percent(w.utilization, 0)} of capacity`}
                  />
                </li>
              ))}
            </ul>
          </Section>

          <Section
            title="Shrinkage by site"
            description="Value written off through applied adjustments — damage, loss and expiry."
            contentClassName="p-0"
          >
            <SimpleTable
              rows={[...sites].sort((a, b) => b.shrinkageValue - a.shrinkageValue)}
              getRowId={(w) => w.id}
              columns={[
                {
                  key: "site",
                  header: "Site",
                  cell: (w) => (
                    <Link href={`/warehousing/warehouses/${w.id}`} className="hover:underline">
                      <span className="text-code font-medium">{w.code}</span>
                    </Link>
                  ),
                },
                {
                  key: "value",
                  header: "Stock value",
                  align: "right",
                  hideOnMobile: true,
                  cell: (w) => money(w.inventoryValue),
                },
                {
                  key: "shrinkage",
                  header: "Written off",
                  align: "right",
                  cell: (w) => (
                    <span className={w.shrinkageValue > 0 ? "font-medium text-status-danger" : ""}>
                      {money(w.shrinkageValue)}
                    </span>
                  ),
                },
                {
                  key: "rate",
                  header: "Rate",
                  align: "right",
                  cell: (w) => (
                    <span
                      className={
                        w.shrinkageRate > 0.02
                          ? "font-semibold text-status-danger"
                          : w.shrinkageRate > 0.01
                            ? "text-status-warning"
                            : "text-muted-foreground"
                      }
                    >
                      {percent(w.shrinkageRate, 2)}
                    </span>
                  ),
                },
                {
                  key: "accuracy",
                  header: "Accuracy",
                  align: "right",
                  cell: (w) =>
                    w.countAccuracy === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      percent(w.countAccuracy, 1)
                    ),
                },
              ]}
              footer={
                <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
                  <span className="text-muted-foreground">{plural(sites.length, "site")}</span>
                  <span className="tabular" data-numeric>
                    <span className="text-muted-foreground">Total written off </span>
                    <span className="font-semibold text-status-danger">{money(shrinkage)}</span>
                  </span>
                </div>
              }
            />
          </Section>
        </div>
      </div>
    </>
  );
}
