import type { Metadata } from "next";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { StatTile } from "@/components/record/field-grid";
import { LocationsTable, type LocationTableRow } from "./locations-table";
import { allStockRows } from "@/lib/repo/inventory";
import { indexById, locations as allLocations, warehouses as allWarehouses } from "@/lib/repo/reference";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { humanize } from "@/lib/status";
import { percent, qty } from "@/lib/format";

export const metadata: Metadata = {
  title: "Locations",
  description: "Every addressable storage location across all sites.",
};

export default async function LocationsPage() {
  const role = await getRole();
  if (!can(role, "locations")) return <PermissionDenied module="locations" role={role} />;

  const warehouseById = await indexById(allWarehouses);

  // How many distinct SKUs sit in each location, from the stock records.
  const skusByLocation = new Map<string, Set<string>>();
  for (const row of await allStockRows()) {
    const set = skusByLocation.get(row.locationId) ?? new Set<string>();
    set.add(row.productId);
    skusByLocation.set(row.locationId, set);
  }

  const rows: LocationTableRow[] = (await allLocations()).map((l) => {
    const warehouse = warehouseById.get(l.warehouseId);
    return {
      id: l.id,
      code: l.code,
      warehouseId: l.warehouseId,
      warehouseCode: warehouse?.code ?? "—",
      warehouseName: warehouse?.name ?? "—",
      zone: l.zone,
      aisle: l.aisle,
      rack: l.rack,
      bin: l.bin,
      type: l.type,
      typeLabel: humanize(l.type),
      capacityUnits: l.capacityUnits,
      occupiedUnits: l.occupiedUnits,
      fill: l.capacityUnits > 0 ? l.occupiedUnits / l.capacityUnits : 0,
      skuCount: skusByLocation.get(l.id)?.size ?? 0,
      restricted: l.restricted,
    };
  });

  const capacity = rows.reduce((s, r) => s + r.capacityUnits, 0);
  const occupied = rows.reduce((s, r) => s + r.occupiedUnits, 0);
  const nearFull = rows.filter((r) => r.fill > 0.9).length;
  const restricted = rows.filter((r) => r.restricted).length;
  const warehouses = [...new Set([...warehouseById.values()].map((w) => w.code))].sort();

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Warehousing", href: "/warehousing/warehouses" }, { label: "Locations" }]}
        title="Locations"
        description="Every addressable place stock can sit, as zone → aisle → rack → bin. A location code is what a picker reads off a label, so it is the identifier everything else hangs from."
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile label="Locations" value={qty(rows.length)} hint={`across ${warehouses.length} sites`} />
          <StatTile
            label="Occupancy"
            value={percent(occupied / capacity, 0)}
            hint={`${qty(occupied)} of ${qty(capacity)} units`}
          />
          <StatTile
            label="Near full"
            value={qty(nearFull)}
            tone={nearFull > 0 ? "warning" : "neutral"}
            hint="Over 90% occupied"
          />
          <StatTile
            label="Restricted"
            value={qty(restricted)}
            tone={restricted > 0 ? "purple" : "neutral"}
            hint="Need authorisation to pick from"
          />
        </div>
      </PageHeader>

      <div className="p-4 sm:p-6">
        <LocationsTable rows={rows} warehouses={warehouses} />
      </div>
    </>
  );
}
