import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowLeftRight,
  ClipboardCheck,  FileText,
  Package,
  PackageCheck,
  Pencil,
  ShoppingCart,
  SlidersHorizontal,
  TriangleAlert,
  Undo2,
} from "lucide-react";

import { RecordHeader, StatStrip } from "@/components/record/record-header";
import { DetailTabs } from "@/components/record/detail-tabs";
import { FieldGrid, Section, StatTile } from "@/components/record/field-grid";
import { SimpleTable } from "@/components/record/simple-table";
import { UploadDialog } from "@/components/record/upload-dialog";
import { Timeline, type TimelineEntry } from "@/components/record/timeline";
import { StatusBadge } from "@/components/status/status-badge";
import { StockHealthBar } from "@/components/status/stock-health-bar";
import { ProductThumb } from "@/components/product/product-thumb";
import { EmptyState, PermissionDenied } from "@/components/states";
import { Button } from "@/components/ui/button";
import { MeterBar } from "@/components/status/meter-bar";
import { db } from "@/lib/data/store";
import {
  categoryById,
  locationById,
  movementsFor,
  productBySku,
  stockRowsFor,
  summaryFor,
  supplierById,
  userById,
  warehouseById,
} from "@/lib/repo/inventory";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import {
  date,
  plural,

  money,
  percent,
  qty,
  relative,
  signed,
  signedMoney,
} from "@/lib/format";
import { humanize, statusMeta } from "@/lib/status";
import type { MovementType, StatusTone } from "@/lib/types";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ sku: string }>;
}): Promise<Metadata> {
  const { sku } = await params;
  const product = productBySku.get(decodeURIComponent(sku));
  return product
    ? { title: product.shortName, description: `${product.sku} — stock, pricing, suppliers and movement history.` }
    : { title: "Product not found" };
}

const MOVEMENT_TONE: Record<MovementType, StatusTone> = {
  "purchase-receipt": "success",
  sale: "info",
  "transfer-out": "info",
  "transfer-in": "info",
  adjustment: "warning",
  "return-in": "purple",
  "return-out": "purple",
  damage: "danger",
  "count-correction": "warning",
};

const MOVEMENT_ICON: Record<MovementType, typeof Package> = {
  "purchase-receipt": PackageCheck,
  sale: FileText,
  "transfer-out": ArrowLeftRight,
  "transfer-in": ArrowLeftRight,
  adjustment: SlidersHorizontal,
  "return-in": Undo2,
  "return-out": Undo2,
  damage: TriangleAlert,
  "count-correction": ClipboardCheck,
};

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ sku: string }>;
}) {
  const role = await getRole();
  if (!can(role, "products")) return <PermissionDenied module="products" role={role} />;

  const { sku } = await params;
  const product = productBySku.get(decodeURIComponent(sku));
  if (!product) notFound();

  const stock = summaryFor(product.id);
  const rows = stockRowsFor(product.id);
  const category = categoryById.get(product.categoryId);
  const primarySupplier = supplierById.get(product.primarySupplierId);
  const movements = movementsFor(product.id);
  const canEdit = can(role, "products", "edit");
  const showCost = can(role, "valuation") || can(role, "products");

  const openPos = db.purchaseOrders.filter(
    (po) =>
      ["submitted", "approved", "ordered", "partially-received"].includes(po.status) &&
      po.lines.some((l) => l.productId === product.id),
  );

  const recentPoLines = db.purchaseOrders
    .filter((po) => po.lines.some((l) => l.productId === product.id))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8);

  /* ------------------------------------------------------------ overview -- */

  const overview = (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="grid gap-4 lg:col-span-2">
        <Section title="Product details">
          <FieldGrid
            fields={[
              { label: "SKU", value: product.sku, mono: true },
              { label: "Barcode (EAN-13)", value: product.barcode, mono: true },
              { label: "Category", value: category?.name ?? "—" },
              { label: "Brand", value: product.brand },
              { label: "Unit of measure", value: product.unit },
              { label: "HS code", value: product.hsCode, mono: true },
              { label: "Weight", value: `${product.weightKg} kg` },
              { label: "Dimensions (L×W×H)", value: `${product.dimensionsCm} cm` },
              { label: "Lead time", value: `${product.leadTimeDays} days`, hint: "From the primary supplier" },
              {
                label: "Tracking",
                value: (
                  <span className="flex flex-wrap gap-1.5">
                    {product.batchTracked && <StatusBadge label="Batch / lot" tone="info" showDot={false} />}
                    {product.serialTracked && <StatusBadge label="Serial" tone="info" showDot={false} />}
                    {product.hasExpiry && <StatusBadge label="Expiry" tone="warning" showDot={false} />}
                    {!product.batchTracked && !product.serialTracked && !product.hasExpiry && (
                      <span className="text-muted-foreground">Quantity only</span>
                    )}
                  </span>
                ),
              },
              {
                label: "Shelf life",
                value: product.shelfLifeDays ? `${product.shelfLifeDays} days` : "Not perishable",
              },
              { label: "Created", value: date(product.createdAt) },
              { label: "Description", value: product.description, span: 3 },
            ]}
          />
        </Section>

        <Section
          title="Stock by warehouse"
          description="On-hand, reserved and damaged units per site, with the bin they sit in."
          actions={
            can(role, "stock") && (
              <Button variant="outline" size="sm" className="h-7" render={<Link href={`/inventory/stock-levels?q=${product.sku}`} />}>
                Open in stock levels
              </Button>
            )
          }
          contentClassName="p-0"
        >
          <SimpleTable
            rows={rows}
            getRowId={(r, i) => `${r.warehouseId}-${i}`}
            columns={[
              {
                key: "warehouse",
                header: "Warehouse",
                cell: (r) => {
                  const wh = warehouseById.get(r.warehouseId);
                  return (
                    <Link href={`/warehousing/warehouses/${r.warehouseId}`} className="grid gap-0.5 hover:underline">
                      <span className="font-medium">{wh?.code}</span>
                      <span className="text-[11px] text-muted-foreground">{wh?.city}</span>
                    </Link>
                  );
                },
              },
              {
                key: "location",
                header: "Location",
                hideOnMobile: true,
                cell: (r) => (
                  <span className="text-code text-muted-foreground">
                    {locationById.get(r.locationId)?.code ?? "—"}
                  </span>
                ),
              },
              { key: "onHand", header: "On hand", align: "right", cell: (r) => qty(r.onHand) },
              {
                key: "reserved",
                header: "Reserved",
                align: "right",
                hideOnMobile: true,
                cell: (r) => <span className="text-muted-foreground">{qty(r.reserved)}</span>,
              },
              {
                key: "damaged",
                header: "Damaged",
                align: "right",
                hideOnMobile: true,
                cell: (r) =>
                  r.damaged > 0 ? (
                    <span className="text-status-danger">{qty(r.damaged)}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  ),
              },
              {
                key: "available",
                header: "Available",
                align: "right",
                cell: (r) => (
                  <span className="font-semibold">
                    {qty(Math.max(0, r.onHand - r.reserved - r.damaged))}
                  </span>
                ),
              },
              {
                key: "lot",
                header: "Lot / expiry",
                hideOnMobile: true,
                cell: (r) =>
                  r.lotNumber || r.expiresAt ? (
                    <span className="grid gap-0.5">
                      {r.lotNumber && <span className="text-code">{r.lotNumber}</span>}
                      {r.expiresAt && (
                        <span className="text-[11px] text-muted-foreground">
                          expires {date(r.expiresAt)}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  ),
              },
              {
                key: "counted",
                header: "Last counted",
                align: "right",
                hideOnMobile: true,
                cell: (r) => (
                  <span className="text-muted-foreground">{r.lastCountedAt ? relative(r.lastCountedAt) : "never"}</span>
                ),
              },
            ]}
            footer={
              <div className="flex flex-wrap items-center justify-between gap-2 text-caption">
                <span className="text-muted-foreground">
                  {plural(rows.length, "site")} holding this SKU
                </span>
                <span className="tabular font-medium" data-numeric>
                  {qty(stock.onHand)} on hand · {qty(stock.available)} available
                </span>
              </div>
            }
            empty={
              <EmptyState
                icon={Package}
                title="No stock recorded"
                description="This product has no stock at any warehouse. Raise a purchase order or receive it against an existing one."
                className="py-10"
              />
            }
          />
        </Section>
      </div>

      <div className="grid content-start gap-4">
        <Section title="Reorder policy">
          <div className="grid gap-4">
            <StockHealthBar
              available={stock.available}
              reorderPoint={product.reorderPoint}
              health={stock.health}
            />
            <FieldGrid
              columns={2}
              fields={[
                { label: "Reorder point", value: qty(product.reorderPoint) },
                { label: "Reorder quantity", value: qty(product.reorderQty) },
                {
                  label: "Cover at current rate",
                  value:
                    stock.available > 0
                      ? `${Math.round((stock.available / Math.max(1, product.reorderPoint / 14)) * 10) / 10} days`
                      : "0 days",
                  hint: "Available at the average daily draw rate",
                },
                { label: "On order", value: qty(stock.incoming) },
              ]}
            />
            {stock.health !== "healthy" && (
              <div className="rounded-md border border-status-warning-border bg-status-warning-bg p-3">
                <p className="text-[13px] font-medium text-status-warning">
                  {statusMeta(stock.health).label}
                </p>
                <p className="mt-1 text-caption leading-relaxed text-status-warning/90">
                  {statusMeta(stock.health).hint ??
                    "This SKU needs attention before it affects fulfillment."}
                </p>
                {can(role, "purchase-orders", "create") && (
                  <Button
                    size="sm"
                    className="mt-3 h-7"
                    render={<Link href="/purchasing/purchase-orders/new" />}
                  >
                    Raise a purchase order
                  </Button>
                )}
              </div>
            )}
          </div>
        </Section>

        {openPos.length > 0 && (
          <Section title="Open purchase orders" description="Stock already committed and on its way.">
            <ul className="grid gap-2.5">
              {openPos.slice(0, 5).map((po) => {
                const line = po.lines.find((l) => l.productId === product.id)!;
                return (
                  <li key={po.id}>
                    <Link
                      href={`/purchasing/purchase-orders/${po.id}`}
                      className="flex items-start justify-between gap-3 rounded-md border p-2.5 transition-colors hover:bg-surface-hover"
                    >
                      <span className="grid min-w-0 gap-0.5">
                        <span className="text-code font-medium">{po.number}</span>
                        <span className="truncate text-caption text-muted-foreground">
                          {supplierById.get(po.supplierId)?.name}
                        </span>
                      </span>
                      <span className="grid shrink-0 justify-items-end gap-1">
                        <StatusBadge status={po.status} />
                        <span className="tabular text-caption text-muted-foreground" data-numeric>
                          {qty(line.quantity - line.fulfilled)} due {date(po.expectedAt)}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );

  /* ----------------------------------------------------------- inventory -- */

  const totalCapacityUsed = rows.reduce((s, r) => s + r.onHand, 0);

  const inventory = (
    <div className="grid gap-4">
      <Section title="Position" description="Where every unit of this SKU currently sits.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="On hand" value={qty(stock.onHand)} hint="Physically in the buildings" />
          <StatTile
            label="Reserved"
            value={qty(stock.reserved)}
            tone="purple"
            hint="Allocated to open sales orders"
          />
          <StatTile
            label="Damaged"
            value={qty(stock.damaged)}
            tone={stock.damaged > 0 ? "danger" : "neutral"}
            hint="Held back from fulfillment"
          />
          <StatTile
            label="Available to promise"
            value={qty(stock.available)}
            tone={stock.available === 0 ? "danger" : "success"}
            hint="On hand − reserved − damaged"
          />
          <StatTile label="Incoming" value={qty(stock.incoming)} tone="info" hint="On open purchase orders" />
          <StatTile label="In transit" value={qty(stock.inTransit)} tone="info" hint="Moving between sites" />
          <StatTile
            label="Stock value"
            value={showCost ? money(stock.value) : "—"}
            hint={showCost ? `at ${money(product.unitCost, { cents: true })} unit cost` : "Restricted"}
          />
          <StatTile
            label="Sites"
            value={stock.warehouseCount}
            hint={`${qty(totalCapacityUsed)} units across them`}
          />
        </div>
      </Section>

      <Section
        title="Distribution across sites"
        description="Share of this SKU's on-hand quantity by warehouse."
      >
        <ul className="grid gap-3">
          {rows
            .slice()
            .sort((a, b) => b.onHand - a.onHand)
            .map((r, i) => {
              const wh = warehouseById.get(r.warehouseId);
              const share = stock.onHand > 0 ? (r.onHand / stock.onHand) * 100 : 0;
              return (
                <li key={`${r.warehouseId}-${i}`} className="grid gap-1.5">
                  <div className="flex items-baseline justify-between gap-3 text-[13px]">
                    <span className="min-w-0 truncate font-medium">
                      {wh?.code} · <span className="text-muted-foreground">{wh?.name}</span>
                    </span>
                    <span className="shrink-0 tabular text-caption" data-numeric>
                      {qty(r.onHand)} ({share.toFixed(0)}%)
                    </span>
                  </div>
                  <MeterBar
                    value={share / 100}
                    tone="info"
                    size="sm"
                    label={`${wh?.code} holds ${share.toFixed(0)} percent of this SKU`}
                  />
                </li>
              );
            })}
        </ul>
      </Section>
    </div>
  );

  /* ------------------------------------------------------------- pricing -- */

  const margin = product.sellPrice > 0 ? (product.sellPrice - product.unitCost) / product.sellPrice : 0;

  // Price history is reconstructed from what this SKU was actually bought at.
  const priceHistory = recentPoLines
    .map((po) => {
      const line = po.lines.find((l) => l.productId === product.id)!;
      return { po, line };
    })
    .sort((a, b) => b.po.createdAt.localeCompare(a.po.createdAt));

  const pricing = (
    <div className="grid gap-4 lg:grid-cols-3">
      <Section title="Current pricing" className="lg:col-span-1">
        <div className="grid gap-3">
          <StatTile label="Unit cost" value={money(product.unitCost, { cents: true })} />
          <StatTile label="Selling price" value={money(product.sellPrice, { cents: true })} />
          <StatTile
            label="Gross margin"
            value={percent(margin, 1)}
            tone={margin < 0.2 ? "warning" : "success"}
            hint={`${money(product.sellPrice - product.unitCost, { cents: true })} per ${product.unit}`}
          />
          <StatTile
            label="Markup on cost"
            value={percent(product.unitCost > 0 ? (product.sellPrice - product.unitCost) / product.unitCost : 0, 1)}
          />
        </div>
      </Section>

      <Section
        title="Purchase price history"
        description="What this SKU has actually been bought at, from the order book."
        className="lg:col-span-2"
        contentClassName="p-0"
      >
        <SimpleTable
          rows={priceHistory}
          getRowId={({ po }) => po.id}
          columns={[
            {
              key: "po",
              header: "Order",
              cell: ({ po }) => (
                <Link href={`/purchasing/purchase-orders/${po.id}`} className="text-code hover:underline">
                  {po.number}
                </Link>
              ),
            },
            {
              key: "supplier",
              header: "Supplier",
              hideOnMobile: true,
              cell: ({ po }) => (
                <span className="truncate">{supplierById.get(po.supplierId)?.name}</span>
              ),
            },
            { key: "date", header: "Ordered", cell: ({ po }) => date(po.orderedAt ?? po.createdAt) },
            { key: "qty", header: "Quantity", align: "right", cell: ({ line }) => qty(line.quantity) },
            {
              key: "price",
              header: "Unit price",
              align: "right",
              cell: ({ line }) => money(line.unitPrice, { cents: true }),
            },
            {
              key: "vs",
              header: "vs standard",
              align: "right",
              hideOnMobile: true,
              cell: ({ line }) => {
                const delta = (line.unitPrice - product.unitCost) / product.unitCost;
                return (
                  <span className={delta > 0.02 ? "text-status-warning" : delta < -0.02 ? "text-status-success" : "text-muted-foreground"}>
                    {delta > 0 ? "+" : ""}
                    {(delta * 100).toFixed(1)}%
                  </span>
                );
              },
            },
          ]}
          empty={
            <EmptyState
              title="Never purchased"
              description="This SKU has no purchase order history yet, so there is no price trail to show."
              className="py-10"
            />
          }
        />
      </Section>
    </div>
  );

  /* ----------------------------------------------------------- suppliers -- */

  const suppliers = product.supplierIds
    .map((sid) => supplierById.get(sid))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  const suppliersTab = (
    <Section
      title="Supplier relationships"
      description="Who can supply this SKU, and how reliably they have done so."
      contentClassName="p-0"
    >
      <SimpleTable
        rows={suppliers}
        getRowId={(s) => s.id}
        columns={[
          {
            key: "name",
            header: "Supplier",
            cell: (s) => (
              <Link href={`/purchasing/suppliers/${s.id}`} className="grid gap-0.5 hover:underline">
                <span className="font-medium">{s.name}</span>
                <span className="text-code text-[11px] text-muted-foreground">{s.code}</span>
              </Link>
            ),
          },
          {
            key: "role",
            header: "Role",
            cell: (s) =>
              s.id === product.primarySupplierId ? (
                <StatusBadge label="Primary" tone="success" showDot={false} />
              ) : (
                <StatusBadge label="Alternate" tone="neutral" showDot={false} />
              ),
          },
          { key: "lead", header: "Lead time", align: "right", cell: (s) => `${s.leadTimeDays}d` },
          {
            key: "onTime",
            header: "On time",
            align: "right",
            cell: (s) => (
              <span className={s.onTimeRate < 0.85 ? "text-status-warning" : "text-status-success"}>
                {percent(s.onTimeRate, 1)}
              </span>
            ),
          },
          {
            key: "defect",
            header: "Defect rate",
            align: "right",
            hideOnMobile: true,
            cell: (s) => (
              <span className={s.defectRate > 0.03 ? "text-status-danger" : "text-muted-foreground"}>
                {percent(s.defectRate, 2)}
              </span>
            ),
          },
          { key: "terms", header: "Terms", hideOnMobile: true, cell: (s) => s.paymentTerms },
          { key: "status", header: "Status", cell: (s) => <StatusBadge status={s.status} /> },
        ]}
        empty={
          <EmptyState
            title="No supplier linked"
            description="Link a supplier so this product can be reordered automatically when it hits its reorder point."
            className="py-10"
          />
        }
      />
    </Section>
  );

  /* ------------------------------------------------------------- history -- */

  const timeline: TimelineEntry[] = movements.slice(0, 40).map((m) => ({
    id: m.id,
    ts: m.ts,
    tone: MOVEMENT_TONE[m.type],
    icon: MOVEMENT_ICON[m.type],
    title: (
      <span className="flex flex-wrap items-baseline gap-x-2">
        <span>{humanize(m.type)}</span>
        <span
          className={m.qtyChange > 0 ? "tabular font-semibold text-status-success" : "tabular font-semibold text-status-danger"}
          data-numeric
        >
          {signed(m.qtyChange)} {product.unit}
        </span>
        <span className="tabular text-caption font-normal text-muted-foreground" data-numeric>
          {qty(m.qtyBefore)} → {qty(m.qtyAfter)}
        </span>
      </span>
    ),
    detail: (
      <span className="flex flex-wrap items-center gap-x-2">
        <span className="text-code">{m.refNumber}</span>
        <span>·</span>
        <span>{warehouseById.get(m.warehouseId)?.code}</span>
        <span>·</span>
        <span>{locationById.get(m.locationId)?.code}</span>
        {showCost && (
          <>
            <span>·</span>
            <span>{signedMoney(m.valueChange)}</span>
          </>
        )}
        {m.reason && (
          <>
            <span>·</span>
            <span>{m.reason}</span>
          </>
        )}
      </span>
    ),
    actor: userById.get(m.userId)?.name,
  }));

  const history = (
    <Section
      title="Movement history"
      description={`Every recorded stock change for this SKU. ${qty(movements.length)} entries in the ledger.`}
      actions={
        can(role, "movements") && (
          <Button variant="outline" size="sm" className="h-7" render={<Link href={`/inventory/movements?q=${product.sku}`} />}>
            Open the full ledger
          </Button>
        )
      }
    >
      {timeline.length === 0 ? (
        <EmptyState
          title="No movements yet"
          description="Nothing has been received, shipped, transferred or adjusted for this SKU."
          className="py-10"
        />
      ) : (
        <Timeline entries={timeline} />
      )}
    </Section>
  );

  /* ----------------------------------------------------------- documents -- */

  const documents = (
    <Section title="Documents" description="Specification sheets, certificates and supplier paperwork.">
      <EmptyState
        icon={FileText}
        title="No documents attached"
        description="Attach a datasheet, safety certificate or supplier specification so the warehouse team can check it against a delivery."
        action={
          canEdit ? <UploadDialog recordLabel={product.sku} /> : undefined
        }
        className="py-12"
      />
    </Section>
  );

  return (
    <>
      <RecordHeader
        crumbs={[
          { label: "Inventory", href: "/inventory/products" },
          { label: "Products", href: "/inventory/products" },
          { label: product.sku },
        ]}
        backHref="/inventory/products"
        backLabel="Products"
        leading={<ProductThumb category={category?.name ?? ""} sku={product.sku} size="md" />}
        title={product.shortName}
        subtitle={`${product.brand} · ${category?.name} · supplied by ${primarySupplier?.name ?? "—"}`}
        badge={
          <span className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={product.status} size="md" />
            <StatusBadge status={stock.health} size="md" />
          </span>
        }
        meta={
          <>
            <span className="text-code text-caption text-muted-foreground">{product.sku}</span>
            <span className="text-caption text-muted-foreground">
              Updated {relative(product.updatedAt)}
            </span>
          </>
        }
        actions={
          <>
            {can(role, "adjustments", "create") && (
              <Button variant="outline" size="sm" className="h-8" render={<Link href="/inventory/adjustments/new" />}>
                <SlidersHorizontal className="size-3.5" aria-hidden />
                Adjust
              </Button>
            )}
            {can(role, "purchase-orders", "create") && (
              <Button variant="outline" size="sm" className="h-8" render={<Link href="/purchasing/purchase-orders/new" />}>
                <ShoppingCart className="size-3.5" aria-hidden />
                Reorder
              </Button>
            )}
            {canEdit && (
              <Button
                size="sm"
                className="h-8"
                render={<Link href={`/inventory/products/${product.sku}/edit`} />}
              >
                <Pencil className="size-3.5" aria-hidden />
                Edit
              </Button>
            )}
          </>
        }
      >
        <StatStrip>
          <StatTile label="On hand" value={qty(stock.onHand)} />
          <StatTile label="Available" value={qty(stock.available)} tone={stock.available === 0 ? "danger" : "success"} />
          <StatTile label="Reserved" value={qty(stock.reserved)} tone="purple" />
          <StatTile label="Incoming" value={qty(stock.incoming)} tone="info" />
          <StatTile label="Reorder at" value={qty(product.reorderPoint)} />
          <StatTile label="Stock value" value={showCost ? money(stock.value) : "—"} />
        </StatStrip>
      </RecordHeader>

      <DetailTabs
        tabs={[
          { id: "overview", label: "Overview", content: overview },
          { id: "inventory", label: "Inventory", content: inventory },
          { id: "pricing", label: "Pricing", content: pricing },
          { id: "suppliers", label: "Suppliers", count: suppliers.length, content: suppliersTab },
          { id: "history", label: "History", count: movements.length, content: history },
          { id: "documents", label: "Documents", count: 0, content: documents },
        ]}
      />
    </>
  );
}
