import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { FileText, Mail, MapPin, Pencil, Phone, TriangleAlert } from "lucide-react";

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
import { categoryById, productById, warehouseById } from "@/lib/repo/inventory";
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
  const customer = db.customers.find((c) => c.id === id);
  return customer
    ? { title: customer.name, description: `${customer.code} — orders, credit and buying history.` }
    : { title: "Customer not found" };
}

const OPEN_STATUSES = ["confirmed", "reserved", "picking", "packing", "shipped", "backorder"];

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const role = await getRole();
  if (!can(role, "customers")) return <PermissionDenied module="customers" role={role} />;

  const { id } = await params;
  const customer = db.customers.find((c) => c.id === id);
  if (!customer) notFound();

  const orders = db.salesOrders
    .filter((o) => o.customerId === customer.id)
    .sort((a, b) => b.placedAt.localeCompare(a.placedAt));

  const open = orders.filter((o) => OPEN_STATUSES.includes(o.status));
  const delivered = orders.filter((o) => o.status === "delivered");
  const backorders = orders.filter((o) => o.status === "backorder");
  const late = open.filter((o) => new Date(o.promisedAt).getTime() < NOW.getTime());

  const returns = db.returns.filter((r) => r.kind === "sales" && r.partnerId === customer.id);

  const creditUsed = customer.creditLimit > 0 ? customer.outstanding / customer.creditLimit : 0;
  const overLimit = creditUsed > 1;
  const nearLimit = creditUsed > 0.9;

  // What they actually buy, by value — this is what a sales conversation opens
  // with, not the order list.
  const byProduct = new Map<string, { units: number; value: number }>();
  for (const order of orders) {
    if (order.status === "cancelled") continue;
    for (const line of order.lines) {
      const cur = byProduct.get(line.productId) ?? { units: 0, value: 0 };
      cur.units += line.quantity;
      cur.value += line.lineTotal;
      byProduct.set(line.productId, cur);
    }
  }
  const topProducts = [...byProduct.entries()]
    .map(([productId, v]) => ({ product: productById.get(productId), ...v }))
    .filter((p) => p.product)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const avgOrder = orders.length > 0 ? customer.totalSpend / Math.max(1, customer.totalOrders) : 0;

  /* ------------------------------------------------------------ overview -- */

  const overview = (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="grid content-start gap-4 lg:col-span-2">
        {(overLimit || customer.status !== "active") && (
          <div className="flex items-start gap-3 rounded-lg border border-status-danger-border bg-status-danger-bg p-4">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-danger" aria-hidden />
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-status-danger">
                {overLimit
                  ? "This account is over its credit limit"
                  : `This account is ${customer.status === "on-hold" ? "on hold" : "inactive"}`}
              </p>
              <p className="mt-1 text-caption leading-relaxed text-status-danger/90">
                {overLimit
                  ? `${money(customer.outstanding)} outstanding against a ${money(customer.creditLimit)} limit. New orders cannot have stock reserved against them until the balance comes down.`
                  : "New orders cannot be placed for this account until the hold is lifted."}
              </p>
            </div>
          </div>
        )}

        <Section title="Contact">
          <FieldGrid
            fields={[
              { label: "Customer code", value: customer.code, mono: true },
              { label: "Type", value: humanize(customer.type) },
              { label: "Contact", value: customer.contactName },
              {
                label: "Email",
                value: (
                  <a href={`mailto:${customer.email}`} className="hover:underline">
                    {customer.email}
                  </a>
                ),
              },
              { label: "Phone", value: customer.phone, mono: true },
              { label: "Customer since", value: date(customer.since) },
              { label: "Location", value: `${customer.city}, ${customer.country}`, span: 3 },
            ]}
          />
        </Section>

        <Section
          title="Recent orders"
          description="Newest first. Open orders are what is still owed to this customer."
          actions={
            can(role, "sales-orders") && (
              <Button
                variant="outline"
                size="sm"
                className="h-7"
                render={<Link href={`/sales/orders?q=${customer.code}`} />}
              >
                All orders
              </Button>
            )
          }
          contentClassName="p-0"
        >
          <SimpleTable
            rows={orders.slice(0, 12)}
            getRowId={(o) => o.id}
            columns={[
              {
                key: "number",
                header: "Order",
                cell: (o) => (
                  <Link href={`/sales/orders/${o.id}`} className="text-code font-medium hover:underline">
                    {o.number}
                  </Link>
                ),
              },
              { key: "status", header: "Status", cell: (o) => <StatusBadge status={o.status} /> },
              {
                key: "payment",
                header: "Payment",
                hideOnMobile: true,
                cell: (o) => <StatusBadge status={o.paymentStatus} />,
              },
              {
                key: "channel",
                header: "Channel",
                hideOnMobile: true,
                cell: (o) => <span className="text-muted-foreground">{humanize(o.channel)}</span>,
              },
              {
                key: "warehouse",
                header: "From",
                hideOnMobile: true,
                cell: (o) => warehouseById.get(o.warehouseId)?.code ?? "—",
              },
              { key: "lines", header: "Lines", align: "right", cell: (o) => qty(o.lines.length) },
              { key: "total", header: "Total", align: "right", cell: (o) => money(o.total) },
              {
                key: "placed",
                header: "Placed",
                align: "right",
                cell: (o) => <span className="text-muted-foreground">{date(o.placedAt)}</span>,
              },
              {
                key: "promised",
                header: "Promised",
                align: "right",
                cell: (o) => {
                  const isLate =
                    OPEN_STATUSES.includes(o.status) &&
                    new Date(o.promisedAt).getTime() < NOW.getTime();
                  return (
                    <span className={cn(isLate ? "font-semibold text-status-danger" : "text-muted-foreground")}>
                      {isLate ? dueLabel(o.promisedAt) : date(o.promisedAt)}
                    </span>
                  );
                },
              },
            ]}
            empty={
              <EmptyState
                icon={FileText}
                title="No orders yet"
                description="This customer has not placed an order."
                className="py-10"
              />
            }
          />
        </Section>
      </div>

      <div className="grid content-start gap-4">
        <Section title="Credit" description="What this account can commit to.">
          <div className="grid gap-4">
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-caption text-muted-foreground">Credit used</span>
                <span
                  className={cn(
                    "tabular text-[15px] font-bold",
                    overLimit
                      ? "text-status-danger"
                      : nearLimit
                        ? "text-status-warning"
                        : "text-status-success",
                  )}
                  data-numeric
                >
                  {percent(Math.min(creditUsed, 1), 0)}
                </span>
              </div>
              <MeterBar
                value={creditUsed}
                tone={overLimit ? "danger" : nearLimit ? "warning" : "success"}
                className="mt-2"
                label={`${money(customer.outstanding)} outstanding against a ${money(customer.creditLimit)} limit`}
              />
              <p className="mt-1.5 text-caption text-muted-foreground">
                {money(customer.outstanding)} of {money(customer.creditLimit)} ·{" "}
                {money(Math.max(0, customer.creditLimit - customer.outstanding))} available
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <StatTile label="Lifetime value" value={money(customer.totalSpend)} />
              <StatTile label="Average order" value={money(avgOrder)} />
            </div>
          </div>
        </Section>

        <Section title="Order history">
          <FieldGrid
            columns={2}
            fields={[
              { label: "Total orders", value: qty(customer.totalOrders) },
              { label: "Open orders", value: qty(open.length) },
              { label: "Delivered", value: qty(delivered.length) },
              {
                label: "On backorder",
                value: qty(backorders.length),
                hint: backorders.length > 0 ? "Cannot be filled from stock" : undefined,
              },
              {
                label: "Past promised date",
                value: qty(late.length),
                hint: late.length > 0 ? "Needs chasing" : undefined,
              },
              { label: "Returns", value: qty(returns.length) },
            ]}
          />
        </Section>
      </div>
    </div>
  );

  /* ------------------------------------------------------------ products -- */

  const productsTab = (
    <Section
      title="What this customer buys"
      description="Ranked by value across every order they have placed."
      contentClassName="p-0"
    >
      <SimpleTable
        rows={topProducts}
        getRowId={(p) => p.product!.id}
        columns={[
          {
            key: "product",
            header: "Product",
            cell: (p) => (
              <Link
                href={`/inventory/products/${p.product!.sku}`}
                className="flex min-w-0 items-center gap-2.5"
              >
                <ProductThumb
                  category={categoryById.get(p.product!.categoryId)?.name ?? ""}
                  sku={p.product!.sku}
                />
                <span className="grid min-w-0 gap-0.5">
                  <span className="truncate font-medium hover:underline">{p.product!.shortName}</span>
                  <span className="text-code truncate text-[11px] text-muted-foreground">
                    {p.product!.sku}
                  </span>
                </span>
              </Link>
            ),
          },
          {
            key: "category",
            header: "Category",
            hideOnMobile: true,
            cell: (p) => categoryById.get(p.product!.categoryId)?.name ?? "—",
          },
          { key: "units", header: "Units bought", align: "right", cell: (p) => qty(p.units) },
          {
            key: "value",
            header: "Value",
            align: "right",
            cell: (p) => <span className="font-medium">{money(p.value)}</span>,
          },
          {
            key: "share",
            header: "Share of spend",
            align: "right",
            cell: (p) => (
              <span className="text-muted-foreground">
                {customer.totalSpend > 0 ? percent(p.value / customer.totalSpend, 1) : "—"}
              </span>
            ),
          },
        ]}
        empty={
          <EmptyState
            title="Nothing bought yet"
            description="This customer has not ordered any products."
            className="py-10"
          />
        }
      />
    </Section>
  );

  /* ------------------------------------------------------------- returns -- */

  const returnsTab = (
    <Section
      title="Returns"
      description="Stock this customer has sent back, and what happened to it."
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
              <Link href={`/sales/returns/${r.id}`} className="text-code font-medium hover:underline">
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
          {
            key: "restock",
            header: "Back to stock",
            align: "right",
            cell: (r) => money(r.restockValue),
          },
          { key: "refund", header: "Refund", align: "right", cell: (r) => money(r.refundTotal) },
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
            description="This customer has never returned anything."
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
          { label: "Sales", href: "/sales/orders" },
          { label: "Customers", href: "/sales/customers" },
          { label: customer.code },
        ]}
        backHref="/sales/customers"
        backLabel="Customers"
        title={customer.name}
        subtitle={`${humanize(customer.type)} account · customer since ${date(customer.since)}`}
        badge={
          <span className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={customer.status} size="md" />
            {overLimit && <StatusBadge label="Over credit limit" tone="danger" size="md" />}
          </span>
        }
        meta={
          <>
            <span className="text-code text-caption text-muted-foreground">{customer.code}</span>
            <span className="flex items-center gap-1.5 text-caption text-muted-foreground">
              <MapPin className="size-3" aria-hidden />
              {customer.city}, {customer.country}
            </span>
            <a
              href={`mailto:${customer.email}`}
              className="flex items-center gap-1.5 text-caption text-muted-foreground hover:text-foreground"
            >
              <Mail className="size-3" aria-hidden />
              {customer.email}
            </a>
            <span className="flex items-center gap-1.5 text-caption text-muted-foreground">
              <Phone className="size-3" aria-hidden />
              {customer.phone}
            </span>
          </>
        }
        actions={
          <>
            {can(role, "sales-orders", "create") && (
              <Button variant="outline" size="sm" className="h-8" render={<Link href="/sales/orders/new" />}>
                <FileText className="size-3.5" aria-hidden />
                New order
              </Button>
            )}
            {can(role, "customers", "edit") && (
              <Button size="sm" className="h-8" render={<Link href={`/sales/customers/${customer.id}/edit`} />}>
                <Pencil className="size-3.5" aria-hidden />
                Edit
              </Button>
            )}
          </>
        }
      >
        <StatStrip>
          <StatTile label="Lifetime value" value={money(customer.totalSpend)} />
          <StatTile label="Orders" value={qty(customer.totalOrders)} />
          <StatTile
            label="Open"
            value={qty(open.length)}
            tone={late.length > 0 ? "danger" : open.length > 0 ? "info" : "neutral"}
            hint={late.length > 0 ? `${plural(late.length, "order")} late` : undefined}
          />
          <StatTile
            label="Outstanding"
            value={money(customer.outstanding)}
            tone={overLimit ? "danger" : nearLimit ? "warning" : "neutral"}
          />
          <StatTile label="Credit limit" value={money(customer.creditLimit)} />
          <StatTile
            label="Backorders"
            value={qty(backorders.length)}
            tone={backorders.length > 0 ? "warning" : "neutral"}
          />
        </StatStrip>
      </RecordHeader>

      <DetailTabs
        tabs={[
          { id: "overview", label: "Overview", content: overview },
          { id: "products", label: "Products", count: topProducts.length, content: productsTab },
          { id: "returns", label: "Returns", count: returns.length, content: returnsTab },
        ]}
      />
    </>
  );
}
