"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye, FileText, Pencil, UserRound } from "lucide-react";

import { DataTable } from "@/components/data-table/data-table";
import { ColumnHeader } from "@/components/data-table/column-header";
import { NumberCell, actionsColumn } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/status/status-badge";
import { MeterBar } from "@/components/status/meter-bar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/states";
import { useRole } from "@/components/providers/role-provider";
import { money, percent, qty, relative } from "@/lib/format";
import { humanize, statusMeta } from "@/lib/status";
import { cn } from "@/lib/utils";

export interface CustomerTableRow {
  id: string;
  code: string;
  name: string;
  type: string;
  typeLabel: string;
  contactName: string;
  email: string;
  city: string;
  country: string;
  status: string;
  creditLimit: number;
  outstanding: number;
  creditUsed: number;
  totalOrders: number;
  totalSpend: number;
  openOrders: number;
  lastOrderAt: string | null;
  since: string;
}

const STATUS_OPTIONS = (["active", "on-hold", "inactive"] as const).map((value) => ({
  value,
  label: statusMeta(value).label,
  tone: statusMeta(value).tone,
}));

const TYPE_OPTIONS = ["retail", "wholesale", "online", "government"].map((value) => ({
  value: humanize(value),
  label: humanize(value),
}));

export function CustomersTable({
  rows,
  countries,
}: {
  rows: CustomerTableRow[];
  countries: string[];
}) {
  const { can } = useRole();

  const columns = useMemo<ColumnDef<CustomerTableRow, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        size: 250,
        minSize: 180,
        meta: { label: "Customer" },
        header: ({ column }) => <ColumnHeader column={column} title="Customer" />,
        cell: ({ row }) => (
          <Link href={`/sales/customers/${row.original.id}`} className="grid min-w-0 gap-0.5">
            <span className="truncate font-medium hover:underline">{row.original.name}</span>
            <span className="text-code truncate text-[11px] text-muted-foreground">
              {row.original.code}
            </span>
          </Link>
        ),
      },
      {
        accessorKey: "status",
        size: 110,
        meta: { label: "Status" },
        header: ({ column }) => <ColumnHeader column={column} title="Status" />,
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
        cell: ({ getValue }) => <StatusBadge status={getValue<string>()} />,
      },
      {
        accessorKey: "typeLabel",
        size: 116,
        meta: { label: "Type" },
        header: ({ column }) => <ColumnHeader column={column} title="Type" />,
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
      },
      {
        accessorKey: "contactName",
        size: 180,
        meta: { label: "Contact" },
        header: ({ column }) => <ColumnHeader column={column} title="Contact" />,
        cell: ({ row }) => (
          <span className="grid min-w-0 gap-0.5">
            <span className="truncate">{row.original.contactName}</span>
            <span className="truncate text-[11px] text-muted-foreground">{row.original.email}</span>
          </span>
        ),
      },
      {
        accessorKey: "country",
        size: 150,
        meta: { label: "Location" },
        header: ({ column }) => <ColumnHeader column={column} title="Location" />,
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
        cell: ({ row }) => (
          <span className="truncate text-muted-foreground">
            {row.original.city}, {row.original.country}
          </span>
        ),
      },
      {
        accessorKey: "totalOrders",
        size: 92,
        meta: { label: "Orders", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Orders" align="right" />,
        cell: ({ getValue }) => <NumberCell value={qty(getValue<number>())} muted />,
      },
      {
        accessorKey: "openOrders",
        size: 92,
        meta: { label: "Open", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Open" align="right" />,
        cell: ({ getValue }) =>
          getValue<number>() > 0 ? (
            <NumberCell value={qty(getValue<number>())} className="font-medium text-status-info" />
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "totalSpend",
        size: 124,
        meta: { label: "Lifetime value", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Lifetime value" align="right" />,
        cell: ({ getValue }) => <NumberCell value={money(getValue<number>())} className="font-medium" />,
      },
      {
        accessorKey: "creditUsed",
        size: 168,
        meta: { label: "Credit used", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Credit used" align="right" />,
        cell: ({ row }) => {
          const used = row.original.creditUsed;
          const tone = used > 0.9 ? "danger" : used > 0.75 ? "warning" : "success";
          return (
            <span className="flex items-center justify-end gap-2">
              <MeterBar
                value={used}
                tone={tone}
                size="sm"
                className="w-14"
                label={`${row.original.name} is using ${percent(used, 0)} of a ${money(row.original.creditLimit)} credit limit`}
              />
              <NumberCell
                value={money(row.original.outstanding)}
                className={cn(
                  "w-16 text-right",
                  tone === "danger" && "font-semibold text-status-danger",
                  tone === "warning" && "font-semibold text-status-warning",
                )}
              />
            </span>
          );
        },
      },
      {
        accessorKey: "creditLimit",
        size: 116,
        meta: { label: "Credit limit", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Credit limit" align="right" />,
        cell: ({ getValue }) => <NumberCell value={money(getValue<number>())} muted />,
      },
      {
        accessorKey: "lastOrderAt",
        size: 116,
        meta: { label: "Last order", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Last order" align="right" />,
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">
            {getValue<string | null>() ? relative(getValue<string>()) : "never"}
          </span>
        ),
      },
      actionsColumn<CustomerTableRow>([
        { label: "View customer", icon: Eye, href: (r) => `/sales/customers/${r.id}` },
        {
          label: "New sales order",
          icon: FileText,
          href: () => "/sales/orders/new",
          hidden: () => !can("sales-orders", "create"),
        },
        {
          label: "Edit customer",
          icon: Pencil,
          separatorBefore: true,
          href: (r) => `/sales/customers/${r.id}?edit=1`,
          hidden: () => !can("customers", "edit"),
        },
      ]),
    ],
    [can],
  );

  return (
    <DataTable
      tableId="customers"
      columns={columns}
      data={rows}
      getRowId={(row) => row.id}
      searchPlaceholder="Search customer, code or contact…"
      exportName="customers"
      canExport={can("customers", "export")}
      totalLabel="customers"
      rowHref={(row) => `/sales/customers/${row.id}`}
      defaultSort={[{ id: "totalSpend", desc: true }]}
      defaultVisibility={{ creditLimit: false, contactName: false }}
      facets={[
        { columnId: "status", title: "Status", options: STATUS_OPTIONS },
        { columnId: "typeLabel", title: "Type", options: TYPE_OPTIONS },
        {
          columnId: "country",
          title: "Country",
          options: countries.map((c) => ({ value: c, label: c })),
        },
      ]}
      empty={
        <EmptyState
          icon={UserRound}
          title="No customers match"
          description="Customers are who you sell to. Their credit limit gates what can be ordered, and their order history drives demand planning."
          action={
            can("customers", "create") ? (
              <Button size="sm" render={<Link href="/sales/customers/new" />}>
                Add a customer
              </Button>
            ) : undefined
          }
        />
      }
    />
  );
}
