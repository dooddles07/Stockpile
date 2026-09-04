import type { Metadata } from "next";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { ReturnForm, type ReturnableOrder } from "@/components/record/return-form";
import { salesOrders as allSalesOrders } from "@/lib/repo/documents";
import { customers as allCustomers, indexById, warehouses as allWarehouses } from "@/lib/repo/reference";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { date } from "@/lib/format";

export const metadata: Metadata = {
  title: "New sales return",
  description: "Book goods coming back from a customer.",
};

const REASONS = [
  "Wrong item shipped",
  "Damaged in transit",
  "Customer ordered in error",
  "Faulty on arrival",
  "Over-shipment returned",
  "Specification mismatch",
];

export default async function NewSalesReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const role = await getRole();
  if (!can(role, "sales-returns", "create")) {
    return <PermissionDenied module="sales-returns" role={role} action="raise returns for" />;
  }

  const { order } = await searchParams;

  // Only orders that actually left the building can come back. Newest first —
  // a return is nearly always against something recent.
  const customerById = await indexById(allCustomers);
  const warehouseById = await indexById(allWarehouses);

  const orders: ReturnableOrder[] = (await allSalesOrders())
    .filter((o) => o.shippedAt && o.lines.some((l) => l.fulfilled > 0))
    .sort((a, b) => (b.shippedAt ?? "").localeCompare(a.shippedAt ?? ""))
    .map((o) => ({
      id: o.id,
      number: o.number,
      partner: customerById.get(o.customerId)?.name ?? "—",
      siteCode: warehouseById.get(o.warehouseId)?.code ?? "—",
      dated: `Shipped ${date(o.shippedAt!)}`,
      lines: o.lines
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
          { label: "Sales", href: "/sales/orders" },
          { label: "Returns", href: "/sales/returns" },
          { label: "New return" },
        ]}
        title="New sales return"
        description="Nothing moves until the goods physically arrive. Raising this reserves the credit and tells the site to expect the delivery — it does not put stock back."
      />

      <div className="p-4 sm:p-6">
        <ReturnForm
          kind="sales"
          orders={orders}
          reasons={REASONS}
          preselectedOrderId={orders.some((o) => o.id === order) ? order : undefined}
        />
      </div>
    </>
  );
}
