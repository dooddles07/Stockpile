"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Check, Eye, PackageCheck, Printer, ShoppingCart, X } from "lucide-react";
import { toast } from "sonner";

import { DataTable } from "@/components/data-table/data-table";
import { ColumnHeader } from "@/components/data-table/column-header";
import { NumberCell, PersonCell, actionsColumn, selectColumn } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/states";
import { useRole } from "@/components/providers/role-provider";
import { date, dueLabel, money, plural, qty } from "@/lib/format";
import { statusMeta } from "@/lib/status";
import { cn } from "@/lib/utils";

export interface PoTableRow {
  id: string;
  number: string;
  supplier: string;
  supplierCode: string;
  warehouseCode: string;
  status: string;
  createdAt: string;
  orderedAt: string | null;
  expectedAt: string;
  receivedAt: string | null;
  lineCount: number;
  units: number;
  receivedUnits: number;
  total: number;
  createdBy: string;
  approvedBy: string | null;
  paymentTerms: string;
  overdue: boolean;
}

const STATUS_OPTIONS = (
  [
    "draft",
    "submitted",
    "approved",
    "ordered",
    "partially-received",
    "received",
    "closed",
    "cancelled",
  ] as const
).map((value) => ({ value, label: statusMeta(value).label, tone: statusMeta(value).tone }));

export function PoTable({
  rows,
  suppliers,
  warehouses,
  initialSearch,
}: {
  rows: PoTableRow[];
  suppliers: string[];
  warehouses: string[];
  initialSearch?: string;
}) {
  const { can } = useRole();
  const canApprove = can("purchase-orders", "approve");

  const columns = useMemo<ColumnDef<PoTableRow, unknown>[]>(
    () => [
      selectColumn<PoTableRow>(),
      {
        accessorKey: "number",
        size: 148,
        meta: { label: "Order" },
        header: ({ column }) => <ColumnHeader column={column} title="Order" />,
        cell: ({ row }) => (
          <Link
            href={`/purchasing/purchase-orders/${row.original.id}`}
            className="text-code font-medium hover:underline"
          >
            {row.original.number}
          </Link>
        ),
      },
      {
        accessorKey: "status",
        size: 148,
        meta: { label: "Status" },
        header: ({ column }) => <ColumnHeader column={column} title="Status" />,
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
        cell: ({ getValue }) => <StatusBadge status={getValue<string>()} />,
      },
      {
        accessorKey: "supplier",
        size: 210,
        meta: { label: "Supplier" },
        header: ({ column }) => <ColumnHeader column={column} title="Supplier" />,
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
        cell: ({ row }) => (
          <span className="grid min-w-0 gap-0.5">
            <span className="truncate">{row.original.supplier}</span>
            <span className="text-code truncate text-[11px] text-muted-foreground">
              {row.original.supplierCode}
            </span>
          </span>
        ),
      },
      {
        accessorKey: "warehouseCode",
        size: 88,
        meta: { label: "Into" },
        header: ({ column }) => <ColumnHeader column={column} title="Into" />,
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
        accessorKey: "receivedUnits",
        size: 124,
        meta: { label: "Received", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Received" align="right" />,
        cell: ({ row }) => {
          const { receivedUnits, units } = row.original;
          const complete = units > 0 && receivedUnits >= units;
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
        accessorKey: "total",
        size: 124,
        meta: { label: "Total", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Total" align="right" />,
        cell: ({ getValue }) => (
          <NumberCell value={money(getValue<number>())} className="font-medium" />
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
        size: 160,
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
        accessorKey: "paymentTerms",
        size: 110,
        meta: { label: "Terms" },
        header: ({ column }) => <ColumnHeader column={column} title="Terms" />,
        cell: ({ getValue }) => <span className="text-muted-foreground">{getValue<string>()}</span>,
      },
      {
        accessorKey: "orderedAt",
        size: 108,
        meta: { label: "Ordered", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Ordered" align="right" />,
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {date(row.original.orderedAt ?? row.original.createdAt)}
          </span>
        ),
      },
      {
        accessorKey: "expectedAt",
        size: 128,
        meta: { label: "Expected", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Expected" align="right" />,
        cell: ({ row }) => (
          <span
            className={cn(
              row.original.overdue ? "font-semibold text-status-danger" : "text-muted-foreground",
            )}
          >
            {row.original.overdue ? dueLabel(row.original.expectedAt) : date(row.original.expectedAt)}
          </span>
        ),
      },
      actionsColumn<PoTableRow>([
        { label: "View order", icon: Eye, href: (r) => `/purchasing/purchase-orders/${r.id}` },
        { label: "Print order", icon: Printer, onSelect: (r) => toast.info(`${r.number} sent to the printer`) },
        {
          label: "Approve",
          icon: Check,
          separatorBefore: true,
          onSelect: (r) =>
            toast.success(`${r.number} approved`, {
              description: `${money(r.total)} committed to ${r.supplier}.`,
            }),
          hidden: (r) => !canApprove || r.status !== "submitted",
        },
        {
          label: "Reject",
          icon: X,
          destructive: true,
          onSelect: (r) =>
            toast.warning(`${r.number} rejected`, {
              description: "Open the order to record why — the reason is required.",
            }),
          hidden: (r) => !canApprove || r.status !== "submitted",
        },
        {
          label: "Receive goods",
          icon: PackageCheck,
          href: (r) => `/purchasing/purchase-orders/${r.id}?tab=receive`,
          hidden: (r) =>
            !can("receiving", "edit") || !["ordered", "partially-received"].includes(r.status),
        },
      ]),
    ],
    [can, canApprove],
  );

  return (
    <DataTable
      tableId="purchase-orders"
      columns={columns}
      data={rows}
      getRowId={(row) => row.id}
      searchPlaceholder="Search order number or supplier…"
      initialSearch={initialSearch}
      exportName="purchase-orders"
      canExport={can("purchase-orders", "export")}
      totalLabel="purchase orders"
      rowHref={(row) => `/purchasing/purchase-orders/${row.id}`}
      defaultSort={[{ id: "createdAt", desc: true }]}
      defaultVisibility={{ paymentTerms: false, approvedBy: false, orderedAt: false }}
      facets={[
        { columnId: "status", title: "Status", options: STATUS_OPTIONS },
        {
          columnId: "supplier",
          title: "Supplier",
          options: suppliers.map((s) => ({ value: s, label: s })),
        },
        {
          columnId: "warehouseCode",
          title: "Warehouse",
          options: warehouses.map((w) => ({ value: w, label: w })),
        },
      ]}
      empty={
        <EmptyState
          icon={ShoppingCart}
          title="No purchase orders match"
          description="Purchase orders commit spend with a supplier and create the incoming stock that reorder planning depends on."
          action={
            can("purchase-orders", "create") ? (
              <Button size="sm" render={<Link href="/purchasing/purchase-orders/new" />}>
                Raise a purchase order
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
              const approvable = selected.filter((r) => r.status === "submitted");
              if (approvable.length === 0) {
                toast.error("Nothing to approve", {
                  description: "None of the selected orders are waiting for a decision.",
                });
                return;
              }
              toast.success(`${plural(approvable.length, "order")} approved`, {
                description: `${money(approvable.reduce((s, r) => s + r.total, 0))} committed across ${plural(
                  new Set(approvable.map((r) => r.supplier)).size,
                  "supplier",
                )}.`,
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
