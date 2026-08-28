import Link from "next/link";
import { Undo2 } from "lucide-react";

import { EmptyState } from "@/components/states";
import { Section } from "@/components/record/field-grid";
import { SimpleTable } from "@/components/record/simple-table";
import { StatusBadge } from "@/components/status/status-badge";
import { money, plural, qty, relative } from "@/lib/format";

export interface ReturnRow {
  id: string;
  number: string;
  partner: string;
  partnerHref: string;
  sourceNumber: string;
  sourceHref: string;
  warehouse: string;
  status: string;
  reason: string;
  lines: number;
  units: number;
  refundTotal: number;
  restockValue: number;
  restockUnits: number;
  createdAt: string;
  resolvedAt: string | null;
}

/**
 * The returns table.
 *
 * Purchase returns and sales returns differ only in who the counterparty is
 * and which direction the stock moves, so they share this rather than being
 * two near-identical files.
 */
export function ReturnsTable({
  rows,
  kind,
  detailBase,
  emptyTitle,
  emptyDescription,
}: {
  rows: ReturnRow[];
  kind: "purchase" | "sales";
  detailBase: string;
  emptyTitle: string;
  emptyDescription: string;
}) {
  return (
    <Section
      title={kind === "purchase" ? "Returns to suppliers" : "Returns from customers"}
      description={
        kind === "purchase"
          ? "Stock going back to a supplier. Sellable units leave stock; the credit is chased separately."
          : "Stock coming back from a customer. Only units that pass inspection go back into sellable stock."
      }
      contentClassName="p-0"
    >
      <SimpleTable
        rows={rows}
        getRowId={(r) => r.id}
        columns={[
          {
            key: "number",
            header: "Return",
            cell: (r) => (
              <Link href={`${detailBase}/${r.id}`} className="text-code font-medium hover:underline">
                {r.number}
              </Link>
            ),
          },
          { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
          {
            key: "partner",
            header: kind === "purchase" ? "Supplier" : "Customer",
            cell: (r) => (
              <Link href={r.partnerHref} className="truncate hover:underline">
                {r.partner}
              </Link>
            ),
          },
          {
            key: "source",
            header: "Against",
            hideOnMobile: true,
            cell: (r) => (
              <Link href={r.sourceHref} className="text-code text-muted-foreground hover:underline">
                {r.sourceNumber}
              </Link>
            ),
          },
          {
            key: "reason",
            header: "Reason",
            cell: (r) => <span className="truncate">{r.reason}</span>,
          },
          { key: "warehouse", header: "Site", hideOnMobile: true, cell: (r) => r.warehouse },
          { key: "units", header: "Units", align: "right", cell: (r) => qty(r.units) },
          {
            key: "restock",
            header: "Back to stock",
            align: "right",
            cell: (r) =>
              r.restockUnits > 0 ? (
                <span className="font-medium text-status-success">{qty(r.restockUnits)}</span>
              ) : (
                <span className="text-muted-foreground">none</span>
              ),
          },
          {
            key: "refund",
            header: kind === "purchase" ? "Credit due" : "Refund",
            align: "right",
            cell: (r) => money(r.refundTotal),
          },
          {
            key: "created",
            header: "Raised",
            align: "right",
            cell: (r) => <span className="text-muted-foreground">{relative(r.createdAt)}</span>,
          },
        ]}
        footer={
          rows.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
              <span className="text-muted-foreground">{plural(rows.length, "return")}</span>
              <span className="tabular" data-numeric>
                <span className="text-muted-foreground">
                  {kind === "purchase" ? "Credit due " : "Refunds "}
                </span>
                <span className="font-semibold">
                  {money(rows.reduce((s, r) => s + r.refundTotal, 0))}
                </span>
                <span className="text-muted-foreground"> · Restocked </span>
                <span className="font-semibold">
                  {money(rows.reduce((s, r) => s + r.restockValue, 0))}
                </span>
              </span>
            </div>
          ) : undefined
        }
        empty={
          <EmptyState icon={Undo2} title={emptyTitle} description={emptyDescription} />
        }
      />
    </Section>
  );
}
