import type { Metadata } from "next";

import { ScanClient } from "./scan-client";
import { PermissionDenied } from "@/components/states";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";

export const metadata: Metadata = {
  title: "Scan",
  description: "Scan a barcode to look up a product and its stock.",
};

export default async function OperatorScanPage() {
  const role = await getRole();
  if (!can(role, "products")) return <PermissionDenied module="products" role={role} />;

  // The lookup itself is a client round trip to `/api/search` (see ScanClient),
  // so the server side is just the permission gate.
  return <ScanClient />;
}
