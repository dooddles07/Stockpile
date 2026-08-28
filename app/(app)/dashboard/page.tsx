import Link from "next/link";
import type { Metadata } from "next";
import {
  AlertTriangle,
  ArrowLeftRight,
  ClipboardCheck,
  Clock,
  Download,
  PackageCheck,
  Plus,
} from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { KpiCard } from "@/components/kpi/kpi-card";
import { WidgetCard, WidgetList, WidgetRow } from "@/components/widgets/widget-card";
import { CustomizableGrid, type GridPanel } from "@/components/widgets/customizable-grid";
import { PeriodSelect } from "@/components/widgets/period-select";
import {
  ComparisonLineChart,
  GroupedBarChart,
  RankedBarChart,
  StackedBarChart,
  TrendAreaChart,
} from "@/components/charts";
import { StatusBadge } from "@/components/status/status-badge";
import { EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";
import {
  dashboardKpis,
  expiringLots,
  inventoryValueTrend,
  lowStockAlerts,
  movementTrend,
  pendingApprovals,
  purchasesVsSales,
  recentMovements,
  recentReceipts,
  transfersInFlight,
  warehouseComposition,
} from "@/lib/repo/metrics";
import { supplierById, userById, valueByCategory, warehouseById } from "@/lib/repo/inventory";
import { db } from "@/lib/data/store";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { dueLabel, money, moneyCompact, percent, plural, qty, relative, signed } from "@/lib/format";
import { humanize, priorityMeta } from "@/lib/status";
import { ActionButton } from "@/components/actions/action-button";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "What is happening across every warehouse right now.",
};

function kpiValue(key: string, raw: number): string {
  switch (key) {
    case "inventory-value":
      return moneyCompact(raw);
    case "accuracy":
      return percent(raw, 1);
    default:
      return qty(raw);
  }
}

export default async function DashboardPage() {
  const role = await getRole();
  const kpis = dashboardKpis().filter(
    (k) => k.key !== "inventory-value" || can(role, "valuation") || can(role, "stock"),
  );

  const approvals = pendingApprovals();
  const lowStock = lowStockAlerts(6);
  const lowStockTotal = lowStockAlerts(9999).length;
  const expiring = expiringLots(30, 6);
  const inTransit = transfersInFlight(5);
  const receipts = recentReceipts(5);
  const activity = recentMovements(8);
  const openTasks = db.tasks.filter((t) => t.status !== "done").slice(0, 6);

  const panels: GridPanel[] = [];

  if (can(role, "approvals")) {
    panels.push({
      id: "approvals",
      label: "Needs your approval",
      node: (
        <WidgetCard
          headingLevel={3}
          title="Needs your approval"
          count={approvals.length}
          href="/approvals"
          description="Purchase orders, transfers, adjustments and counts waiting on a decision."
        >
          {approvals.length === 0 ? (
            <EmptyState
              icon={ClipboardCheck}
              title="Nothing waiting"
              description="Every request routed to you has been actioned."
              className="py-10"
            />
          ) : (
            <WidgetList>
              {approvals.slice(0, 5).map((item) => (
                <WidgetRow
                  key={item.id}
                  href={item.href}
                  title={item.title}
                  subtitle={`${item.subtitle} · raised by ${userById.get(item.requestedBy)?.name ?? "—"}`}
                  trailing={money(Math.abs(item.amount))}
                  trailingSub={relative(item.createdAt)}
                />
              ))}
            </WidgetList>
          )}
        </WidgetCard>
      ),
    });
  }

  if (can(role, "stock")) {
    panels.push({
      id: "low-stock",
      label: "Low stock alerts",
      node: (
        <WidgetCard
          headingLevel={3}
          title="Low stock"
          count={lowStockTotal}
          href="/inventory/stock-levels?view=low-stock"
          description="Ranked by how much it costs to be out — reorder value first."
        >
          {lowStock.length === 0 ? (
            <EmptyState
              title="Every SKU is above its reorder point"
              description="Nothing needs raising right now."
              className="py-10"
            />
          ) : (
            <WidgetList>
              {lowStock.map(({ product, stock }) => (
                <WidgetRow
                  key={product.id}
                  href={`/inventory/products/${product.sku}`}
                  title={product.shortName}
                  subtitle={product.sku}
                  trailing={<StatusBadge status={stock.health} />}
                  trailingSub={`${qty(stock.available)} available`}
                />
              ))}
            </WidgetList>
          )}
        </WidgetCard>
      ),
    });
  }

  if (can(role, "transfers")) {
    panels.push({
      id: "transfers",
      label: "Transfers in flight",
      node: (
        <WidgetCard
          headingLevel={3}
          title="Transfers in flight"
          count={inTransit.length}
          href="/warehousing/transfers"
          description="Stock that has left one site and not yet landed at the other."
        >
          {inTransit.length === 0 ? (
            <EmptyState
              icon={ArrowLeftRight}
              title="Nothing in transit"
              description="No stock is currently between sites."
              className="py-10"
            />
          ) : (
            <WidgetList>
              {inTransit.map((t) => (
                <WidgetRow
                  key={t.id}
                  href={`/warehousing/transfers/${t.id}`}
                  title={t.number}
                  subtitle={`${warehouseById.get(t.fromWarehouseId)?.code} → ${warehouseById.get(t.toWarehouseId)?.code} · ${plural(t.lines.length, "line")}`}
                  trailing={<StatusBadge status={t.status} />}
                  trailingSub={dueLabel(t.expectedAt)}
                />
              ))}
            </WidgetList>
          )}
        </WidgetCard>
      ),
    });
  }

  if (can(role, "receiving")) {
    panels.push({
      id: "receipts",
      label: "Recently received",
      node: (
        <WidgetCard
          headingLevel={3}
          title="Recently received"
          href="/warehousing/receiving"
          description="Goods booked in against a purchase order."
        >
          <WidgetList>
            {receipts.map((po) => (
              <WidgetRow
                key={po.id}
                href={`/purchasing/purchase-orders/${po.id}`}
                leading={<PackageCheck className="size-4 text-status-success" aria-hidden />}
                title={po.number}
                subtitle={`${supplierById.get(po.supplierId)?.name} · ${plural(po.lines.length, "line")}`}
                trailing={money(po.total)}
                trailingSub={relative(po.receivedAt)}
              />
            ))}
          </WidgetList>
        </WidgetCard>
      ),
    });
  }

  if (can(role, "stock")) {
    panels.push({
      id: "expiring",
      label: "Expiring inventory",
      node: (
        <WidgetCard
          headingLevel={3}
          title="Expiring inventory"
          count={expiring.length}
          href="/inventory/stock-levels?view=expiring"
          description="Lots reaching their expiry date within 30 days."
        >
          {expiring.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="Nothing expiring"
              description="No tracked lot reaches its expiry date in the next 30 days."
              className="py-10"
            />
          ) : (
            <WidgetList>
              {expiring.map(({ row, product, daysLeft, value }) => (
                <WidgetRow
                  key={`${row.productId}-${row.warehouseId}-${row.lotNumber}`}
                  href={`/inventory/products/${product.sku}`}
                  leading={
                    <AlertTriangle
                      className={daysLeft <= 7 ? "size-4 text-status-danger" : "size-4 text-status-warning"}
                      aria-hidden
                    />
                  }
                  title={product.shortName}
                  subtitle={`${row.lotNumber ?? product.sku} · ${warehouseById.get(row.warehouseId)?.code}`}
                  trailing={money(value)}
                  trailingSub={daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d left`}
                />
              ))}
            </WidgetList>
          )}
        </WidgetCard>
      ),
    });
  }

  panels.push({
    id: "tasks",
    label: "Your tasks",
    node: (
      <WidgetCard
          headingLevel={3}
        title="Tasks"
        count={openTasks.length}
        href="/tasks"
        description="Work assigned across receiving, counting, picking and review."
      >
        <WidgetList>
          {openTasks.map((task) => {
            const tone = priorityMeta(task.priority);
            return (
              <WidgetRow
                key={task.id}
                href={task.href}
                title={task.title}
                subtitle={task.detail}
                trailing={<StatusBadge label={tone.label} tone={tone.tone} />}
                trailingSub={relative(task.dueAt)}
              />
            );
          })}
        </WidgetList>
      </WidgetCard>
    ),
  });

  if (can(role, "movements")) {
    panels.push({
      id: "activity",
      label: "Recent inventory activity",
      span: 3,
      node: (
        <WidgetCard
          headingLevel={3}
          title="Recent inventory activity"
          href="/inventory/movements"
          hrefLabel="Open the ledger"
          description="Every stock change, newest first. The ledger is the source of truth for any number on this page."
        >
          <WidgetList>
            {activity.map((m) => (
              <WidgetRow
                key={m.id}
                href={`/inventory/movements?q=${encodeURIComponent(m.sku)}`}
                leading={
                  <span
                    className={
                      m.qtyChange > 0
                        ? "text-status-success text-[13px] font-semibold tabular"
                        : "text-status-danger text-[13px] font-semibold tabular"
                    }
                    data-numeric
                  >
                    {signed(m.qtyChange)}
                  </span>
                }
                title={`${humanize(m.type)} · ${m.sku}`}
                subtitle={`${warehouseById.get(m.warehouseId)?.code} · ${m.refNumber} · ${userById.get(m.userId)?.name ?? "—"}`}
                trailing={money(Math.abs(m.valueChange), { cents: true })}
                trailingSub={relative(m.ts)}
              />
            ))}
          </WidgetList>
        </WidgetCard>
      ),
    });
  }

  return (
    <>
      <PageHeader
        title="Operations overview"
        description="Stock position, open commitments and the work waiting on a person, across all six sites."
        actions={
          <>
            <PeriodSelect />
            {can(role, "dashboard", "export") && (
              <ActionButton
                variant="outline" size="sm" className="h-8"
                feedback="Export started"
                detail="Every KPI and widget on this dashboard, at the period selected, as CSV."
              >
                <Download className="size-3.5" aria-hidden />
                Export
              </ActionButton>
            )}
            {can(role, "purchase-orders", "create") && (
              <Button size="sm" className="h-8" render={<Link href="/purchasing/purchase-orders/new" />}>
                <Plus className="size-3.5" aria-hidden />
                New purchase order
              </Button>
            )}
          </>
        }
      />

      <div className="space-y-6 p-4 sm:p-6">
        <section aria-label="Key metrics">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {kpis.map((kpi) => (
              <KpiCard
                key={kpi.key}
                label={kpi.label}
                value={kpiValue(kpi.key, kpi.raw)}
                deltaPct={kpi.deltaPct}
                deltaLabel={kpi.deltaLabel}
                direction={kpi.direction}
                goodWhen={kpi.goodWhen}
                tone={kpi.tone}
                href={kpi.href}
                hint={kpi.hint}
                spark={kpi.spark}
              />
            ))}
          </div>
        </section>

        <section aria-label="Trends" className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <TrendAreaChart
            className="lg:col-span-2"
            title="Inventory value"
            description="On-hand value across all warehouses, reconstructed from the movement ledger."
            data={inventoryValueTrend()}
            dataKey="value"
            label="Inventory value"
          />
          <StackedBarChart
            title="Stock composition by site"
            description="Available, reserved, damaged and in transit."
            data={warehouseComposition()}
            series={[
              { key: "available", label: "Available", color: "var(--chart-2)" },
              { key: "reserved", label: "Reserved", color: "var(--chart-5)" },
              { key: "inTransit", label: "In transit", color: "var(--chart-3)" },
              { key: "damaged", label: "Damaged", color: "var(--chart-4)" },
            ]}
          />
        </section>

        <section aria-label="Flow" className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <GroupedBarChart
            title="Units in vs units out"
            description="Weekly receipts and despatches."
            data={movementTrend()}
            series={[
              { key: "inbound", label: "Received", color: "var(--chart-2)" },
              { key: "outbound", label: "Shipped", color: "var(--chart-4)" },
            ]}
            format="compact"
          />
          <ComparisonLineChart
            title="Purchases vs sales"
            description="Committed spend against booked revenue, by month."
            data={purchasesVsSales()}
            seriesA={{ key: "purchases", label: "Purchases" }}
            seriesB={{ key: "sales", label: "Sales" }}
          />
          <RankedBarChart
            title="Inventory value by category"
            description="Where the capital is sitting."
            data={valueByCategory().map((c) => ({ label: c.name, value: c.value }))}
            dataKey="value"
            label="Value"
          />
        </section>

        <CustomizableGrid panels={panels} />
      </div>
    </>
  );
}

