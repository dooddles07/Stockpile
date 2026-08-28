import type { Metadata } from "next";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { ReturnForm, type ReturnableOrder } from "@/components/record/return-form";
import { purchaseOrders as allPurchaseOrders } from "@/lib/repo/documents";
import { indexById, suppliers as allSuppliers, warehouses as allWarehouses } from "@/lib/repo/reference";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { date } from "@/lib/format";

export const metadata: Metadata = {
  title: "New purchase return",
  description: "Send goods back to a supplier and claim the credit.",
};

const REASONS = [
  "Delivered against a cancelled line",
  "Failed goods-in inspection",
  "Short shelf life on arrival",
  "Supplier shipped the wrong variant",
  "Quantity over-delivered",
];

const RECEIVED = ["partially-received", "received", "closed"];

export default async function NewPurchaseReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const role = await getRole();
  if (!can(role, "purchase-returns", "create")) {
    return <PermissionDenied module="purchase-returns" role={role} action="raise returns for" />;
  }

  const { order } = await searchParams;

  // Only what has actually been booked in can go back. Quantities are capped at
  // what was received, not what was ordered.
  const supplierById = await indexById(allSuppliers);
  const warehouseById = await indexById(allWarehouses);

  const orders: ReturnableOrder[] = (await allPurchaseOrders())
    .filter((p) => RECEIVED.includes(p.status) && p.lines.some((l) => l.fulfilled > 0))
    .sort((a, b) => (b.receivedAt ?? "").localeCompare(a.receivedAt ?? ""))
    .slice(0, 60)
    .map((p) => ({
      id: p.id,
      number: p.number,
      partner: supplierById.get(p.supplierId)?.name ?? "—",
      siteCode: warehouseById.get(p.warehouseId)?.code ?? "—",
      dated: p.receivedAt ? `Received ${date(p.receivedAt)}` : "Part received",
      lines: p.lines
        .filter((l) => l.fulfilled > 0)
        .map((l) => ({
          id: l.id,
          sku: l.sku,
          name: l.name,
          shipped: l.fulfilled,
          unitPrice: l.unitPrice,
        })),
    }));

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Purchasing", href: "/purchasing/purchase-orders" },
          { label: "Returns", href: "/purchasing/returns" },
          { label: "New return" },
        ]}
        title="New purchase return"
        description="Stock leaves the shelf when the return is despatched, not when it is raised. The claim sits against the supplier until they credit it, and it counts towards their defect rate either way."
      />

      <div className="p-4 sm:p-6">
        <ReturnForm
          kind="purchase"
          orders={orders}
          reasons={REASONS}
          preselectedOrderId={orders.some((o) => o.id === order) ? order : undefined}
        />
      </div>
    </>
  );
}
