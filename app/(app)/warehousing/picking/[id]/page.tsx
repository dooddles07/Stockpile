import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ClipboardList, MapPin, TriangleAlert } from "lucide-react";

import { RecordHeader } from "@/components/record/record-header";
import { Section, StatTile } from "@/components/record/field-grid";
import { SimpleTable } from "@/components/record/simple-table";
import { StatusBadge } from "@/components/status/status-badge";
import { EmptyState, PermissionDenied } from "@/components/states";
import { Button } from "@/components/ui/button";
import { salesOrders as allSalesOrders } from "@/lib/repo/documents";
import { allStockRows } from "@/lib/repo/inventory";
import {
  customers as allCustomers,
  indexById,
  locations as allLocations,
  products as allProducts,
  warehouses as allWarehouses,
} from "@/lib/repo/reference";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { date, dueLabel, plural, qty } from "@/lib/format";
import { NOW } from "@/lib/data/rng";
import { cn } from "@/lib/utils";
import type { StockLocation, StockRow } from "@/lib/types";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const order = (await allSalesOrders()).find((o) => o.id === id);
  return order
    ? { title: `Pick list ${order.number}`, description: `Walk sheet for ${order.number}.` }
    : { title: "Pick list not found" };
}

interface PickLine {
  seq: number;
  location: StockLocation;
  sku: string;
  name: string;
  lotNumber: string | null;
  expiresAt: string | null;
  pick: number;
  restricted: boolean;
}

/**
 * Walk order. A picker moves down an aisle and along a rack, so sequencing by
 * zone → aisle → rack → bin is the difference between one lap of the building
 * and four.
 */
function walkOrder(a: StockLocation, b: StockLocation) {
  return (
    a.zone.localeCompare(b.zone) ||
    a.aisle.localeCompare(b.aisle) ||
    a.rack.localeCompare(b.rack) ||
    a.bin.localeCompare(b.bin)
  );
}

export default async function PickListPage({ params }: { params: Promise<{ id: string }> }) {
  const role = await getRole();
  if (!can(role, "fulfillment")) return <PermissionDenied module="fulfillment" role={role} />;

  const { id } = await params;
  const order = (await allSalesOrders()).find((o) => o.id === id);
  if (!order) notFound();

  const customerById = await indexById(allCustomers);
  const warehouseById = await indexById(allWarehouses);
  const productById = await indexById(allProducts);
  const locationById = await indexById(allLocations);
  const stockRows = await allStockRows();

  const customer = customerById.get(order.customerId);
  const warehouse = warehouseById.get(order.warehouseId);
  const pickable = ["reserved", "picking"].includes(order.status);

  // Allocate first, sequence second. Which lot to take is a stock decision
  // (earliest expiry, so nothing dies on the shelf); which order to walk them
  // in is a warehouse decision. Doing both in one sort gets both wrong.
  const shortages: { sku: string; name: string; short: number }[] = [];
  const allocations: PickLine[] = [];

  for (const line of order.lines) {
    const outstanding = line.quantity - line.fulfilled;
    if (outstanding <= 0) continue;

    const product = productById.get(line.productId);
    const bins = stockRows
      .filter((s) => s.productId === line.productId && s.warehouseId === order.warehouseId)
      .map((s) => ({ row: s, location: locationById.get(s.locationId) }))
      .filter(
        (b): b is { row: StockRow; location: StockLocation } =>
          Boolean(b.location) && b.row.onHand - b.row.damaged > 0,
      )
      .sort((a, b) => {
        // FEFO: a dated lot always goes before an undated one.
        if (a.row.expiresAt && b.row.expiresAt) {
          const byExpiry = a.row.expiresAt.localeCompare(b.row.expiresAt);
          if (byExpiry !== 0) return byExpiry;
        } else if (a.row.expiresAt !== b.row.expiresAt) {
          return a.row.expiresAt ? -1 : 1;
        }
        return walkOrder(a.location, b.location);
      });

    let remaining = outstanding;
    for (const bin of bins) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, bin.row.onHand - bin.row.damaged);
      remaining -= take;
      allocations.push({
        seq: 0,
        location: bin.location,
        sku: line.sku,
        name: product?.shortName ?? line.name,
        lotNumber: bin.row.lotNumber,
        expiresAt: bin.row.expiresAt,
        pick: take,
        restricted: bin.location.restricted,
      });
    }

    if (remaining > 0) {
      shortages.push({ sku: line.sku, name: product?.name ?? line.name, short: remaining });
    }
  }

  const lines = allocations
    .sort((a, b) => walkOrder(a.location, b.location) || a.sku.localeCompare(b.sku))
    .map((l, i) => ({ ...l, seq: i + 1 }));

  const units = lines.reduce((s, l) => s + l.pick, 0);
  const zones = [...new Set(lines.map((l) => l.location.zone))];
  const restricted = lines.filter((l) => l.restricted);
  const late = new Date(order.promisedAt).getTime() < NOW.getTime();

  const columns = [
    {
      key: "seq",
      header: "#",
      width: "3rem",
      align: "right" as const,
      cell: (l: PickLine) => <span className="tabular text-muted-foreground">{l.seq}</span>,
    },
    {
      key: "location",
      header: "Location",
      cell: (l: PickLine) => (
        <span className="grid gap-0.5">
          <span className="text-code font-medium">{l.location.code}</span>
          <span className="text-[11px] text-muted-foreground">
            Zone {l.location.zone} · Aisle {l.location.aisle} · Rack {l.location.rack}
          </span>
        </span>
      ),
    },
    {
      key: "product",
      header: "Product",
      cell: (l: PickLine) => (
        <span className="grid min-w-0 gap-0.5">
          <span className="truncate font-medium">{l.name}</span>
          <span className="text-code text-[11px] text-muted-foreground">{l.sku}</span>
        </span>
      ),
    },
    {
      key: "lot",
      header: "Lot / expiry",
      hideOnMobile: true,
      cell: (l: PickLine) =>
        l.lotNumber ? (
          <span className="grid gap-0.5">
            <span className="text-code">{l.lotNumber}</span>
            {l.expiresAt && (
              <span className="text-[11px] text-muted-foreground">{dueLabel(l.expiresAt)}</span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "pick",
      header: "Pick",
      align: "right" as const,
      width: "5rem",
      cell: (l: PickLine) => <span className="tabular font-semibold">{qty(l.pick)}</span>,
    },
    {
      key: "confirm",
      header: "Picked",
      align: "center" as const,
      width: "5rem",
      cell: () => (
        <span
          className="mx-auto block size-4 rounded-[3px] border border-border"
          aria-label="Tick when picked"
        />
      ),
    },
  ];

  return (
    <>
      <RecordHeader
        crumbs={[
          { label: "Warehousing", href: "/warehousing/warehouses" },
          { label: "Picking", href: "/warehousing/picking" },
          { label: order.number },
        ]}
        backHref="/warehousing/picking"
        backLabel="Picking queue"
        title={`Pick list ${order.number}`}
        subtitle={`${customer?.name ?? "—"} · ${warehouse?.code} ${warehouse?.name}`}
        badge={<StatusBadge status={order.status} />}
        meta={
          <span className={cn(late && "text-status-danger")}>
            Promised {date(order.promisedAt)} · {dueLabel(order.promisedAt)}
          </span>
        }
        actions={
          <Button size="sm" className="h-8" render={<Link href={`/sales/orders/${order.id}`} />}>
            Open order
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile label="Pick lines" value={qty(lines.length)} hint={plural(order.lines.length, "order line")} />
          <StatTile label="Units" value={qty(units)} />
          <StatTile
            label="Zones"
            value={qty(zones.length)}
            hint={zones.length > 0 ? zones.join(" · ") : undefined}
          />
          <StatTile
            label="Short"
            value={qty(shortages.reduce((s, x) => s + x.short, 0))}
            tone={shortages.length > 0 ? "danger" : "neutral"}
            hint={shortages.length > 0 ? plural(shortages.length, "line") : "Fully coverable"}
          />
        </div>
      </RecordHeader>

      <div className="grid gap-4 p-4 sm:p-6">
        {!pickable && (
          <div className="flex items-start gap-2.5 rounded-md border border-status-warning-border bg-status-warning-bg px-3 py-2.5 text-[13px] text-status-warning">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              This order is <strong>{order.status}</strong>, not waiting to be picked. The sheet
              below reflects what is still outstanding, but stock is not reserved against it — check
              the order before walking it.
            </p>
          </div>
        )}

        {shortages.length > 0 && (
          <div className="rounded-md border border-status-danger-border bg-status-danger-bg px-3 py-2.5 text-[13px] text-status-danger">
            <p className="flex items-center gap-2 font-medium">
              <TriangleAlert className="size-4 shrink-0" aria-hidden />
              {plural(shortages.length, "line")} cannot be picked in full at {warehouse?.code}
            </p>
            <ul className="mt-1.5 grid gap-0.5 pl-6">
              {shortages.map((s) => (
                <li key={s.sku}>
                  <span className="text-code">{s.sku}</span> — {s.name}: short {qty(s.short)}
                </li>
              ))}
            </ul>
            <p className="mt-1.5 pl-6 text-caption">
              Pick what is on the shelf and short-ship the rest, or raise a transfer from another
              site.
            </p>
          </div>
        )}

        {restricted.length > 0 && (
          <div className="flex items-start gap-2.5 rounded-md border border-status-purple-border bg-status-purple-bg px-3 py-2.5 text-[13px] text-status-purple">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              {plural(restricted.length, "line")} sits in a restricted location (
              {[...new Set(restricted.map((l) => l.location.code))].join(", ")}). A supervisor has to
              release those units.
            </p>
          </div>
        )}

        <Section
          title="Walk sequence"
          description="Ordered by zone, aisle, rack and bin — top to bottom is the route. Lots are chosen earliest-expiry-first, so what leaves the shelf is what would have expired next."
          contentClassName="p-0"
        >
          <SimpleTable
            columns={columns}
            rows={lines}
            getRowId={(l) => `${l.location.id}-${l.sku}-${l.lotNumber ?? "na"}`}
            empty={
              <EmptyState
                icon={ClipboardList}
                title="Nothing left to pick"
                description={
                  order.lines.length === 0
                    ? "This order has no lines."
                    : "Every line on this order has already been fulfilled."
                }
                action={
                  <Button size="sm" render={<Link href={`/sales/orders/${order.id}`} />}>
                    Open order
                  </Button>
                }
              />
            }
          />
        </Section>
      </div>
    </>
  );
}
