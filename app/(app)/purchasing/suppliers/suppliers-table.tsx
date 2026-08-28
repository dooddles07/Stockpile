"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye, Pencil, ShoppingCart, Truck } from "lucide-react";

import { DataTable } from "@/components/data-table/data-table";
import { ColumnHeader } from "@/components/data-table/column-header";
import { NumberCell, actionsColumn } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/status/status-badge";
import { MeterBar } from "@/components/status/meter-bar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/states";
import { useRole } from "@/components/providers/role-provider";
import { money, percent, qty } from "@/lib/format";
import { statusMeta } from "@/lib/status";
import { cn } from "@/lib/utils";

export interface SupplierTableRow {
  id: string;
  code: string;
  name: string;
  contactName: string;
  email: string;
  city: string;
  country: string;
  status: string;
  paymentTerms: string;
  leadTimeDays: number;
  onTimeRate: number;
  fulfillmentRate: number;
  defectRate: number;
  totalSpend: number;
  openOrders: number;
  skuCount: number;
  categories: string[];
}

const STATUS_OPTIONS = (["active", "on-hold", "inactive"] as const).map((value) => ({
  value,
  label: statusMeta(value).label,
  tone: statusMeta(value).tone,
}));

/** Shared thresholds so a supplier reads the same on every screen. */
function onTimeTone(rate: number) {
  if (rate >= 0.95) return "success" as const;
  if (rate >= 0.85) return "warning" as const;
  return "danger" as const;
}

export function SuppliersTable({
  rows,
  countries,
}: {
  rows: SupplierTableRow[];
  countries: string[];
}) {
  const { can } = useRole();

  const columns = useMemo<ColumnDef<SupplierTableRow, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        size: 260,
        minSize: 180,
        meta: { label: "Supplier" },
        header: ({ column }) => <ColumnHeader column={column} title="Supplier" />,
        cell: ({ row }) => (
          <Link href={`/purchasing/suppliers/${row.original.id}`} className="grid min-w-0 gap-0.5">
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
        accessorKey: "contactName",
        size: 170,
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
        accessorKey: "leadTimeDays",
        size: 104,
        meta: { label: "Lead time", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Lead time" align="right" />,
        cell: ({ getValue }) => (
          <NumberCell
            value={`${getValue<number>()}d`}
            className={getValue<number>() > 30 ? "text-status-warning" : ""}
          />
        ),
      },
      {
        accessorKey: "onTimeRate",
        size: 148,
        meta: { label: "On time", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="On time" align="right" />,
        cell: ({ row }) => {
          const rate = row.original.onTimeRate;
          const tone = onTimeTone(rate);
          return (
            <span className="flex items-center justify-end gap-2">
              <MeterBar
                value={rate}
                tone={tone}
                size="sm"
                className="w-14"
                label={`${row.original.name} delivers on time ${percent(rate, 1)} of the time`}
              />
              <NumberCell
                value={percent(rate, 1)}
                className={cn(
                  "w-12 text-right",
                  tone === "danger" && "font-semibold text-status-danger",
                  tone === "warning" && "font-semibold text-status-warning",
                )}
              />
            </span>
          );
        },
      },
      {
        accessorKey: "fulfillmentRate",
        size: 116,
        meta: { label: "Fill rate", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Fill rate" align="right" />,
        cell: ({ getValue }) => <NumberCell value={percent(getValue<number>(), 1)} muted />,
      },
      {
        accessorKey: "defectRate",
        size: 112,
        meta: { label: "Defects", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Defects" align="right" />,
        cell: ({ getValue }) => (
          <NumberCell
            value={percent(getValue<number>(), 2)}
            className={
              getValue<number>() > 0.04
                ? "font-semibold text-status-danger"
                : getValue<number>() > 0.02
                  ? "text-status-warning"
                  : "text-muted-foreground"
            }
          />
        ),
      },
      {
        accessorKey: "skuCount",
        size: 88,
        meta: { label: "SKUs", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="SKUs" align="right" />,
        cell: ({ getValue }) => <NumberCell value={qty(getValue<number>())} muted />,
      },
      {
        accessorKey: "openOrders",
        size: 100,
        meta: { label: "Open POs", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Open POs" align="right" />,
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
        meta: { label: "Total spend", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Total spend" align="right" />,
        cell: ({ getValue }) => <NumberCell value={money(getValue<number>())} />,
      },
      {
        accessorKey: "paymentTerms",
        size: 116,
        meta: { label: "Terms" },
        header: ({ column }) => <ColumnHeader column={column} title="Terms" />,
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">{getValue<string>()}</span>
        ),
      },
      actionsColumn<SupplierTableRow>([
        { label: "View supplier", icon: Eye, href: (r) => `/purchasing/suppliers/${r.id}` },
        {
          label: "Raise a purchase order",
          icon: ShoppingCart,
          href: () => "/purchasing/purchase-orders/new",
          hidden: () => !can("purchase-orders", "create"),
        },
        {
          label: "Edit supplier",
          icon: Pencil,
          separatorBefore: true,
          href: (r) => `/purchasing/suppliers/${r.id}?edit=1`,
          hidden: () => !can("suppliers", "edit"),
        },
      ]),
    ],
    [can],
  );

  return (
    <DataTable
      tableId="suppliers"
      columns={columns}
      data={rows}
      getRowId={(row) => row.id}
      searchPlaceholder="Search supplier, code or contact…"
      exportName="suppliers"
      canExport={can("suppliers", "export")}
      totalLabel="suppliers"
      rowHref={(row) => `/purchasing/suppliers/${row.id}`}
      defaultSort={[{ id: "totalSpend", desc: true }]}
      defaultVisibility={{ fulfillmentRate: false, paymentTerms: false, skuCount: false }}
      facets={[
        { columnId: "status", title: "Status", options: STATUS_OPTIONS },
        {
          columnId: "country",
          title: "Country",
          options: countries.map((c) => ({ value: c, label: c })),
        },
      ]}
      empty={
        <EmptyState
          icon={Truck}
          title="No suppliers match"
          description="Suppliers are who you buy from. Their lead time and reliability drive reorder points and the purchase suggestions the automation raises."
          action={
            can("suppliers", "create") ? (
              <Button size="sm" render={<Link href="/purchasing/suppliers/new" />}>
                Add a supplier
              </Button>
            ) : undefined
          }
        />
      }
    />
  );
}
