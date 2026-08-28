import type { Metadata } from "next";
import { Download } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { ValuationView } from "./valuation-view";
import { valuationRows } from "@/lib/repo/analytics";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { ActionButton } from "@/components/actions/action-button";

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
            <ActionButton
              variant="outline" size="sm" className="h-8"
              feedback="Export started"
              detail="Valuation by warehouse and category under both methods, as CSV."
            >
              <Download className="size-3.5" aria-hidden />
              Export valuation
            </ActionButton>
          )
        }
      />

      <div className="p-4 sm:p-6">
        <ValuationView rows={rows} />
      </div>
    </>
  );
}
