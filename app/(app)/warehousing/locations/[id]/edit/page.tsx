import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { LocationForm } from "../../new/location-form";
import { locations as allLocations, warehouses as allWarehouses } from "@/lib/repo/reference";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const location = (await allLocations()).find((l) => l.id === id);
  return location
    ? { title: `Edit ${location.code}`, description: `Change the record for location ${location.code}.` }
    : { title: "Location not found" };
}

export default async function EditLocationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const role = await getRole();
  const location = (await allLocations()).find((l) => l.id === id);
  if (!location) notFound();
  if (!can(role, "locations", "edit")) {
    return <PermissionDenied module="locations" role={role} action="edit" />;
  }

  const warehouses = (await allWarehouses())
    .map((w) => ({ id: w.id, name: `${w.code} — ${w.name}` }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Warehousing", href: "/warehousing/warehouses" },
          { label: "Locations", href: "/warehousing/locations" },
          { label: location.code, href: "/warehousing/locations" },
          { label: "Edit" },
        ]}
        title={`Edit ${location.code}`}
        description="Moving a location to another site does not move the stock counted in it. Transfer stock out first."
      />

      <div className="p-4 sm:p-6">
        <LocationForm
          warehouses={warehouses}
          id={location.id}
          returnTo="/warehousing/locations"
          initial={{
            warehouseId: location.warehouseId,
            zone: location.zone,
            aisle: location.aisle,
            rack: location.rack,
            bin: location.bin,
            type: location.type,
            capacityUnits: location.capacityUnits,
            restricted: location.restricted,
          }}
        />
      </div>
    </>
  );
}
