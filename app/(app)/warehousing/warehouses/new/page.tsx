import type { Metadata } from "next";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { WarehouseForm } from "./warehouse-form";
import { db } from "@/lib/data/store";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";

export const metadata: Metadata = {
  title: "New site",
  description: "Add a warehouse so stock can be held and moved through it.",
};

export default async function NewWarehousePage() {
  const role = await getRole();
  if (!can(role, "warehouses", "create")) {
    return <PermissionDenied module="warehouses" role={role} action="create" />;
  }

  const managers = db.users
    .filter((u) => u.status === "active" && ["inventory-manager", "super-admin"].includes(u.role))
    .map((u) => ({ id: u.id, name: u.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Site codes carry the type: DC-03 after DC-02. A new site defaults to a
  // distribution centre, and the operator can change both together.
  const next =
    db.warehouses.filter((w) => w.code.startsWith("DC-")).length + 1;

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Warehousing", href: "/warehousing/warehouses" },
          { label: "Warehouses", href: "/warehousing/warehouses" },
          { label: "New site" },
        ]}
        title="New site"
        description="A new site starts empty. Add its zones, aisles and bins on the locations page before the first receipt is booked in, or stock lands with nowhere to go."
      />

      <div className="p-4 sm:p-6">
        <WarehouseForm managers={managers} suggestedCode={`DC-${String(next).padStart(2, "0")}`} />
      </div>
    </>
  );
}
