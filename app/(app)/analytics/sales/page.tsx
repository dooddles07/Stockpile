import Link from "next/link";
import type { Metadata } from "next";
import { Download } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { Section, StatTile } from "@/components/record/field-grid";
import { SimpleTable } from "@/components/record/simple-table";
import { ComparisonLineChart, RankedBarChart } from "@/components/charts";
import { MeterBar } from "@/components/status/meter-bar";
import {
  categoryPerformance,
  productPerformance,
  topCustomers,
} from "@/lib/repo/analytics";
import { purchasesVsSales } from "@/lib/repo/metrics";
import { salesOrders } from "@/lib/repo/documents";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { money, percent, plural, qty } from "@/lib/format";
import { humanize } from "@/lib/status";
import { ActionButton } from "@/components/actions/action-button";

export const metadata: Metadata = {
  title: "Sales analytics",
  description: "What sells, at what margin, to whom.",
};

export default async function SalesAnalyticsPage() {
  const role = await getRole();
  if (!can(role, "analytics")) return <PermissionDenied module="analytics" role={role} />;

  const [products, categories, customers, allSalesOrders, purchasesSales] = await Promise.all([
    productPerformance(),
    categoryPerformance(),
    topCustomers(12),
    salesOrders(),
    purchasesVsSales(),
  ]);

  const booked = allSalesOrders.filter((o) => !["cancelled", "draft"].includes(o.status));
  const revenue = booked.reduce((s, o) => s + o.total, 0);
  const cost = products.reduce((s, p) => s + p.cost, 0);
  const margin = revenue - cost;
  const units = products.reduce((s, p) => s + p.unitsSold, 0);
  const avgOrder = booked.length > 0 ? revenue / booked.length : 0;

  // Channel mix is the question a sales manager asks first: where is the
  // revenue actually coming from?
  const byChannel = new Map<string, { revenue: number; orders: number }>();
  for (const order of booked) {
    const cur = byChannel.get(order.channel) ?? { revenue: 0, orders: 0 };
    cur.revenue += order.total;
    cur.orders += 1;
    byChannel.set(order.channel, cur);
  }
  const channels = [...byChannel.entries()]
    .map(([channel, v]) => ({
      channel: humanize(channel),
      revenue: Math.round(v.revenue),
      orders: v.orders,
      share: revenue > 0 ? v.revenue / revenue : 0,
      averageOrder: Math.round(v.revenue / Math.max(1, v.orders)),
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const lowMargin = products
    .filter((p) => p.revenue > 1000)
    .sort((a, b) => a.marginPct - b.marginPct)
    .slice(0, 10);

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Analytics", href: "/analytics/inventory" }, { label: "Sales" }]}
        title="Sales analytics"
        description="Revenue is only half the picture — margin is what the business keeps, and it is the SKUs with high revenue and thin margin that quietly cost money."
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
          <StatTile label="Revenue" value={money(revenue)} hint={`${plural(booked.length, "order")}`} />
          <StatTile label="Cost of goods" value={money(cost)} />
          <StatTile
            label="Gross margin"
            value={money(margin)}
            tone="success"
            hint={revenue > 0 ? percent(margin / revenue, 1) : undefined}
          />
          <StatTile label="Units sold" value={qty(units)} />
          <StatTile label="Average order" value={money(avgOrder)} />
        </div>
      </PageHeader>

      <div className="grid gap-4 p-4 sm:p-6">
        <div className="grid gap-4 lg:grid-cols-3">
          <ComparisonLineChart
            className="lg:col-span-2"
            title="Purchases vs sales"
            description="Committed spend against booked revenue, by month."
            data={purchasesSales}
            seriesA={{ key: "purchases", label: "Purchases" }}
            seriesB={{ key: "sales", label: "Sales" }}
          />
          <RankedBarChart
            title="Revenue by category"
            description="Where the top line comes from."
            data={categories.map((c) => ({ label: c.name, value: c.revenue }))}
            dataKey="value"
            label="Revenue"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Section
            title="Category performance"
            description="Revenue and the margin each category actually returns."
            contentClassName="p-0"
          >
            <SimpleTable
              rows={categories}
              getRowId={(c) => c.name}
              columns={[
                { key: "name", header: "Category", cell: (c) => <span className="font-medium">{c.name}</span> },
                { key: "skus", header: "SKUs", align: "right", hideOnMobile: true, cell: (c) => qty(c.skus) },
                { key: "units", header: "Units", align: "right", cell: (c) => qty(c.units) },
                { key: "revenue", header: "Revenue", align: "right", cell: (c) => money(c.revenue) },
                {
                  key: "margin",
                  header: "Margin",
                  align: "right",
                  cell: (c) => <span className="text-status-success">{money(c.margin)}</span>,
                },
                {
                  key: "marginPct",
                  header: "Margin %",
                  align: "right",
                  cell: (c) => (
                    <span className="flex items-center justify-end gap-2">
                      <MeterBar
                        value={c.marginPct}
                        tone={c.marginPct >= 0.35 ? "success" : c.marginPct >= 0.2 ? "warning" : "danger"}
                        size="sm"
                        className="w-12"
                        label={`${c.name} returns ${percent(c.marginPct, 1)} margin`}
                      />
                      <span className="w-12 text-right">{percent(c.marginPct, 1)}</span>
                    </span>
                  ),
                },
              ]}
            />
          </Section>

          <Section
            title="Channel mix"
            description="Where orders come from, and how big they are."
            contentClassName="p-0"
          >
            <SimpleTable
              rows={channels}
              getRowId={(c) => c.channel}
              columns={[
                { key: "channel", header: "Channel", cell: (c) => <span className="font-medium">{c.channel}</span> },
                { key: "orders", header: "Orders", align: "right", cell: (c) => qty(c.orders) },
                { key: "revenue", header: "Revenue", align: "right", cell: (c) => money(c.revenue) },
                {
                  key: "avg",
                  header: "Average order",
                  align: "right",
                  hideOnMobile: true,
                  cell: (c) => money(c.averageOrder),
                },
                {
                  key: "share",
                  header: "Share",
                  align: "right",
                  cell: (c) => (
                    <span className="flex items-center justify-end gap-2">
                      <MeterBar
                        value={c.share}
                        tone="info"
                        size="sm"
                        className="w-12"
                        label={`${c.channel} is ${percent(c.share, 1)} of revenue`}
                      />
                      <span className="w-12 text-right">{percent(c.share, 1)}</span>
                    </span>
                  ),
                },
              ]}
            />
          </Section>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Section
            title="Best sellers by revenue"
            description="The SKUs the top line depends on."
            contentClassName="p-0"
          >
            <SimpleTable
              rows={products.slice(0, 12)}
              getRowId={(p) => p.productId}
              columns={[
                {
                  key: "product",
                  header: "Product",
                  cell: (p) => (
                    <Link href={`/inventory/products/${p.sku}`} className="grid gap-0.5 hover:underline">
                      <span className="font-medium">{p.name}</span>
                      <span className="text-code text-[11px] text-muted-foreground">{p.sku}</span>
                    </Link>
                  ),
                },
                { key: "units", header: "Units", align: "right", cell: (p) => qty(p.unitsSold) },
                { key: "orders", header: "Orders", align: "right", hideOnMobile: true, cell: (p) => qty(p.orders) },
                { key: "revenue", header: "Revenue", align: "right", cell: (p) => <span className="font-medium">{money(p.revenue)}</span> },
                {
                  key: "margin",
                  header: "Margin",
                  align: "right",
                  cell: (p) => (
                    <span className={p.marginPct < 0.2 ? "text-status-warning" : "text-status-success"}>
                      {percent(p.marginPct, 0)}
                    </span>
                  ),
                },
              ]}
            />
          </Section>

          <Section
            title="Thinnest margins on high revenue"
            description="Selling a lot of these does not help. Worth a price review or a supplier negotiation."
            contentClassName="p-0"
          >
            <SimpleTable
              rows={lowMargin}
              getRowId={(p) => p.productId}
              columns={[
                {
                  key: "product",
                  header: "Product",
                  cell: (p) => (
                    <Link href={`/inventory/products/${p.sku}`} className="grid gap-0.5 hover:underline">
                      <span className="font-medium">{p.name}</span>
                      <span className="text-code text-[11px] text-muted-foreground">{p.sku}</span>
                    </Link>
                  ),
                },
                { key: "revenue", header: "Revenue", align: "right", cell: (p) => money(p.revenue) },
                { key: "cost", header: "Cost", align: "right", hideOnMobile: true, cell: (p) => money(p.cost) },
                { key: "marginValue", header: "Margin", align: "right", cell: (p) => money(p.margin) },
                {
                  key: "marginPct",
                  header: "Margin %",
                  align: "right",
                  cell: (p) => (
                    <span
                      className={
                        p.marginPct < 0.15
                          ? "font-semibold text-status-danger"
                          : "font-semibold text-status-warning"
                      }
                    >
                      {percent(p.marginPct, 1)}
                    </span>
                  ),
                },
              ]}
            />
          </Section>
        </div>

        <Section
          title="Top customers"
          description="Ranked by revenue. Concentration here is a risk as much as an asset."
          contentClassName="p-0"
        >
          <SimpleTable
            rows={customers}
            getRowId={(c) => c.id}
            columns={[
              {
                key: "customer",
                header: "Customer",
                cell: (c) => (
                  <Link href={`/sales/customers/${c.id}`} className="grid gap-0.5 hover:underline">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-code text-[11px] text-muted-foreground">{c.code}</span>
                  </Link>
                ),
              },
              { key: "orders", header: "Orders", align: "right", cell: (c) => qty(c.orders) },
              { key: "units", header: "Units", align: "right", hideOnMobile: true, cell: (c) => qty(c.units) },
              {
                key: "avg",
                header: "Average order",
                align: "right",
                hideOnMobile: true,
                cell: (c) => money(c.averageOrder),
              },
              {
                key: "revenue",
                header: "Revenue",
                align: "right",
                cell: (c) => <span className="font-medium">{money(c.revenue)}</span>,
              },
              {
                key: "share",
                header: "Share",
                align: "right",
                cell: (c) => (
                  <span className="flex items-center justify-end gap-2">
                    <MeterBar
                      value={revenue > 0 ? c.revenue / revenue : 0}
                      tone={revenue > 0 && c.revenue / revenue > 0.15 ? "warning" : "info"}
                      size="sm"
                      className="w-12"
                      label={`${c.name} is ${percent(revenue > 0 ? c.revenue / revenue : 0, 1)} of revenue`}
                    />
                    <span className="w-12 text-right">
                      {percent(revenue > 0 ? c.revenue / revenue : 0, 1)}
                    </span>
                  </span>
                ),
              },
            ]}
          />
        </Section>
      </div>
    </>
  );
}
