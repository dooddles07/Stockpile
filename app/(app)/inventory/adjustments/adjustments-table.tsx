"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Check, Eye, Pencil, SlidersHorizontal, X } from "lucide-react";
import { toast } from "sonner";

import { DataTable } from "@/components/data-table/data-table";
import { ColumnHeader } from "@/components/data-table/column-header";
import { NumberCell, PersonCell, actionsColumn, selectColumn } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/states";
import { useRole } from "@/components/providers/role-provider";
import { date, money, signed, signedMoney } from "@/lib/format";
import { humanize, statusMeta } from "@/lib/status";

export interface AdjustmentTableRow {
  id: string;
  number: string;
  warehouseCode: string;
  reason: string;
  reasonLabel: string;
  status: string;
  createdAt: string;
  appliedAt: string | null;
  lineCount: number;
  totalDelta: number;
  totalValueImpact: number;
  createdBy: string;
  approvedBy: string | null;
  requiresApproval: boolean;
}

const STATUS_OPTIONS = (
  ["draft", "pending-approval", "approved", "rejected", "applied"] as const
).map((value) => ({ value, label: statusMeta(value).label, tone: statusMeta(value).tone }));

const REASON_OPTIONS = [
  "damaged", "lost", "found", "expired",
  "count-error", "manual-correction", "internal-use", "other",
].map((value) => ({ value: humanize(value), label: humanize(value) }));

export function AdjustmentsTable({
  rows,
  warehouses,
}: {
  rows: AdjustmentTableRow[];
  warehouses: string[];
}) {
  const { can } = useRole();
  const canApprove = can("adjustments", "approve");

  const columns = useMemo<ColumnDef<AdjustmentTableRow, unknown>[]>(
    () => [
      selectColumn<AdjustmentTableRow>(),
      {
        accessorKey: "number",
        size: 150,
        meta: { label: "Adjustment" },
        header: ({ column }) => <ColumnHeader column={column} title="Adjustment" />,
        cell: ({ row }) => (
          <Link href={`/inventory/adjustments/${row.original.id}`} className="text-code font-medium hover:underline">
            {row.original.number}
          </Link>
        ),
      },
      {
        accessorKey: "status",
        size: 140,
        meta: { label: "Status" },
        header: ({ column }) => <ColumnHeader column={column} title="Status" />,
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
        cell: ({ getValue }) => <StatusBadge status={getValue<string>()} />,
      },
      {
        accessorKey: "reasonLabel",
        size: 150,
        meta: { label: "Reason" },
        header: ({ column }) => <ColumnHeader column={column} title="Reason" />,
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
      },
      {
        accessorKey: "warehouseCode",
        size: 88,
        meta: { label: "Site" },
        header: ({ column }) => <ColumnHeader column={column} title="Site" />,
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
      },
      {
        accessorKey: "lineCount",
        size: 76,
        meta: { label: "Lines", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Lines" align="right" />,
        cell: ({ getValue }) => <NumberCell value={getValue<number>()} muted />,
      },
      {
        accessorKey: "totalDelta",
        size: 96,
        meta: { label: "Unit change", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Units" align="right" />,
        cell: ({ getValue }) => (
          <NumberCell
            value={signed(getValue<number>())}
            className={getValue<number>() >= 0 ? "text-status-success" : "text-status-danger"}
          />
        ),
      },
      {
        accessorKey: "totalValueImpact",
        size: 120,
        meta: { label: "Value impact", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Value impact" align="right" />,
        cell: ({ getValue }) => (
          <NumberCell
            value={signedMoney(getValue<number>())}
            className={
              Math.abs(getValue<number>()) > 500
                ? getValue<number>() >= 0
                  ? "font-semibold text-status-success"
                  : "font-semibold text-status-danger"
                : "text-muted-foreground"
            }
          />
        ),
      },
      {
        accessorKey: "createdBy",
        size: 180,
        meta: { label: "Raised by" },
        header: ({ column }) => <ColumnHeader column={column} title="Raised by" />,
        cell: ({ getValue }) => <PersonCell name={getValue<string>()} />,
      },
      {
        accessorKey: "approvedBy",
        size: 170,
        meta: { label: "Approved by" },
        header: ({ column }) => <ColumnHeader column={column} title="Approved by" />,
        cell: ({ getValue }) =>
          getValue<string | null>() ? (
            <span className="truncate">{getValue<string>()}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "createdAt",
        size: 108,
        meta: { label: "Raised", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Raised" align="right" />,
        cell: ({ getValue }) => <span className="text-muted-foreground">{date(getValue<string>())}</span>,
      },
      {
        accessorKey: "appliedAt",
        size: 108,
        meta: { label: "Applied", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Applied" align="right" />,
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">
            {getValue<string | null>() ? date(getValue<string>()) : "—"}
          </span>
        ),
      },
      actionsColumn<AdjustmentTableRow>([
        { label: "View adjustment", icon: Eye, href: (r) => `/inventory/adjustments/${r.id}` },
        {
          label: "Edit",
          icon: Pencil,
          href: (r) => `/inventory/adjustments/${r.id}?edit=1`,
          hidden: (r) => !can("adjustments", "edit") || r.status !== "draft",
        },
        {
          label: "Approve",
          icon: Check,
          separatorBefore: true,
          onSelect: (r) => toast.success(`${r.number} approved`),
          hidden: (r) => !canApprove || r.status !== "pending-approval",
        },
        {
          label: "Reject",
          icon: X,
          destructive: true,
          onSelect: (r) =>
            toast.warning(`${r.number} rejected`, {
              description: "Open the adjustment to record why — the reason is required.",
            }),
          hidden: (r) => !canApprove || r.status !== "pending-approval",
        },
      ]),
    ],
    [can, canApprove],
  );

  return (
    <DataTable
      tableId="adjustments"
      columns={columns}
      data={rows}
      getRowId={(row) => row.id}
      searchPlaceholder="Search adjustment number or reason…"
      exportName="stock-adjustments"
      canExport={can("adjustments", "export")}
      totalLabel="adjustments"
      rowHref={(row) => `/inventory/adjustments/${row.id}`}
      defaultSort={[{ id: "createdAt", desc: true }]}
      defaultVisibility={{ appliedAt: false }}
      facets={[
        { columnId: "status", title: "Status", options: STATUS_OPTIONS },
        { columnId: "reasonLabel", title: "Reason", options: REASON_OPTIONS },
        {
          columnId: "warehouseCode",
          title: "Warehouse",
          options: warehouses.map((w) => ({ value: w, label: w })),
        },
      ]}
      empty={
        <EmptyState
          icon={SlidersHorizontal}
          title="No adjustments match"
          description="Stock adjustments record every deliberate correction to a quantity — damage, loss, a recount or an internal issue. Nothing here matches the current filters."
          action={
            can("adjustments", "create") ? (
              <Button size="sm" render={<Link href="/inventory/adjustments/new" />}>
                Raise an adjustment
              </Button>
            ) : undefined
          }
        />
      }
      bulkActions={(selected, clear) =>
        canApprove ? (
          <Button
            size="sm"
            variant="secondary"
            className="h-7"
            onClick={() => {
              const approvable = selected.filter((r) => r.status === "pending-approval");
              if (approvable.length === 0) {
                toast.error("Nothing to approve", {
                  description: "None of the selected adjustments are waiting for a decision.",
                });
                return;
              }
              const value = approvable.reduce((s, r) => s + r.totalValueImpact, 0);
              toast.success(`${approvable.length} adjustments approved`, {
                description: `Net inventory value impact ${money(value, { cents: true })}. Each approval is logged separately.`,
              });
              clear();
            }}
          >
            <Check className="size-3.5" aria-hidden />
            Approve selected
          </Button>
        ) : null
      }
    />
  );
}
