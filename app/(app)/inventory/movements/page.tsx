import type { Metadata } from "next";
import { Download } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { StatTile } from "@/components/record/field-grid";
import { MovementsTable, type MovementTableRow } from "./movements-table";
import { movements as allMovements } from "@/lib/repo/documents";
import {
  indexById,
  locations as allLocations,
  products as allProducts,
  users as allUsers,
  warehouses as allWarehouses,
} from "@/lib/repo/reference";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { humanize } from "@/lib/status";
import { money, qty } from "@/lib/format";
import { ExportButton } from "@/components/actions/export-button";

export const metadata: Metadata = {
  title: "Inventory movements",
  description: "The append-only ledger of every stock change, with full attribution.",
};

/** Where a movement's source document lives. */
function refHref(refType: string, refId: string): string | null {
  if (refId === "—") return null;
  switch (refType) {
    case "purchase-order":
      return `/purchasing/purchase-orders/${refId}`;
    case "sales-order":
      return `/sales/orders/${refId}`;
    case "transfer":
      return `/warehousing/transfers/${refId}`;
    case "adjustment":
      return `/inventory/adjustments/${refId}`;
    case "stock-count":
      return `/inventory/counts/${refId}`;
    case "return":
      return `/sales/returns/${refId}`;
    default:
      return null;
  }
}

export default async function MovementsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const role = await getRole();
  if (!can(role, "movements")) return <PermissionDenied module="movements" role={role} />;

  const { q } = await searchParams;

  const productById = await indexById(allProducts);
  const warehouseById = await indexById(allWarehouses);
  const locationById = await indexById(allLocations);
  const userById = await indexById(allUsers);

  const rows: MovementTableRow[] = (await allMovements()).map((m) => {
    const product = productById.get(m.productId);
    return {
      id: m.id,
      ts: m.ts,
      type: m.type,
      typeLabel: humanize(m.type),
      sku: m.sku,
      productName: product?.shortName ?? "—",
      productHref: `/inventory/products/${m.sku}`,
      warehouseCode: warehouseById.get(m.warehouseId)?.code ?? "—",
      locationCode: locationById.get(m.locationId)?.code ?? "—",
      qtyBefore: m.qtyBefore,
      qtyChange: m.qtyChange,
      qtyAfter: m.qtyAfter,
      unitCost: m.unitCost,
      valueChange: m.valueChange,
      refNumber: m.refNumber,
      refHref: refHref(m.refType, m.refId),
      user: userById.get(m.userId)?.name ?? "—",
      reason: m.reason,
    };
  });

  const inbound = rows.filter((r) => r.qtyChange > 0);
  const outbound = rows.filter((r) => r.qtyChange < 0);
  const netValue = rows.reduce((s, r) => s + r.valueChange, 0);
  const warehouses = [...new Set([...warehouseById.values()].map((w) => w.code))].sort();

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Inventory", href: "/inventory/products" }, { label: "Movements" }]}
        title="Inventory movements"
        description="Every stock change ever recorded, in order, with the person and document behind it. Entries are never edited or deleted — a correction is itself a movement."
        actions={
          can(role, "movements", "export") && (
            <ExportButton
              variant="outline"
              size="sm"
              className="h-8"
              filename="movements"
              rows={rows.map((r) => ({
                When: r.ts,
                Type: r.typeLabel,
                SKU: r.sku,
                Product: r.productName,
                Warehouse: r.warehouseCode,
                Location: r.locationCode,
                "Qty before": r.qtyBefore,
                "Qty change": r.qtyChange,
                "Qty after": r.qtyAfter,
                "Unit cost": r.unitCost,
                "Value change": r.valueChange,
                Reference: r.refNumber,
                User: r.user,
                Reason: r.reason,
              }))}
            >
              <Download className="size-3.5" aria-hidden />
              Export ledger
            </ExportButton>
          )
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile label="Ledger entries" value={qty(rows.length)} />
          <StatTile
            label="Units received"
            value={qty(inbound.reduce((s, r) => s + r.qtyChange, 0))}
            tone="success"
            hint={`${qty(inbound.length)} inbound movements`}
          />
          <StatTile
            label="Units despatched"
            value={qty(Math.abs(outbound.reduce((s, r) => s + r.qtyChange, 0)))}
            tone="danger"
            hint={`${qty(outbound.length)} outbound movements`}
          />
          <StatTile
            label="Net value change"
            value={money(netValue)}
            tone={netValue >= 0 ? "success" : "danger"}
            hint="Across the whole ledger"
          />
        </div>
      </PageHeader>

      <div className="p-4 sm:p-6">
        <MovementsTable rows={rows} warehouses={warehouses} initialSearch={q} />
      </div>
    </>
  );
}
