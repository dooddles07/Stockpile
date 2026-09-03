import type { Metadata } from "next";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { ValuationView } from "./valuation-view";
import { valuationRows } from "@/lib/repo/analytics";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { ExportButton } from "@/components/actions/export-button";

export const metadata: Metadata = {
  title: "Stock valuation",
  description: "What the stock on hand is worth, under AVCO and under FIFO.",
};

export default async function ValuationPage() {
  const role = await getRole();
  if (!can(role, "valuation")) return <PermissionDenied module="valuation" role={role} />;

  const rows = await valuationRows();

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Analytics", href: "/analytics/inventory" }, { label: "Valuation" }]}
        title="Stock valuation"
        description="The same shelf is worth different amounts under different methods. Both are shown, along with the difference, because which one is in force is a finance decision rather than a display preference."
        actions={
          can(role, "valuation", "export") && (
            <ExportButton
              variant="outline"
              size="sm"
              className="h-8"
              filename="valuation"
              rows={rows.map((r) => ({
                SKU: r.sku,
                Name: r.name,
                Category: r.category,
                "On hand": r.onHand,
                "Unit cost": r.unitCost,
                "AVCO value": r.avcoValue,
                "FIFO value": r.fifoValue,
                "Sell price": r.sellPrice,
                "Retail value": r.retailValue,
                "Margin value": r.marginValue,
              }))}
            >
              Export valuation
            </ExportButton>
          )
        }
      />

      <div className="p-4 sm:p-6">
        <ValuationView rows={rows} />
      </div>
    </>
  );
}
