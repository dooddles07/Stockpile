"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ClipboardCheck, Eye, Play } from "lucide-react";

import { DataTable } from "@/components/data-table/data-table";
import { ColumnHeader } from "@/components/data-table/column-header";
import { NumberCell, actionsColumn } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/states";
import { useRole } from "@/components/providers/role-provider";
import { date, qty, signedMoney } from "@/lib/format";
import { humanize, statusMeta } from "@/lib/status";
import { cn } from "@/lib/utils";

export interface CountTableRow {
  id: string;
  number: string;
  type: string;
  typeLabel: string;
  warehouseCode: string;
  scopeLabel: string;
  status: string;
  scheduledFor: string;
  completedAt: string | null;
  lineCount: number;
  countedLines: number;
  varianceLines: number;
  accuracyPct: number;
  totalVarianceValue: number;
  assignedTo: string[];
  createdBy: string;
}

const STATUS_OPTIONS = (
  ["scheduled", "in-progress", "review", "approved", "applied", "cancelled"] as const
).map((value) => ({ value, label: statusMeta(value).label, tone: statusMeta(value).tone }));

const TYPE_OPTIONS = ["full", "cycle", "category", "location", "spot"].map((value) => ({
  value: humanize(value),
  label: humanize(value),
}));

export function CountsTable({
  rows,
  warehouses,
}: {
  rows: CountTableRow[];
  warehouses: string[];
}) {
  const { can } = useRole();

  const columns = useMemo<ColumnDef<CountTableRow, unknown>[]>(
    () => [
      {
        accessorKey: "number",
        size: 150,
        meta: { label: "Count" },
        header: ({ column }) => <ColumnHeader column={column} title="Count" />,
        cell: ({ row }) => (
          <Link
            href={`/inventory/counts/${row.original.id}`}
            className="text-code font-medium hover:underline"
          >
            {row.original.number}
          </Link>
        ),
      },
      {
        accessorKey: "status",
        size: 130,
        meta: { label: "Status" },
        header: ({ column }) => <ColumnHeader column={column} title="Status" />,
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
        cell: ({ getValue }) => <StatusBadge status={getValue<string>()} />,
      },
      {
        accessorKey: "typeLabel",
        size: 110,
        meta: { label: "Type" },
        header: ({ column }) => <ColumnHeader column={column} title="Type" />,
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
        accessorKey: "scopeLabel",
        size: 180,
        meta: { label: "Scope" },
        header: ({ column }) => <ColumnHeader column={column} title="Scope" />,
        cell: ({ getValue }) => (
          <span className="truncate text-muted-foreground">{getValue<string>()}</span>
        ),
      },
      {
        accessorKey: "countedLines",
        size: 118,
        meta: { label: "Progress", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Counted" align="right" />,
        cell: ({ row }) => (
          <NumberCell
            value={`${qty(row.original.countedLines)} / ${qty(row.original.lineCount)}`}
            className={
              row.original.countedLines === row.original.lineCount
                ? "text-status-success"
                : row.original.countedLines > 0
                  ? "text-status-warning"
                  : "text-muted-foreground"
            }
          />
        ),
      },
      {
        accessorKey: "varianceLines",
        size: 104,
        meta: { label: "Variances", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Variances" align="right" />,
        cell: ({ getValue }) =>
          getValue<number>() > 0 ? (
            <NumberCell value={qty(getValue<number>())} className="font-semibold text-status-warning" />
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "accuracyPct",
        size: 104,
        meta: { label: "Accuracy", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Accuracy" align="right" />,
        cell: ({ row }) => {
          const value = row.original.accuracyPct;
          if (row.original.countedLines === 0) {
            return <span className="text-muted-foreground">—</span>;
          }
          return (
            <NumberCell
              value={`${value.toFixed(1)}%`}
              className={cn(
                value >= 99 && "font-semibold text-status-success",
                value < 99 && value >= 97 && "text-status-warning",
                value < 97 && "font-semibold text-status-danger",
              )}
            />
          );
        },
      },
      {
        accessorKey: "totalVarianceValue",
        size: 128,
        meta: { label: "Variance value", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Variance value" align="right" />,
        cell: ({ getValue }) =>
          getValue<number>() === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <NumberCell
              value={signedMoney(getValue<number>())}
              className={getValue<number>() > 0 ? "text-status-success" : "text-status-danger"}
            />
          ),
      },
      {
        accessorKey: "scheduledFor",
        size: 110,
        meta: { label: "Scheduled", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Scheduled" align="right" />,
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">{date(getValue<string>())}</span>
        ),
      },
      actionsColumn<CountTableRow>([
        { label: "View count", icon: Eye, href: (r) => `/inventory/counts/${r.id}` },
        {
          label: "Start counting",
          icon: Play,
          href: (r) => `/inventory/counts/${r.id}?tab=sheet`,
          hidden: (r) => !can("counts", "edit") || r.status !== "scheduled",
        },
        {
          label: "Review variances",
          icon: ClipboardCheck,
          href: (r) => `/inventory/counts/${r.id}?tab=variances`,
          hidden: (r) => !can("counts", "approve") || r.status !== "review",
        },
      ]),
    ],
    [can],
  );

  return (
    <DataTable
      tableId="counts"
      columns={columns}
      data={rows}
      getRowId={(row) => row.id}
      searchPlaceholder="Search count number or scope…"
      exportName="stock-counts"
      canExport={can("counts", "export")}
      totalLabel="counts"
      rowHref={(row) => `/inventory/counts/${row.id}`}
      defaultSort={[{ id: "scheduledFor", desc: true }]}
      facets={[
        { columnId: "status", title: "Status", options: STATUS_OPTIONS },
        { columnId: "typeLabel", title: "Type", options: TYPE_OPTIONS },
        {
          columnId: "warehouseCode",
          title: "Warehouse",
          options: warehouses.map((w) => ({ value: w, label: w })),
        },
      ]}
      empty={
        <EmptyState
          icon={ClipboardCheck}
          title="No counts match"
          description="Stock counts are how recorded quantities are proved against what is physically on the shelf. Cycle counts run continuously; a full count stops the site."
          action={
            can("counts", "create") ? (
              <Button size="sm" render={<Link href="/inventory/counts/new" />}>
                Schedule a count
              </Button>
            ) : undefined
          }
        />
      }
    />
  );
}
