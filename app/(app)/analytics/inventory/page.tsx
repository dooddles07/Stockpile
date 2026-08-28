import Link from "next/link";
import type { Metadata } from "next";
import { Download } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { Section, StatTile } from "@/components/record/field-grid";
import { SimpleTable } from "@/components/record/simple-table";
import { GroupedBarChart, RankedBarChart, TrendAreaChart } from "@/components/charts";
import { StatusBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import {
  agingBucketsSync,
  deadStockRowsSync,
  inventoryHeadlineSync,
  turnoverRowsSync,
} from "@/lib/repo/analytics";
import { healthCountsSync, valueByCategorySync } from "@/lib/repo/inventory";
import { inventoryValueTrendSync, movementTrendSync } from "@/lib/repo/metrics";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { compact, money, percent, plural, qty, relative } from "@/lib/format";
import { statusMeta } from "@/lib/status";
import { ActionButton } from "@/components/actions/action-button";

export const metadata: Metadata = {
  title: "Inventory analytics",
  description: "Where the stock value sits, how fast it turns and what has stopped moving.",
};

export default async function InventoryAnalyticsPage() {
  const role = await getRole();
  if (!can(role, "analytics")) return <PermissionDenied module="analytics" role={role} />;

  const headline = inventoryHeadlineSync();
  const health = healthCountsSync();
  const aging = agingBucketsSync();
  const dead = deadStockRowsSync();
  const turnover = turnoverRowsSync();

  const slowest = turnover
    .filter((r) => r.stockValue > 500)
    .sort((a, b) => a.turns - b.turns)
    .slice(0, 10);

  const fastest = turnover
    .filter((r) => r.unitsSold12m > 0)
    .sort((a, b) => b.turns - a.turns)
    .slice(0, 10);

  const healthRows = (
    ["healthy", "low", "critical", "out-of-stock", "overstock"] as const
  ).map((key) => ({ key, label: statusMeta(key).label, count: health[key] }));

  const activeSkus = healthRows.reduce((s, r) => s + r.count, 0);

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Analytics", href: "/analytics/inventory" }, { label: "Inventory" }]}
        title="Inventory analytics"
        description="Stock is capital sitting still. These are the four questions worth asking of it: how much, where, how fast it moves, and how much has stopped."
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
          <StatTile label="Inventory value" value={money(headline.value)} />
          <StatTile label="SKUs holding stock" value={qty(headline.skus)} />
          <StatTile label="Units on hand" value={qty(headline.units)} />
          <StatTile
            label="Turns per year"
            value={headline.turns.toFixed(2)}
            tone={headline.turns >= 4 ? "success" : headline.turns >= 2 ? "warning" : "danger"}
            hint={`${money(headline.cogs12m)} sold at cost`}
          />
          <StatTile
            label="Dead stock"
            value={money(headline.deadValue)}
            tone={headline.deadValue > 0 ? "danger" : "success"}
            hint={`${plural(headline.deadSkus, "SKU")} not moved in 180 days`}
          />
        </div>
      </PageHeader>

      <div className="grid gap-4 p-4 sm:p-6">
        <div className="grid gap-4 lg:grid-cols-3">
          <TrendAreaChart
            className="lg:col-span-2"
            title="Inventory value"
            description="Reconstructed from the movement ledger, week by week."
            data={inventoryValueTrendSync()}
            dataKey="value"
            label="Inventory value"
          />
          <RankedBarChart
            title="Value by category"
            description="Where the capital is concentrated."
            data={valueByCategorySync().map((c) => ({ label: c.name, value: c.value }))}
            dataKey="value"
            label="Value"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <GroupedBarChart
            className="lg:col-span-2"
            title="Units in vs units out"
            description="Weekly receipts against despatches."
            data={movementTrendSync()}
            series={[
              { key: "inbound", label: "Received", color: "var(--chart-2)" },
              { key: "outbound", label: "Shipped", color: "var(--chart-4)" },
            ]}
            format="compact"
          />
          <RankedBarChart
            title="Stock ageing"
            description="Value by how long since the SKU last moved."
            data={aging.map((b) => ({ label: b.label, value: b.value }))}
            dataKey="value"
            label="Value"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Section
            title="Stock health"
            description={`Across ${plural(activeSkus, "active SKU")}.`}
            contentClassName="p-0"
          >
            <SimpleTable
              rows={healthRows}
              getRowId={(r) => r.key}
              columns={[
                { key: "status", header: "Health", cell: (r) => <StatusBadge status={r.key} /> },
                { key: "skus", header: "SKUs", align: "right", cell: (r) => qty(r.count) },
                {
                  key: "share",
                  header: "Share",
                  align: "right",
                  cell: (r) => (
                    <span className="text-muted-foreground">
                      {activeSkus > 0 ? percent(r.count / activeSkus, 1) : "—"}
                    </span>
                  ),
                },
                {
                  key: "action",
                  header: "",
                  align: "right",
                  cell: (r) => (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7"
                      render={
                        <Link
                          href={
                            r.key === "healthy"
                              ? "/inventory/stock-levels"
                              : `/inventory/stock-levels?view=${r.key === "critical" ? "critical" : r.key === "out-of-stock" ? "out-of-stock" : r.key === "overstock" ? "overstock" : "low-stock"}`
                          }
                        />
                      }
                    >
                      View
                    </Button>
                  ),
                },
              ]}
            />
          </Section>

          <Section
            title="Stock ageing detail"
            description="Older stock is more likely to be written down than sold."
            contentClassName="p-0"
          >
            <SimpleTable
              rows={aging}
              getRowId={(b) => b.label}
              columns={[
                { key: "bucket", header: "Age", cell: (b) => b.label },
                { key: "skus", header: "SKUs", align: "right", cell: (b) => qty(b.skus) },
                { key: "units", header: "Units", align: "right", cell: (b) => qty(b.units) },
                {
                  key: "value",
                  header: "Value",
                  align: "right",
                  cell: (b) => <span className="font-medium">{money(b.value)}</span>,
                },
                {
                  key: "share",
                  header: "Share",
                  align: "right",
                  cell: (b) => (
                    <span className="text-muted-foreground">
                      {headline.value > 0 ? percent(b.value / headline.value, 1) : "—"}
                    </span>
                  ),
                },
              ]}
            />
          </Section>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Section
            title="Slowest moving"
            description="Highest value with the fewest turns — the first place to look for tied-up capital."
            contentClassName="p-0"
          >
            <SimpleTable
              rows={slowest}
              getRowId={(r) => r.productId}
              columns={[
                {
                  key: "product",
                  header: "Product",
                  cell: (r) => (
                    <Link href={`/inventory/products/${r.sku}`} className="grid gap-0.5 hover:underline">
                      <span className="font-medium">{r.name}</span>
                      <span className="text-code text-[11px] text-muted-foreground">{r.sku}</span>
                    </Link>
                  ),
                },
                { key: "onHand", header: "On hand", align: "right", cell: (r) => qty(r.onHand) },
                {
                  key: "value",
                  header: "Value",
                  align: "right",
                  cell: (r) => <span className="font-medium">{money(r.stockValue)}</span>,
                },
                {
                  key: "turns",
                  header: "Turns",
                  align: "right",
                  cell: (r) => (
                    <span className={r.turns < 1 ? "font-semibold text-status-danger" : ""}>
                      {r.turns.toFixed(2)}
                    </span>
                  ),
                },
                {
                  key: "moved",
                  header: "Last moved",
                  align: "right",
                  hideOnMobile: true,
                  cell: (r) => (
                    <span className="text-muted-foreground">
                      {r.lastMovedAt ? relative(r.lastMovedAt) : "never"}
                    </span>
                  ),
                },
              ]}
            />
          </Section>

          <Section
            title="Fastest moving"
            description="Highest turns — these are the SKUs a stockout hurts most."
            contentClassName="p-0"
          >
            <SimpleTable
              rows={fastest}
              getRowId={(r) => r.productId}
              columns={[
                {
                  key: "product",
                  header: "Product",
                  cell: (r) => (
                    <Link href={`/inventory/products/${r.sku}`} className="grid gap-0.5 hover:underline">
                      <span className="font-medium">{r.name}</span>
                      <span className="text-code text-[11px] text-muted-foreground">{r.sku}</span>
                    </Link>
                  ),
                },
                {
                  key: "sold",
                  header: "Sold (12m)",
                  align: "right",
                  cell: (r) => qty(r.unitsSold12m),
                },
                {
                  key: "turns",
                  header: "Turns",
                  align: "right",
                  cell: (r) => <span className="font-semibold text-status-success">{r.turns.toFixed(2)}</span>,
                },
                {
                  key: "cover",
                  header: "Days of cover",
                  align: "right",
                  cell: (r) =>
                    r.daysOfCover === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span
                        className={
                          r.daysOfCover < 14 ? "font-semibold text-status-danger" : "text-muted-foreground"
                        }
                      >
                        {qty(r.daysOfCover)}
                      </span>
                    ),
                },
              ]}
            />
          </Section>
        </div>

        <Section
          title="Dead stock"
          description="Value on the shelf with no movement in the last 180 days."
          actions={
            <span className="tabular text-caption text-muted-foreground" data-numeric>
              {money(headline.deadValue)} across {plural(dead.length, "SKU")}
            </span>
          }
          contentClassName="p-0"
        >
          <SimpleTable
            rows={dead.slice(0, 20)}
            getRowId={(r) => r.productId}
            columns={[
              {
                key: "product",
                header: "Product",
                cell: (r) => (
                  <Link href={`/inventory/products/${r.sku}`} className="grid gap-0.5 hover:underline">
                    <span className="font-medium">{r.name}</span>
                    <span className="text-code text-[11px] text-muted-foreground">{r.sku}</span>
                  </Link>
                ),
              },
              { key: "category", header: "Category", hideOnMobile: true, cell: (r) => r.category },
              { key: "onHand", header: "On hand", align: "right", cell: (r) => qty(r.onHand) },
              {
                key: "value",
                header: "Value",
                align: "right",
                cell: (r) => <span className="font-medium text-status-danger">{money(r.stockValue)}</span>,
              },
              {
                key: "age",
                header: "Days since movement",
                align: "right",
                cell: (r) => (
                  <span className="font-semibold text-status-danger">
                    {r.daysSinceMovement === null ? "never moved" : qty(r.daysSinceMovement)}
                  </span>
                ),
              },
              {
                key: "sold",
                header: "Sold (12m)",
                align: "right",
                hideOnMobile: true,
                cell: (r) => (
                  <span className="text-muted-foreground">{compact(r.unitsSold12m)}</span>
                ),
              },
            ]}
          />
        </Section>
      </div>
    </>
  );
}
