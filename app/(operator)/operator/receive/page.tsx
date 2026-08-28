import type { Metadata } from "next";

import { ReceiveClient, type Receipt } from "./receive-client";
import { PermissionDenied } from "@/components/states";
import { db } from "@/lib/data/store";
import { productById, supplierById, warehouseById } from "@/lib/repo/inventory";
import { getCurrentUser, getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { NOW } from "@/lib/data/rng";

export const metadata: Metadata = {
  title: "Receive",
  description: "Book in deliveries arriving at this site.",
};

export default async function OperatorReceivePage() {
  const [role, user] = await Promise.all([getRole(), getCurrentUser()]);
  if (!can(role, "receiving", "create")) {
    return <PermissionDenied module="receiving" role={role} action="book in stock for" />;
  }

  const site = warehouseById.get(user.warehouseId ?? "") ?? db.warehouses[0];
  const now = NOW.getTime();

  const fromSuppliers: Receipt[] = db.purchaseOrders
    .filter((p) => ["ordered", "partially-received"].includes(p.status) && p.warehouseId === site.id)
    .map((p) => ({
      id: p.id,
      number: p.number,
      kind: "purchase" as const,
      source: supplierById.get(p.supplierId)?.name ?? "—",
      status: p.status,
      expectedAt: p.expectedAt,
      overdue: new Date(p.expectedAt).getTime() < now,
      lines: p.lines
        .filter((l) => l.quantity - l.fulfilled > 0)
        .map((l) => ({
          id: l.id,
          sku: l.sku,
          name: l.name,
          outstanding: l.quantity - l.fulfilled,
        })),
    }));

  const fromSites: Receipt[] = db.transfers
    .filter(
      (t) => ["in-transit", "partially-received"].includes(t.status) && t.toWarehouseId === site.id,
    )
    .map((t) => ({
      id: t.id,
      number: t.number,
      kind: "transfer" as const,
      source: `From ${warehouseById.get(t.fromWarehouseId)?.code ?? "—"}`,
      status: t.status,
      expectedAt: t.expectedAt,
      overdue: new Date(t.expectedAt).getTime() < now,
      lines: t.lines
        .filter((l) => l.shipped - l.received > 0)
        .map((l) => ({
          id: l.id,
          sku: productById.get(l.productId)?.sku ?? "—",
          name: productById.get(l.productId)?.name ?? "—",
          outstanding: l.shipped - l.received,
        })),
    }));

  // Overdue first, then soonest — the handheld should open on the job that is
  // already late, not on whatever happens to sort first alphabetically.
  const receipts = [...fromSuppliers, ...fromSites]
    .filter((r) => r.lines.length > 0)
    .sort((a, b) => a.expectedAt.localeCompare(b.expectedAt));

  return <ReceiveClient receipts={receipts} siteCode={site.code} />;
}
