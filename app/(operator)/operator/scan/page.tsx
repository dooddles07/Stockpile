import type { Metadata } from "next";

import { LookupClient } from "../lookup-client";
import { operatorCatalogue } from "../page";
import { PermissionDenied } from "@/components/states";
import { warehouses as allWarehouses } from "@/lib/repo/reference";
import { getCurrentUser, getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";

export const metadata: Metadata = {
  title: "Scan",
  description: "Scan a barcode to see stock and bin locations.",
};

export default async function OperatorScanPage() {
  const [role, user] = await Promise.all([getRole(), getCurrentUser()]);
  if (!can(role, "products")) return <PermissionDenied module="products" role={role} />;

  const warehouses = await allWarehouses();
  const site = warehouses.find((w) => w.id === user.warehouseId) ?? warehouses[0];

  // Same screen, different intent: the field is focused and numeric, and a
  // scanner's trailing Enter resolves straight to the product.
  return (
    <LookupClient
      products={await operatorCatalogue(site.id)}
      siteCode={site.code}
      autoFocus
      scanMode
    />
  );
}
