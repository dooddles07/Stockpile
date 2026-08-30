import type { Metadata } from "next";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { LocationForm } from "./location-form";
import { warehouses as allWarehouses } from "@/lib/repo/reference";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";

export const metadata: Metadata = {
  title: "New location",
  description: "Add an addressable place stock can sit inside a site.",
};

export default async function NewLocationPage() {
  const role = await getRole();
  if (!can(role, "locations", "create")) {
    return <PermissionDenied module="locations" role={role} action="create" />;
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
          { label: "New location" },
        ]}
        title="New location"
        description="A location is the zone → aisle → rack → bin address a picker reads off a label. It has to exist before stock can be put away there."
      />

      <div className="p-4 sm:p-6">
        <LocationForm warehouses={warehouses} />
      </div>
    </>
  );
}
