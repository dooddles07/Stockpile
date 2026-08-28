import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Mail, MapPin, Pencil, Phone, ShoppingCart, TriangleAlert } from "lucide-react";

import { RecordHeader, StatStrip } from "@/components/record/record-header";
import { DetailTabs } from "@/components/record/detail-tabs";
import { FieldGrid, Section, StatTile } from "@/components/record/field-grid";
import { SimpleTable } from "@/components/record/simple-table";
import { MeterBar } from "@/components/status/meter-bar";
import { StatusBadge } from "@/components/status/status-badge";
import { ProductThumb } from "@/components/product/product-thumb";
import { EmptyState, PermissionDenied } from "@/components/states";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/data/store";
import { categoryByIdSync, summaryForSync, warehouseByIdSync } from "@/lib/repo/inventory";
import { NOW } from "@/lib/data/rng";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { date, dueLabel, money, percent, plural, qty, relative } from "@/lib/format";
import { humanize } from "@/lib/status";
import { cn } from "@/lib/utils";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supplier = db.suppliers.find((s) => s.id === id);
  return supplier
    ? { title: supplier.name, description: `${supplier.code} — performance, products and purchase history.` }
    : { title: "Supplier not found" };
}

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const role = await getRole();
  if (!can(role, "suppliers")) return <PermissionDenied module="suppliers" role={role} />;

  const { id } = await params;
  const supplier = db.suppliers.find((s) => s.id === id);
  if (!supplier) notFound();

  const showSpend = can(role, "suppliers", "export") || can(role, "valuation");

  const products = db.products.filter((p) => p.supplierIds.includes(supplier.id));
  const orders = db.purchaseOrders
    .filter((p) => p.supplierId === supplier.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const open = orders.filter((p) =>
    ["submitted", "approved", "ordered", "partially-received"].includes(p.status),
  );
  const received = orders.filter((p) => ["received", "closed"].includes(p.status));
  const overdue = open.filter((p) => new Date(p.expectedAt).getTime() < NOW.getTime());

  // Actual delivery performance from the order book, not the stored rate — the
  // stored figure is a rolling average and this is what it was built from.
  const deliveredOnTime = received.filter(
    (p) => p.receivedAt && new Date(p.receivedAt).getTime() <= new Date(p.expectedAt).getTime(),
  );
  const observedOnTime = received.length > 0 ? deliveredOnTime.length / received.length : null;

  const returns = db.returns.filter(
    (r) => r.kind === "purchase" && r.partnerId === supplier.id,
  );

  const underperforming = supplier.onTimeRate < 0.85 || supplier.defectRate > 0.04;

  /* ------------------------------------------------------------ overview -- */

  const overview = (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="grid content-start gap-4 lg:col-span-2">
        {underperforming && (
          <div className="flex items-start gap-3 rounded-lg border border-status-warning-border bg-status-warning-bg p-4">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden />
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-status-warning">
                This supplier is below the performance threshold
              </p>
              <p className="mt-1 text-caption leading-relaxed text-status-warning/90">
                {supplier.onTimeRate < 0.85 &&
                  `Only ${percent(supplier.onTimeRate, 1)} of deliveries arrive on time, against a 95% target. `}
                {supplier.defectRate > 0.04 &&
                  `${percent(supplier.defectRate, 2)} of received units fail inspection, against a 2% target. `}
                Reorder points for the {plural(products.length, "SKU")} they supply carry extra
                buffer stock to absorb this, which ties up capital.
              </p>
            </div>
          </div>
        )}

        <Section title="Contact">
          <FieldGrid
            fields={[
              { label: "Supplier code", value: supplier.code, mono: true },
              { label: "Contact", value: supplier.contactName },
              {
                label: "Email",
                value: (
                  <a href={`mailto:${supplier.email}`} className="hover:underline">
                    {supplier.email}
                  </a>
                ),
              },
              { label: "Phone", value: supplier.phone, mono: true },
              { label: "Payment terms", value: supplier.paymentTerms },
              { label: "Currency", value: supplier.currency },
              {
                label: "Address",
                value: `${supplier.addressLine}, ${supplier.city}, ${supplier.country}`,
                span: 3,
              },
              {
                label: "Supplies",
                value: (
                  <span className="flex flex-wrap gap-1.5">
                    {supplier.categories.map((slug) => {
                      const name =
                        db.categories.find((c) => c.slug === slug)?.name ?? humanize(slug);
                      return <StatusBadge key={slug} label={name} tone="neutral" showDot={false} />;
                    })}
                  </span>
                ),
                span: 3,
              },
            ]}
          />
        </Section>

        <Section
          title="Recent purchase orders"
          description="Newest first. Open orders are what this supplier still owes."
          actions={
            can(role, "purchase-orders") && (
              <Button
                variant="outline"
                size="sm"
                className="h-7"
                render={<Link href={`/purchasing/purchase-orders?q=${supplier.code}`} />}
              >
                All orders
              </Button>
            )
          }
          contentClassName="p-0"
        >
          <SimpleTable
            rows={orders.slice(0, 12)}
            getRowId={(p) => p.id}
            columns={[
              {
                key: "number",
                header: "Order",
                cell: (p) => (
                  <Link
                    href={`/purchasing/purchase-orders/${p.id}`}
                    className="text-code font-medium hover:underline"
                  >
                    {p.number}
                  </Link>
                ),
              },
              { key: "status", header: "Status", cell: (p) => <StatusBadge status={p.status} /> },
              {
                key: "warehouse",
                header: "Into",
                hideOnMobile: true,
                cell: (p) => warehouseByIdSync.get(p.warehouseId)?.code ?? "—",
              },
              { key: "lines", header: "Lines", align: "right", hideOnMobile: true, cell: (p) => qty(p.lines.length) },
              {
                key: "ordered",
                header: "Ordered",
                align: "right",
                cell: (p) => (
                  <span className="text-muted-foreground">{date(p.orderedAt ?? p.createdAt)}</span>
                ),
              },
              {
                key: "expected",
                header: "Expected",
                align: "right",
                cell: (p) => {
                  const late =
                    !["received", "closed", "cancelled"].includes(p.status) &&
                    new Date(p.expectedAt).getTime() < NOW.getTime();
                  return (
                    <span className={cn(late ? "font-semibold text-status-danger" : "text-muted-foreground")}>
                      {late ? dueLabel(p.expectedAt) : date(p.expectedAt)}
                    </span>
                  );
                },
              },
              ...(showSpend
                ? [
                    {
                      key: "total",
                      header: "Total",
                      align: "right" as const,
                      cell: (p: (typeof orders)[number]) => money(p.total),
                    },
                  ]
                : []),
            ]}
            empty={
              <EmptyState
                icon={ShoppingCart}
                title="No orders yet"
                description="Nothing has been purchased from this supplier."
                className="py-10"
              />
            }
          />
        </Section>
      </div>

      <div className="grid content-start gap-4">
        <Section title="Performance" description="How this supplier actually behaves.">
          <div className="grid gap-4">
            {[
              {
                label: "On-time delivery",
                value: supplier.onTimeRate,
                target: 0.95,
                good: "high" as const,
                format: (v: number) => percent(v, 1),
              },
              {
                label: "Fill rate",
                value: supplier.fulfillmentRate,
                target: 0.98,
                good: "high" as const,
                format: (v: number) => percent(v, 1),
              },
              {
                label: "Defect rate",
                value: supplier.defectRate,
                target: 0.02,
                good: "low" as const,
                format: (v: number) => percent(v, 2),
              },
            ].map((metric) => {
              const meets =
                metric.good === "high" ? metric.value >= metric.target : metric.value <= metric.target;
              const tone = meets ? "success" : metric.good === "high" ? (metric.value >= metric.target - 0.1 ? "warning" : "danger") : (metric.value <= metric.target * 2 ? "warning" : "danger");
              return (
                <div key={metric.label}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-caption text-muted-foreground">{metric.label}</span>
                    <span
                      className={cn(
                        "tabular text-[13px] font-semibold",
                        tone === "success" && "text-status-success",
                        tone === "warning" && "text-status-warning",
                        tone === "danger" && "text-status-danger",
                      )}
                      data-numeric
                    >
                      {metric.format(metric.value)}
                    </span>
                  </div>
                  <MeterBar
                    value={metric.good === "high" ? metric.value : Math.min(1, metric.value / 0.08)}
                    tone={tone}
                    size="sm"
                    className="mt-1.5"
                    label={`${metric.label} is ${metric.format(metric.value)} against a target of ${metric.format(metric.target)}`}
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Target {metric.format(metric.target)}
                  </p>
                </div>
              );
            })}

            {observedOnTime !== null && (
              <div className="rounded-md border bg-surface-sunken p-3">
                <p className="text-caption text-muted-foreground">Observed in the order book</p>
                <p className="mt-1 text-[13px]">
                  <span className="tabular font-semibold" data-numeric>
                    {deliveredOnTime.length} of {received.length}
                  </span>{" "}
                  completed orders arrived on or before their expected date —{" "}
                  {percent(observedOnTime, 1)}.
                </p>
              </div>
            )}
          </div>
        </Section>

        <Section title="Commercial">
          <FieldGrid
            columns={2}
            fields={[
              { label: "Lead time", value: `${supplier.leadTimeDays} days` },
              { label: "Supplier since", value: date(supplier.since) },
              { label: "Open orders", value: qty(open.length) },
              { label: "Completed orders", value: qty(received.length) },
              ...(showSpend
                ? [
                    { label: "Total spend", value: money(supplier.totalSpend) },
                    {
                      label: "Average order",
                      value: orders.length > 0 ? money(supplier.totalSpend / Math.max(1, orders.length)) : "—",
                    },
                  ]
                : []),
              { label: "Returns raised", value: qty(returns.length) },
              { label: "SKUs supplied", value: qty(products.length) },
            ]}
          />
        </Section>
      </div>
    </div>
  );

  /* ------------------------------------------------------------ products -- */

  const productsTab = (
    <Section
      title="Products supplied"
      description="Everything this supplier can provide, with the current stock position."
      contentClassName="p-0"
    >
      <SimpleTable
        rows={products}
        getRowId={(p) => p.id}
        columns={[
          {
            key: "product",
            header: "Product",
            cell: (p) => (
              <Link href={`/inventory/products/${p.sku}`} className="flex min-w-0 items-center gap-2.5">
                <ProductThumb category={categoryByIdSync.get(p.categoryId)?.name ?? ""} sku={p.sku} />
                <span className="grid min-w-0 gap-0.5">
                  <span className="truncate font-medium hover:underline">{p.shortName}</span>
                  <span className="text-code truncate text-[11px] text-muted-foreground">{p.sku}</span>
                </span>
              </Link>
            ),
          },
          {
            key: "category",
            header: "Category",
            hideOnMobile: true,
            cell: (p) => categoryByIdSync.get(p.categoryId)?.name ?? "—",
          },
          {
            key: "role",
            header: "Role",
            cell: (p) =>
              p.primarySupplierId === supplier.id ? (
                <StatusBadge label="Primary" tone="success" showDot={false} />
              ) : (
                <StatusBadge label="Alternate" tone="neutral" showDot={false} />
              ),
          },
          {
            key: "cost",
            header: "Unit cost",
            align: "right",
            cell: (p) => money(p.unitCost, { cents: true }),
          },
          {
            key: "available",
            header: "Available",
            align: "right",
            cell: (p) => qty(summaryForSync(p.id).available),
          },
          {
            key: "health",
            header: "Health",
            cell: (p) => <StatusBadge status={summaryForSync(p.id).health} />,
          },
          { key: "status", header: "Status", hideOnMobile: true, cell: (p) => <StatusBadge status={p.status} /> },
        ]}
        empty={
          <EmptyState
            title="No products linked"
            description="Link products to this supplier so they can be reordered automatically when they hit their reorder point."
            className="py-10"
          />
        }
      />
    </Section>
  );

  /* ------------------------------------------------------------- returns -- */

  const returnsTab = (
    <Section
      title="Purchase returns"
      description="Stock sent back to this supplier, and why."
      contentClassName="p-0"
    >
      <SimpleTable
        rows={returns}
        getRowId={(r) => r.id}
        columns={[
          {
            key: "number",
            header: "Return",
            cell: (r) => (
              <Link href={`/purchasing/returns/${r.id}`} className="text-code font-medium hover:underline">
                {r.number}
              </Link>
            ),
          },
          { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
          { key: "reason", header: "Reason", cell: (r) => <span className="truncate">{r.reason}</span> },
          {
            key: "source",
            header: "Against",
            hideOnMobile: true,
            cell: (r) => <span className="text-code text-muted-foreground">{r.sourceOrderNumber}</span>,
          },
          { key: "lines", header: "Lines", align: "right", cell: (r) => qty(r.lines.length) },
          { key: "refund", header: "Credit", align: "right", cell: (r) => money(r.refundTotal) },
          {
            key: "created",
            header: "Raised",
            align: "right",
            cell: (r) => <span className="text-muted-foreground">{relative(r.createdAt)}</span>,
          },
        ]}
        empty={
          <EmptyState
            title="No returns"
            description="Nothing has been sent back to this supplier. Returns are raised when goods fail inspection or arrive against a cancelled line."
            className="py-10"
          />
        }
      />
    </Section>
  );

  return (
    <>
      <RecordHeader
        crumbs={[
          { label: "Purchasing", href: "/purchasing/purchase-orders" },
          { label: "Suppliers", href: "/purchasing/suppliers" },
          { label: supplier.code },
        ]}
        backHref="/purchasing/suppliers"
        backLabel="Suppliers"
        title={supplier.name}
        subtitle={`${supplier.contactName} · ${supplier.paymentTerms} · ${supplier.leadTimeDays}-day lead time`}
        badge={<StatusBadge status={supplier.status} size="md" />}
        meta={
          <>
            <span className="text-code text-caption text-muted-foreground">{supplier.code}</span>
            <span className="flex items-center gap-1.5 text-caption text-muted-foreground">
              <MapPin className="size-3" aria-hidden />
              {supplier.city}, {supplier.country}
            </span>
            <a
              href={`mailto:${supplier.email}`}
              className="flex items-center gap-1.5 text-caption text-muted-foreground hover:text-foreground"
            >
              <Mail className="size-3" aria-hidden />
              {supplier.email}
            </a>
            <span className="flex items-center gap-1.5 text-caption text-muted-foreground">
              <Phone className="size-3" aria-hidden />
              {supplier.phone}
            </span>
          </>
        }
        actions={
          <>
            {can(role, "purchase-orders", "create") && (
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                render={<Link href="/purchasing/purchase-orders/new" />}
              >
                <ShoppingCart className="size-3.5" aria-hidden />
                New order
              </Button>
            )}
            {can(role, "suppliers", "edit") && (
              <Button size="sm" className="h-8" render={<Link href={`/purchasing/suppliers/${supplier.id}/edit`} />}>
                <Pencil className="size-3.5" aria-hidden />
                Edit
              </Button>
            )}
          </>
        }
      >
        <StatStrip>
          <StatTile
            label="On time"
            value={percent(supplier.onTimeRate, 1)}
            tone={supplier.onTimeRate >= 0.95 ? "success" : supplier.onTimeRate >= 0.85 ? "warning" : "danger"}
          />
          <StatTile label="Fill rate" value={percent(supplier.fulfillmentRate, 1)} />
          <StatTile
            label="Defects"
            value={percent(supplier.defectRate, 2)}
            tone={supplier.defectRate > 0.04 ? "danger" : supplier.defectRate > 0.02 ? "warning" : "success"}
          />
          <StatTile label="Lead time" value={`${supplier.leadTimeDays}d`} />
          <StatTile
            label="Open orders"
            value={qty(open.length)}
            tone={overdue.length > 0 ? "danger" : open.length > 0 ? "info" : "neutral"}
            hint={overdue.length > 0 ? `${qty(overdue.length)} overdue` : undefined}
          />
          <StatTile label="Total spend" value={showSpend ? money(supplier.totalSpend) : "—"} />
        </StatStrip>
      </RecordHeader>

      <DetailTabs
        tabs={[
          { id: "overview", label: "Overview", content: overview },
          { id: "products", label: "Products", count: products.length, content: productsTab },
          { id: "returns", label: "Returns", count: returns.length, content: returnsTab },
        ]}
      />
    </>
  );
}
