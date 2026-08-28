import { db } from "@/lib/data/store";
import type { ReturnRow } from "@/components/record/returns-view";
import type { ReturnKind } from "@/lib/types";

const supplierById = new Map(db.suppliers.map((s) => [s.id, s]));
const customerById = new Map(db.customers.map((c) => [c.id, c]));
const warehouseById = new Map(db.warehouses.map((w) => [w.id, w]));

/**
 * Return rows for the list pages.
 *
 * Purchase and sales returns share a shape; only the counterparty and the
 * source document differ, so they are joined here once rather than in both
 * pages.
 */
export async function returnRows(kind: ReturnKind): Promise<ReturnRow[]> {
  return db.returns
    .filter((r) => r.kind === kind)
    .map((r) => {
      const partner =
        kind === "purchase" ? supplierById.get(r.partnerId) : customerById.get(r.partnerId);

      const restockLines = r.lines.filter((l) => l.restock);

      return {
        id: r.id,
        number: r.number,
        partner: partner?.name ?? "—",
        partnerHref:
          kind === "purchase"
            ? `/purchasing/suppliers/${r.partnerId}`
            : `/sales/customers/${r.partnerId}`,
        sourceNumber: r.sourceOrderNumber,
        sourceHref:
          kind === "purchase"
            ? `/purchasing/purchase-orders/${r.sourceOrderId}`
            : `/sales/orders/${r.sourceOrderId}`,
        warehouse: warehouseById.get(r.warehouseId)?.code ?? "—",
        status: r.status,
        reason: r.reason,
        lines: r.lines.length,
        units: r.lines.reduce((s, l) => s + l.quantity, 0),
        refundTotal: r.refundTotal,
        restockValue: r.restockValue,
        restockUnits: restockLines.reduce((s, l) => s + l.quantity, 0),
        createdAt: r.createdAt,
        resolvedAt: r.resolvedAt,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
