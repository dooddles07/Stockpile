"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ClipboardList, Container, Eye, FileText, Printer, Truck } from "lucide-react";
import { toast } from "sonner";

import { DataTable } from "@/components/data-table/data-table";
import { ColumnHeader } from "@/components/data-table/column-header";
import { NumberCell, actionsColumn, selectColumn } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/states";
import { useRole } from "@/components/providers/role-provider";
import { date, dueLabel, money, plural, qty } from "@/lib/format";
import { humanize, statusMeta } from "@/lib/status";
import { cn } from "@/lib/utils";

export interface OrderTableRow {
  id: string;
  number: string;
  customer: string;
  customerCode: string;
  warehouseCode: string;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  channel: string;
  channelLabel: string;
  placedAt: string;
  promisedAt: string;
  shippedAt: string | null;
  lineCount: number;
  units: number;
  fulfilledUnits: number;
  total: number;
  shipToCity: string;
  carrier: string | null;
  late: boolean;
}

const STATUS_OPTIONS = (
  [
    "draft",
    "confirmed",
    "reserved",
    "picking",
    "packing",
    "shipped",
    "delivered",
    "backorder",
    "cancelled",
  ] as const
).map((value) => ({ value, label: statusMeta(value).label, tone: statusMeta(value).tone }));

const PAYMENT_OPTIONS = (["unpaid", "partial", "paid", "refunded"] as const).map((value) => ({
  value,
  label: statusMeta(value).label,
  tone: statusMeta(value).tone,
}));

const CHANNEL_OPTIONS = ["web", "edi", "phone", "pos", "marketplace"].map((value) => ({
  value: humanize(value),
  label: humanize(value),
}));

export function OrdersTable({
  rows,
  customers,
  warehouses,
  initialSearch,
}: {
  rows: OrderTableRow[];
  customers: string[];
  warehouses: string[];
  initialSearch?: string;
}) {
  const { can } = useRole();

  const columns = useMemo<ColumnDef<OrderTableRow, unknown>[]>(
    () => [
      selectColumn<OrderTableRow>(),
      {
        accessorKey: "number",
        size: 148,
        meta: { label: "Order" },
        header: ({ column }) => <ColumnHeader column={column} title="Order" />,
        cell: ({ row }) => (
          <Link href={`/sales/orders/${row.original.id}`} className="text-code font-medium hover:underline">
            {row.original.number}
          </Link>
        ),
      },
      {
        accessorKey: "status",
        size: 128,
        meta: { label: "Status" },
        header: ({ column }) => <ColumnHeader column={column} title="Status" />,
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
        cell: ({ getValue }) => <StatusBadge status={getValue<string>()} />,
      },
      {
        accessorKey: "customer",
        size: 210,
        meta: { label: "Customer" },
        header: ({ column }) => <ColumnHeader column={column} title="Customer" />,
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
        cell: ({ row }) => (
          <span className="grid min-w-0 gap-0.5">
            <span className="truncate">{row.original.customer}</span>
            <span className="text-code truncate text-[11px] text-muted-foreground">
              {row.original.customerCode}
            </span>
          </span>
        ),
      },
      {
        accessorKey: "paymentStatus",
        size: 118,
        meta: { label: "Payment" },
        header: ({ column }) => <ColumnHeader column={column} title="Payment" />,
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
        cell: ({ getValue }) => <StatusBadge status={getValue<string>()} />,
      },
      {
        accessorKey: "fulfillmentStatus",
        size: 128,
        meta: { label: "Fulfillment" },
        header: ({ column }) => <ColumnHeader column={column} title="Fulfillment" />,
        cell: ({ getValue }) => <StatusBadge status={getValue<string>()} />,
      },
      {
        accessorKey: "channelLabel",
        size: 116,
        meta: { label: "Channel" },
        header: ({ column }) => <ColumnHeader column={column} title="Channel" />,
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">{getValue<string>()}</span>
        ),
      },
      {
        accessorKey: "warehouseCode",
        size: 88,
        meta: { label: "From" },
        header: ({ column }) => <ColumnHeader column={column} title="From" />,
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
      },
      {
        accessorKey: "shipToCity",
        size: 140,
        meta: { label: "Ship to" },
        header: ({ column }) => <ColumnHeader column={column} title="Ship to" />,
        cell: ({ getValue }) => (
          <span className="truncate text-muted-foreground">{getValue<string>()}</span>
        ),
      },
      {
        accessorKey: "lineCount",
        size: 80,
        meta: { label: "Lines", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Lines" align="right" />,
        cell: ({ getValue }) => <NumberCell value={getValue<number>()} muted />,
      },
      {
        accessorKey: "fulfilledUnits",
        size: 124,
        meta: { label: "Fulfilled", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Fulfilled" align="right" />,
        cell: ({ row }) => {
          const { fulfilledUnits, units } = row.original;
          const complete = units > 0 && fulfilledUnits >= units;
          return (
            <NumberCell
              value={`${qty(fulfilledUnits)} / ${qty(units)}`}
              className={cn(
                complete && "text-status-success",
                !complete && fulfilledUnits > 0 && "text-status-warning",
                fulfilledUnits === 0 && "text-muted-foreground",
              )}
            />
          );
        },
      },
      {
        accessorKey: "total",
        size: 120,
        meta: { label: "Total", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Total" align="right" />,
        cell: ({ getValue }) => (
          <NumberCell value={money(getValue<number>())} className="font-medium" />
        ),
      },
      {
        accessorKey: "placedAt",
        size: 108,
        meta: { label: "Placed", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Placed" align="right" />,
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">{date(getValue<string>())}</span>
        ),
      },
      {
        accessorKey: "promisedAt",
        size: 128,
        meta: { label: "Promised", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Promised" align="right" />,
        cell: ({ row }) => (
          <span
            className={cn(
              row.original.late ? "font-semibold text-status-danger" : "text-muted-foreground",
            )}
          >
            {row.original.late ? dueLabel(row.original.promisedAt) : date(row.original.promisedAt)}
          </span>
        ),
      },
      actionsColumn<OrderTableRow>([
        { label: "View order", icon: Eye, href: (r) => `/sales/orders/${r.id}` },
        {
          label: "Print pick list",
          icon: Printer,
          onSelect: (r) => toast.info(`Pick list for ${r.number} sent to the printer`),
        },
        {
          label: "Start picking",
          icon: ClipboardList,
          separatorBefore: true,
          href: (r) => `/sales/orders/${r.id}?tab=fulfil`,
          hidden: (r) => !can("fulfillment", "edit") || r.status !== "reserved",
        },
        {
          label: "Pack",
          icon: Container,
          href: (r) => `/sales/orders/${r.id}?tab=fulfil`,
          hidden: (r) => !can("fulfillment", "edit") || r.status !== "picking",
        },
        {
          label: "Ship",
          icon: Truck,
          href: (r) => `/sales/orders/${r.id}?tab=fulfil`,
          hidden: (r) => !can("fulfillment", "edit") || r.status !== "packing",
        },
      ]),
    ],
    [can],
  );

  return (
    <DataTable
      tableId="sales-orders"
      columns={columns}
      data={rows}
      getRowId={(row) => row.id}
      searchPlaceholder="Search order number or customer…"
      initialSearch={initialSearch}
      exportName="sales-orders"
      canExport={can("sales-orders", "export")}
      totalLabel="sales orders"
      rowHref={(row) => `/sales/orders/${row.id}`}
      pageSize={50}
      defaultSort={[{ id: "placedAt", desc: true }]}
      defaultVisibility={{ shipToCity: false, fulfillmentStatus: false, channelLabel: false }}
      facets={[
        { columnId: "status", title: "Status", options: STATUS_OPTIONS },
        { columnId: "paymentStatus", title: "Payment", options: PAYMENT_OPTIONS },
        { columnId: "channelLabel", title: "Channel", options: CHANNEL_OPTIONS },
        {
          columnId: "warehouseCode",
          title: "Warehouse",
          options: warehouses.map((w) => ({ value: w, label: w })),
        },
        {
          columnId: "customer",
          title: "Customer",
          options: customers.map((c) => ({ value: c, label: c })),
        },
      ]}
      empty={
        <EmptyState
          icon={FileText}
          title="No sales orders match"
          description="A sales order reserves stock the moment it is confirmed, which is what makes available-to-promise different from on-hand."
          action={
            can("sales-orders", "create") ? (
              <Button size="sm" render={<Link href="/sales/orders/new" />}>
                New sales order
              </Button>
            ) : undefined
          }
        />
      }
      bulkActions={(selected, clear) =>
        can("fulfillment", "edit") ? (
          <Button
            size="sm"
            variant="secondary"
            className="h-7"
            onClick={() => {
              const pickable = selected.filter((r) => r.status === "reserved");
              if (pickable.length === 0) {
                toast.error("Nothing to release", {
                  description: "None of the selected orders have stock reserved and waiting.",
                });
                return;
              }
              toast.success(`${plural(pickable.length, "order")} released to picking`, {
                description: `${qty(pickable.reduce((s, r) => s + r.units, 0))} units on the pick list.`,
              });
              clear();
            }}
          >
            <ClipboardList className="size-3.5" aria-hidden />
            Release to picking
          </Button>
        ) : null
      }
    />
  );
}
