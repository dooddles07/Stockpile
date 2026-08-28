import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeftRight, MapPin, PackageCheck, Pencil } from "lucide-react";

import { RecordHeader, StatStrip } from "@/components/record/record-header";
import { DetailTabs } from "@/components/record/detail-tabs";
import { FieldGrid, Section, StatTile } from "@/components/record/field-grid";
import { SimpleTable } from "@/components/record/simple-table";
import { StatusBadge } from "@/components/status/status-badge";
import { EmptyState, PermissionDenied } from "@/components/states";
import { Button } from "@/components/ui/button";
import { MeterBar, capacityTone } from "@/components/status/meter-bar";
import { db } from "@/lib/data/store";
import {
  locationById,
  productById,
  stockLevelRows,
  userById,
  warehouseRollups,
} from "@/lib/repo/inventory";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { date, dateTime, dueLabel, money, percent, plural, qty, relative, signed } from "@/lib/format";
import { humanize } from "@/lib/status";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const site = db.warehouses.find((w) => w.id === id);
  return site
    ? { title: site.name, description: `${site.code} — capacity, stock and activity.` }
    : { title: "Warehouse not found" };
}

const TYPE_LABEL: Record<string, string> = {
  distribution: "Distribution centre",
  fulfillment: "Fulfillment centre",
  retail: "Retail depot",
  cold: "Cold storage",
};

export default async function WarehouseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const role = await getRole();
  if (!can(role, "warehouses")) return <PermissionDenied module="warehouses" role={role} />;

  const { id } = await params;
  const rollup = warehouseRollups().find((w) => w.id === id);
  if (!rollup) notFound();

  const showValue = can(role, "valuation") || can(role, "warehouses", "export");
  const locations = db.locations.filter((l) => l.warehouseId === rollup.id);
  const stock = stockLevelRows().filter((r) => r.warehouseId === rollup.id);
  const movements = db.movements.filter((m) => m.warehouseId === rollup.id).slice(0, 25);

  const transfers = db.transfers
    .filter((t) => t.fromWarehouseId === rollup.id || t.toWarehouseId === rollup.id)
    .filter((t) => !["received", "cancelled"].includes(t.status))
    .sort((a, b) => a.expectedAt.localeCompare(b.expectedAt));

  const incomingPos = db.purchaseOrders
    .filter((p) => p.warehouseId === rollup.id && ["ordered", "partially-received"].includes(p.status))
    .sort((a, b) => a.expectedAt.localeCompare(b.expectedAt));

  // Zones are how a floor is actually navigated, so roll capacity up that way.
  const zones = [...new Set(locations.map((l) => l.zone))].sort().map((zone) => {
    const inZone = locations.filter((l) => l.zone === zone);
    const capacity = inZone.reduce((s, l) => s + l.capacityUnits, 0);
    const occupied = inZone.reduce((s, l) => s + l.occupiedUnits, 0);
    return {
      zone,
      locations: inZone,
      capacity,
      occupied,
      utilisation: capacity > 0 ? occupied / capacity : 0,
      aisles: [...new Set(inZone.map((l) => l.aisle))].sort(),
    };
  });

  const topStock = [...stock].sort((a, b) => b.value - a.value).slice(0, 12);

  /* ------------------------------------------------------------ overview -- */

  const overview = (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="grid content-start gap-4 lg:col-span-2">
        <Section title="Site details">
          <FieldGrid
            fields={[
              { label: "Code", value: rollup.code, mono: true },
              { label: "Type", value: TYPE_LABEL[rollup.type] },
              { label: "Status", value: <StatusBadge status={rollup.status} /> },
              { label: "Manager", value: rollup.managerName },
              { label: "Opened", value: date(rollup.openedAt) },
              { label: "Timezone", value: rollup.timezone, mono: true },
              { label: "Address", value: `${rollup.addressLine}, ${rollup.city}, ${rollup.region}, ${rollup.country}`, span: 3 },
            ]}
          />
          {rollup.status === "maintenance" && (
            <div className="mt-4 rounded-md border border-status-warning-border bg-status-warning-bg p-3">
              <p className="text-[13px] font-medium text-status-warning">Site is under maintenance</p>
              <p className="mt-1 text-caption leading-relaxed text-status-warning/90">
                Receiving and despatch are restricted. Existing stock is still counted in valuation
                and can be transferred out, but new inbound deliveries should be redirected.
              </p>
            </div>
          )}
        </Section>

        <Section
          title="Highest value stock held here"
          description="Where this site's capital is concentrated."
          actions={
            can(role, "stock") && (
              <Button
                variant="outline"
                size="sm"
                className="h-7"
                render={<Link href={`/inventory/stock-levels?q=${rollup.code}`} />}
              >
                All stock at this site
              </Button>
            )
          }
          contentClassName="p-0"
        >
          <SimpleTable
            rows={topStock}
            getRowId={(r) => r.id}
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
                key: "location",
                header: "Location",
                hideOnMobile: true,
                cell: (r) => <span className="text-code text-muted-foreground">{r.locationCode}</span>,
              },
              { key: "onHand", header: "On hand", align: "right", cell: (r) => qty(r.onHand) },
              {
                key: "available",
                header: "Available",
                align: "right",
                cell: (r) => <span className="font-medium">{qty(r.available)}</span>,
              },
              { key: "health", header: "Health", cell: (r) => <StatusBadge status={r.health} /> },
              ...(showValue
                ? [
                    {
                      key: "value",
                      header: "Value",
                      align: "right" as const,
                      cell: (r: (typeof topStock)[number]) => money(r.value),
                    },
                  ]
                : []),
            ]}
            empty={
              <EmptyState
                title="No stock at this site"
                description="Nothing is currently held here. Transfer stock in or receive a purchase order against it."
                className="py-10"
              />
            }
          />
        </Section>
      </div>

      <div className="grid content-start gap-4">
        <Section title="Capacity" description="Pallet positions, the constraint that actually binds.">
          <div className="grid gap-4">
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-caption text-muted-foreground">Utilisation</span>
                <span className="tabular text-[15px] font-bold" data-numeric>
                  {percent(rollup.utilization, 0)}
                </span>
              </div>
              <MeterBar
                value={rollup.utilization}
                tone={capacityTone(rollup.utilization)}
                className="mt-2"
                label={`${rollup.code} is at ${percent(rollup.utilization, 0)} of its pallet capacity`}
              />
              <p className="mt-1.5 text-caption text-muted-foreground">
                {qty(rollup.usedPallets)} of {qty(rollup.capacityPallets)} positions ·{" "}
                {qty(rollup.capacityPallets - rollup.usedPallets)} free
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <StatTile label="SKUs" value={qty(rollup.skuCount)} />
              <StatTile label="Units" value={qty(rollup.unitCount)} />
            </div>
          </div>
        </Section>

        {transfers.length > 0 && (
          <Section title="Open transfers" description="Stock moving in or out of this site.">
            <ul className="grid gap-2">
              {transfers.slice(0, 6).map((t) => {
                const inbound = t.toWarehouseId === rollup.id;
                return (
                  <li key={t.id}>
                    <Link
                      href={`/warehousing/transfers/${t.id}`}
                      className="flex items-start justify-between gap-3 rounded-md border p-2.5 transition-colors hover:bg-surface-hover"
                    >
                      <span className="grid min-w-0 gap-0.5">
                        <span className="flex items-center gap-1.5">
                          <ArrowLeftRight
                            className={
                              inbound ? "size-3 text-status-success" : "size-3 text-status-info"
                            }
                            aria-hidden
                          />
                          <span className="text-code font-medium">{t.number}</span>
                        </span>
                        <span className="text-caption text-muted-foreground">
                          {inbound ? "Inbound" : "Outbound"} · {plural(t.lines.length, "line")}
                        </span>
                      </span>
                      <span className="grid shrink-0 justify-items-end gap-1">
                        <StatusBadge status={t.status} />
                        <span className="text-caption text-muted-foreground">
                          {dueLabel(t.expectedAt)}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}

        {incomingPos.length > 0 && can(role, "receiving") && (
          <Section title="Awaiting receipt" description="Purchase orders due in at this site.">
            <ul className="grid gap-2">
              {incomingPos.slice(0, 6).map((po) => (
                <li key={po.id}>
                  <Link
                    href={`/purchasing/purchase-orders/${po.id}`}
                    className="flex items-start justify-between gap-3 rounded-md border p-2.5 transition-colors hover:bg-surface-hover"
                  >
                    <span className="grid min-w-0 gap-0.5">
                      <span className="flex items-center gap-1.5">
                        <PackageCheck className="size-3 text-muted-foreground" aria-hidden />
                        <span className="text-code font-medium">{po.number}</span>
                      </span>
                      <span className="truncate text-caption text-muted-foreground">
                        {db.suppliers.find((s) => s.id === po.supplierId)?.name}
                      </span>
                    </span>
                    <span className="grid shrink-0 justify-items-end gap-1">
                      <StatusBadge status={po.status} />
                      <span className="text-caption text-muted-foreground">
                        {dueLabel(po.expectedAt)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );

  /* ----------------------------------------------------------- locations -- */

  const locationsTab = (
    <div className="grid gap-4">
      {zones.map((zone) => (
        <Section
          key={zone.zone}
          title={`Zone ${zone.zone}`}
          description={`${zone.aisles.length} aisles · ${zone.locations.length} locations · ${percent(zone.utilisation, 0)} occupied`}
          actions={
            <span className="tabular text-caption text-muted-foreground" data-numeric>
              {qty(zone.occupied)} / {qty(zone.capacity)} units
            </span>
          }
          contentClassName="p-0"
        >
          <SimpleTable
            rows={zone.locations}
            getRowId={(l) => l.id}
            columns={[
              {
                key: "code",
                header: "Location",
                cell: (l) => <span className="text-code font-medium">{l.code}</span>,
              },
              { key: "aisle", header: "Aisle", hideOnMobile: true, cell: (l) => l.aisle },
              { key: "rack", header: "Rack", hideOnMobile: true, cell: (l) => l.rack },
              { key: "bin", header: "Bin", hideOnMobile: true, cell: (l) => l.bin },
              { key: "type", header: "Type", cell: (l) => humanize(l.type) },
              {
                key: "occupancy",
                header: "Occupied",
                align: "right",
                cell: (l) => `${qty(l.occupiedUnits)} / ${qty(l.capacityUnits)}`,
              },
              {
                key: "fill",
                header: "Fill",
                align: "right",
                cell: (l) => {
                  const fill = l.capacityUnits > 0 ? l.occupiedUnits / l.capacityUnits : 0;
                  return (
                    <span
                      className={
                        fill > 0.95
                          ? "font-semibold text-status-danger"
                          : fill > 0.85
                            ? "font-semibold text-status-warning"
                            : ""
                      }
                    >
                      {percent(fill, 0)}
                    </span>
                  );
                },
              },
              {
                key: "restricted",
                header: "Access",
                cell: (l) =>
                  l.restricted ? (
                    <StatusBadge label="Restricted" tone="purple" />
                  ) : (
                    <span className="text-muted-foreground">Open</span>
                  ),
              },
            ]}
          />
        </Section>
      ))}
    </div>
  );

  /* ------------------------------------------------------------ activity -- */

  const activity = (
    <Section
      title="Recent movements at this site"
      description="The last 25 stock changes recorded here."
      actions={
        can(role, "movements") && (
          <Button
            variant="outline"
            size="sm"
            className="h-7"
            render={<Link href={`/inventory/movements?q=${rollup.code}`} />}
          >
            Open the ledger
          </Button>
        )
      }
      contentClassName="p-0"
    >
      <SimpleTable
        rows={movements}
        getRowId={(m) => m.id}
        columns={[
          {
            key: "ts",
            header: "When",
            cell: (m) => (
              <span className="text-code whitespace-nowrap text-muted-foreground">
                {dateTime(m.ts)}
              </span>
            ),
          },
          { key: "type", header: "Movement", cell: (m) => humanize(m.type) },
          {
            key: "sku",
            header: "Product",
            cell: (m) => (
              <Link href={`/inventory/products/${m.sku}`} className="grid gap-0.5 hover:underline">
                <span className="text-code font-medium">{m.sku}</span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {productById.get(m.productId)?.shortName}
                </span>
              </Link>
            ),
          },
          {
            key: "location",
            header: "Location",
            hideOnMobile: true,
            cell: (m) => (
              <span className="text-code text-muted-foreground">
                {locationById.get(m.locationId)?.code ?? "—"}
              </span>
            ),
          },
          {
            key: "change",
            header: "Change",
            align: "right",
            cell: (m) => (
              <span
                className={
                  m.qtyChange > 0
                    ? "font-semibold text-status-success"
                    : "font-semibold text-status-danger"
                }
              >
                {signed(m.qtyChange)}
              </span>
            ),
          },
          {
            key: "ref",
            header: "Reference",
            hideOnMobile: true,
            cell: (m) => <span className="text-code text-muted-foreground">{m.refNumber}</span>,
          },
          {
            key: "user",
            header: "User",
            hideOnMobile: true,
            cell: (m) => userById.get(m.userId)?.name ?? "—",
          },
        ]}
        empty={
          <EmptyState
            title="No movements recorded"
            description="Nothing has been received, shipped or adjusted at this site yet."
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
          { label: "Warehousing", href: "/warehousing/warehouses" },
          { label: "Warehouses", href: "/warehousing/warehouses" },
          { label: rollup.code },
        ]}
        backHref="/warehousing/warehouses"
        backLabel="Warehouses"
        title={rollup.name}
        subtitle={`${TYPE_LABEL[rollup.type]} managed by ${rollup.managerName}`}
        badge={<StatusBadge status={rollup.status} size="md" />}
        meta={
          <>
            <span className="text-code text-caption text-muted-foreground">{rollup.code}</span>
            <span className="flex items-center gap-1.5 text-caption text-muted-foreground">
              <MapPin className="size-3" aria-hidden />
              {rollup.city}, {rollup.region}
            </span>
            <span className="text-caption text-muted-foreground">
              Opened {relative(rollup.openedAt)}
            </span>
          </>
        }
        actions={
          <>
            {can(role, "transfers", "create") && (
              <Button variant="outline" size="sm" className="h-8" render={<Link href="/warehousing/transfers/new" />}>
                <ArrowLeftRight className="size-3.5" aria-hidden />
                New transfer
              </Button>
            )}
            {can(role, "warehouses", "edit") && (
              <Button size="sm" className="h-8" render={<Link href={`/warehousing/warehouses/${rollup.id}/edit`} />}>
                <Pencil className="size-3.5" aria-hidden />
                Edit site
              </Button>
            )}
          </>
        }
      >
        <StatStrip>
          <StatTile label="Utilisation" value={percent(rollup.utilization, 0)} tone={rollup.utilization > 0.9 ? "danger" : rollup.utilization > 0.8 ? "warning" : "success"} />
          <StatTile label="SKUs" value={qty(rollup.skuCount)} />
          <StatTile label="Units" value={qty(rollup.unitCount)} />
          <StatTile label="Locations" value={qty(rollup.locationCount)} />
          <StatTile label="Open transfers" value={qty(rollup.openTransfers)} tone={rollup.openTransfers > 0 ? "info" : "neutral"} />
          <StatTile label="Value" value={showValue ? money(rollup.inventoryValue) : "—"} />
        </StatStrip>
      </RecordHeader>

      <DetailTabs
        tabs={[
          { id: "overview", label: "Overview", content: overview },
          { id: "locations", label: "Locations", count: locations.length, content: locationsTab },
          { id: "activity", label: "Activity", content: activity },
        ]}
      />
    </>
  );
}
