"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowLeftRight, ArrowRight, Check, Eye, Truck, X } from "lucide-react";
import { toast } from "sonner";

import { DataTable } from "@/components/data-table/data-table";
import { ColumnHeader } from "@/components/data-table/column-header";
import { NumberCell, PersonCell, actionsColumn, selectColumn } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/states";
import { useRole } from "@/components/providers/role-provider";
import { date, dueLabel, money, qty } from "@/lib/format";
import { statusMeta } from "@/lib/status";
import { cn } from "@/lib/utils";

export interface TransferTableRow {
  id: string;
  number: string;
  fromCode: string;
  toCode: string;
  status: string;
  createdAt: string;
  expectedAt: string;
  receivedAt: string | null;
  lineCount: number;
  units: number;
  receivedUnits: number;
  value: number;
  requestedBy: string;
  approvedBy: string | null;
  carrier: string | null;
  reason: string;
  overdue: boolean;
}

const STATUS_OPTIONS = (
  [
    "draft",
    "pending-approval",
    "approved",
    "in-transit",
    "partially-received",
    "received",
    "cancelled",
  ] as const
).map((value) => ({ value, label: statusMeta(value).label, tone: statusMeta(value).tone }));

export function TransfersTable({
  rows,
  warehouses,
}: {
  rows: TransferTableRow[];
  warehouses: string[];
}) {
  const { can } = useRole();
  const canApprove = can("transfers", "approve");

  const columns = useMemo<ColumnDef<TransferTableRow, unknown>[]>(
    () => [
      selectColumn<TransferTableRow>(),
      {
        accessorKey: "number",
        size: 150,
        meta: { label: "Transfer" },
        header: ({ column }) => <ColumnHeader column={column} title="Transfer" />,
        cell: ({ row }) => (
          <Link
            href={`/warehousing/transfers/${row.original.id}`}
            className="text-code font-medium hover:underline"
          >
            {row.original.number}
          </Link>
        ),
      },
      {
        accessorKey: "status",
        size: 150,
        meta: { label: "Status" },
        header: ({ column }) => <ColumnHeader column={column} title="Status" />,
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
        cell: ({ getValue }) => <StatusBadge status={getValue<string>()} />,
      },
      {
        accessorKey: "fromCode",
        size: 170,
        meta: { label: "Route" },
        header: ({ column }) => <ColumnHeader column={column} title="Route" />,
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
        cell: ({ row }) => (
          <span className="flex items-center gap-1.5 whitespace-nowrap font-medium">
            {row.original.fromCode}
            <ArrowRight className="size-3 text-muted-foreground" aria-hidden />
            {row.original.toCode}
          </span>
        ),
      },
      {
        accessorKey: "toCode",
        size: 100,
        meta: { label: "Destination" },
        header: ({ column }) => <ColumnHeader column={column} title="To" />,
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
      },
      {
        accessorKey: "lineCount",
        size: 80,
        meta: { label: "Lines", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Lines" align="right" />,
        cell: ({ getValue }) => <NumberCell value={getValue<number>()} muted />,
      },
      {
        accessorKey: "units",
        size: 96,
        meta: { label: "Units", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Units" align="right" />,
        cell: ({ getValue }) => <NumberCell value={qty(getValue<number>())} />,
      },
      {
        accessorKey: "receivedUnits",
        size: 116,
        meta: { label: "Received", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Received" align="right" />,
        cell: ({ row }) => {
          const { receivedUnits, units } = row.original;
          const complete = receivedUnits >= units && units > 0;
          return (
            <NumberCell
              value={`${qty(receivedUnits)} / ${qty(units)}`}
              className={cn(
                complete && "text-status-success",
                !complete && receivedUnits > 0 && "text-status-warning",
                receivedUnits === 0 && "text-muted-foreground",
              )}
            />
          );
        },
      },
      {
        accessorKey: "value",
        size: 108,
        meta: { label: "Value", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Value" align="right" />,
        cell: ({ getValue }) => <NumberCell value={money(getValue<number>())} />,
      },
      {
        accessorKey: "carrier",
        size: 150,
        meta: { label: "Carrier" },
        header: ({ column }) => <ColumnHeader column={column} title="Carrier" />,
        cell: ({ getValue }) =>
          getValue<string | null>() ? (
            <span className="flex items-center gap-1.5">
              <Truck className="size-3 text-muted-foreground" aria-hidden />
              {getValue<string>()}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "requestedBy",
        size: 180,
        meta: { label: "Requested by" },
        header: ({ column }) => <ColumnHeader column={column} title="Requested by" />,
        cell: ({ getValue }) => <PersonCell name={getValue<string>()} />,
      },
      {
        accessorKey: "createdAt",
        size: 104,
        meta: { label: "Raised", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Raised" align="right" />,
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">{date(getValue<string>())}</span>
        ),
      },
      {
        accessorKey: "expectedAt",
        size: 124,
        meta: { label: "Due", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Due" align="right" />,
        cell: ({ row }) => (
          <span
            className={cn(
              row.original.overdue ? "font-semibold text-status-danger" : "text-muted-foreground",
            )}
          >
            {dueLabel(row.original.expectedAt)}
          </span>
        ),
      },
      actionsColumn<TransferTableRow>([
        { label: "View transfer", icon: Eye, href: (r) => `/warehousing/transfers/${r.id}` },
        {
          label: "Approve",
          icon: Check,
          separatorBefore: true,
          onSelect: (r) => toast.success(`${r.number} approved and released for despatch`),
          hidden: (r) => !canApprove || r.status !== "pending-approval",
        },
        {
          label: "Reject",
          icon: X,
          destructive: true,
          onSelect: (r) =>
            toast.warning(`${r.number} rejected`, {
              description: "Open the transfer to record why — the reason is required.",
            }),
          hidden: (r) => !canApprove || r.status !== "pending-approval",
        },
        {
          label: "Receive shipment",
          icon: Truck,
          href: (r) => `/warehousing/transfers/${r.id}?tab=receive`,
          hidden: (r) =>
            !can("transfers", "edit") || !["in-transit", "partially-received"].includes(r.status),
        },
      ]),
    ],
    [can, canApprove],
  );

  return (
    <DataTable
      tableId="transfers"
      columns={columns}
      data={rows}
      getRowId={(row) => row.id}
      searchPlaceholder="Search transfer number or reason…"
      exportName="stock-transfers"
      canExport={can("transfers", "export")}
      totalLabel="transfers"
      rowHref={(row) => `/warehousing/transfers/${row.id}`}
      defaultSort={[{ id: "createdAt", desc: true }]}
      defaultVisibility={{ toCode: false, carrier: false, value: false }}
      facets={[
        { columnId: "status", title: "Status", options: STATUS_OPTIONS },
        {
          columnId: "fromCode",
          title: "From",
          options: warehouses.map((w) => ({ value: w, label: w })),
        },
        {
          columnId: "toCode",
          title: "To",
          options: warehouses.map((w) => ({ value: w, label: w })),
        },
      ]}
      empty={
        <EmptyState
          icon={ArrowLeftRight}
          title="No transfers match"
          description="Transfers move stock between sites — rebalancing ahead of demand, consolidating slow movers, or covering an order the destination cannot fill."
          action={
            can("transfers", "create") ? (
              <Button size="sm" render={<Link href="/warehousing/transfers/new" />}>
                Create a transfer
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
                  description: "None of the selected transfers are waiting for a decision.",
                });
                return;
              }
              toast.success(`${approvable.length} transfers approved`, {
                description: `${qty(approvable.reduce((s, r) => s + r.units, 0))} units released for despatch.`,
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
