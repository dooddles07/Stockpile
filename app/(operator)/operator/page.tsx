import type { Metadata } from "next";

import { LookupClient, type OperatorProduct } from "./lookup-client";
import { PermissionDenied } from "@/components/states";
import { db } from "@/lib/data/store";
import { locationById, summaryFor, warehouseById } from "@/lib/repo/inventory";
import { getCurrentUser, getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";

export const metadata: Metadata = {
  title: "Look up",
  description: "Find a product and see where it is on the floor.",
};

/**
 * Everything the handheld needs about every product, shaped once on the server.
 *
 * A search-as-you-type screen that round-trips per keystroke is useless on a
 * warehouse Wi-Fi dead spot, so the whole catalogue ships with the page and the
 * filtering happens in the browser.
 */
export function operatorCatalogue(siteId: string): OperatorProduct[] {
  return db.products
    .filter((p) => p.status === "active")
    .map((product) => {
      const rows = db.stockRows.filter((s) => s.productId === product.id);
      const here = rows.filter((s) => s.warehouseId === siteId);
      const summary = summaryFor(product.id);

      const bins = here
        .filter((s) => s.onHand > 0)
        .map((s) => {
          const location = locationById.get(s.locationId);
          return {
            code: location?.code ?? "—",
            zone: location?.zone ?? "—",
            onHand: s.onHand,
            lotNumber: s.lotNumber,
          };
        })
        .sort((a, b) => a.code.localeCompare(b.code));

      const otherSites = [...new Set(rows.map((s) => s.warehouseId))]
        .filter((id) => id !== siteId)
        .map((id) => {
          const warehouse = warehouseById.get(id);
          const available = rows
            .filter((s) => s.warehouseId === id)
            .reduce((sum, s) => sum + Math.max(0, s.onHand - s.reserved - s.damaged), 0);
          return { code: warehouse?.code ?? "—", name: warehouse?.name ?? "—", available };
        })
        .filter((s) => s.available > 0)
        .sort((a, b) => b.available - a.available);

      return {
        id: product.id,
        sku: product.sku,
        name: product.name,
        shortName: product.shortName,
        brand: product.brand,
        barcode: product.barcode || null,
        unit: product.unit,
        unitCost: product.unitCost,
        reorderPoint: product.reorderPoint,
        health: summary.health,
        available: here.reduce((s, r) => s + Math.max(0, r.onHand - r.reserved - r.damaged), 0),
        onHand: here.reduce((s, r) => s + r.onHand, 0),
        reserved: here.reduce((s, r) => s + r.reserved, 0),
        incoming: here.reduce((s, r) => s + r.incoming + r.inTransit, 0),
        bins,
        otherSites,
      };
    });
}

export default async function OperatorLookupPage() {
  const [role, user] = await Promise.all([getRole(), getCurrentUser()]);
  if (!can(role, "products")) return <PermissionDenied module="products" role={role} />;

  const site = warehouseById.get(user.warehouseId ?? "") ?? db.warehouses[0];

  return <LookupClient products={operatorCatalogue(site.id)} siteCode={site.code} />;
}
