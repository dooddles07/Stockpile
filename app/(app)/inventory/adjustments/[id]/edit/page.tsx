import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { PageHeader } from "@/components/shell/page-header";
import { EmptyState, PermissionDenied } from "@/components/states";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Lock } from "lucide-react";
import { AdjustmentForm } from "../../new/adjustment-form";
import { db } from "@/lib/data/store";
import { summaryFor } from "@/lib/repo/inventory";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { humanize } from "@/lib/status";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const adjustment = db.adjustments.find((a) => a.id === id);
  return adjustment
    ? { title: `Edit ${adjustment.number}`, description: `Change the draft adjustment ${adjustment.number}.` }
    : { title: "Adjustment not found" };
}

export default async function EditAdjustmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const role = await getRole();
  const adjustment = db.adjustments.find((a) => a.id === id);
  if (!adjustment) notFound();
  if (!can(role, "adjustments", "edit")) {
    return <PermissionDenied module="adjustments" role={role} action="edit" />;
  }

  // Only a draft can be changed. Once it is submitted the numbers are part of an
  // approval someone else is reading, and once posted they are in the ledger.
  if (adjustment.status !== "draft") {
    return (
      <>
        <PageHeader
          crumbs={[
            { label: "Inventory", href: "/inventory/products" },
            { label: "Adjustments", href: "/inventory/adjustments" },
            { label: adjustment.number, href: `/inventory/adjustments/${adjustment.id}` },
            { label: "Edit" },
          ]}
          title={`${adjustment.number} cannot be edited`}
        />
        <div className="p-4 sm:p-6">
          <EmptyState
            icon={Lock}
            title={`This adjustment is ${humanize(adjustment.status).toLowerCase()}`}
            description="Only drafts can be changed. A submitted adjustment is part of somebody's approval queue, and a posted one is in the movement ledger — correct it with a new adjustment so the history stays intact."
            className="py-14"
            action={
              <Button size="sm" className="h-8" render={<Link href={`/inventory/adjustments/${adjustment.id}`} />}>
                Back to the adjustment
              </Button>
            }
          />
        </div>
      </>
    );
  }

  const warehouses = db.warehouses.map((w) => ({ id: w.id, code: w.code, name: w.name }));

  const products = db.products
    .filter((p) => p.status === "active" || adjustment.lines.some((l) => l.productId === p.id))
    .map((p) => {
      const stock = summaryFor(p.id);
      return {
        id: p.id,
        sku: p.sku,
        name: p.shortName,
        unit: p.unit,
        unitCost: p.unitCost,
        sellPrice: p.sellPrice,
        available: stock.available,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const lines = adjustment.lines.flatMap((line) => {
    const product = products.find((p) => p.id === line.productId);
    if (!product) return [];
    return [
      {
        key: line.id,
        product,
        quantity: Math.abs(line.delta),
        unitPrice: line.unitCost,
        discountPct: 0,
        taxPct: 0,
      },
    ];
  });

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Inventory", href: "/inventory/products" },
          { label: "Adjustments", href: "/inventory/adjustments" },
          { label: adjustment.number, href: `/inventory/adjustments/${adjustment.id}` },
          { label: "Edit" },
        ]}
        title={`Edit ${adjustment.number}`}
        description="Still a draft, so nothing here has touched stock. Submitting sends it for approval if the value moved is over $500."
      />

      <div className="p-4 sm:p-6">
        <AdjustmentForm
          warehouses={warehouses}
          products={products}
          returnTo={`/inventory/adjustments/${adjustment.id}`}
          initial={{
            number: adjustment.number,
            warehouseId: adjustment.warehouseId,
            reason: adjustment.reason,
            note: adjustment.note,
            lines,
            deltas: Object.fromEntries(
              adjustment.lines.map((line) => [line.id, Math.abs(line.delta)]),
            ),
          }}
        />
      </div>
    </>
  );
}
