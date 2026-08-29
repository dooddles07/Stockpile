import { returns as allReturns } from "@/lib/repo/documents";
import {
  customers as allCustomers,
  indexById,
  suppliers as allSuppliers,
  warehouses as allWarehouses,
} from "@/lib/repo/reference";
import type { ReturnRow } from "@/components/record/returns-view";
import type { ReturnKind } from "@/lib/types";

/**
 * Return rows for the list pages.
 *
 * Purchase and sales returns share a shape; only the counterparty and the
 * source document differ, so they are joined here once rather than in both
 * pages.
 *
 * Ticket 03 moved the return Documents, Suppliers and Warehouses onto Postgres.
 * Customers are still the generated dataset (behind `reference.customers`)
 * until ticket 04.
 */
export async function returnRows(kind: ReturnKind): Promise<ReturnRow[]> {
  const [docs, partnerById, warehouseById] = await Promise.all([
    allReturns(),
    kind === "purchase" ? indexById(allSuppliers) : indexById(allCustomers),
    indexById(allWarehouses),
  ]);

  return docs
    .filter((r) => r.kind === kind)
    .map((r) => {
      const partner = partnerById.get(r.partnerId);
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
