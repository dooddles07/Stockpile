import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { WarehouseForm } from "../../new/warehouse-form";
import { users as allUsers, warehouses as allWarehouses } from "@/lib/repo/reference";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const site = (await allWarehouses()).find((w) => w.id === id);
  return site
    ? { title: `Edit ${site.code}`, description: `Change the site record for ${site.name}.` }
    : { title: "Site not found" };
}

export default async function EditWarehousePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const role = await getRole();
  const site = (await allWarehouses()).find((w) => w.id === id);
  if (!site) notFound();
  if (!can(role, "warehouses", "edit")) {
    return <PermissionDenied module="warehouses" role={role} action="edit" />;
  }

  const managers = (await allUsers())
    .filter(
      (u) =>
        (u.status === "active" && ["inventory-manager", "super-admin"].includes(u.role)) ||
        u.id === site.managerId,
    )
    .map((u) => ({ id: u.id, name: u.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Warehousing", href: "/warehousing/warehouses" },
          { label: "Warehouses", href: "/warehousing/warehouses" },
          { label: site.code, href: `/warehousing/warehouses/${site.id}` },
          { label: "Edit" },
        ]}
        title={`Edit ${site.name}`}
        description="Closing a site does not move its stock. Transfer it out first, or the balance stays counted at an address nobody is working."
      />

      <div className="p-4 sm:p-6">
        <WarehouseForm
          managers={managers}
          suggestedCode={site.code}
          usedPallets={site.usedPallets}
          returnTo={`/warehousing/warehouses/${site.id}`}
          initial={{
            code: site.code,
            name: site.name,
            type: site.type,
            status: site.status,
            addressLine: site.addressLine,
            city: site.city,
            region: site.region,
            country: site.country,
            managerId: site.managerId,
            capacityPallets: site.capacityPallets,
            timezone: site.timezone,
          }}
        />
      </div>
    </>
  );
}
