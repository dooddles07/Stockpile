"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { History } from "lucide-react";

import { DataTable } from "@/components/data-table/data-table";
import { ColumnHeader } from "@/components/data-table/column-header";
import { NumberCell, PersonCell } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/status/status-badge";
import { EmptyState } from "@/components/states";
import { useRole } from "@/components/providers/role-provider";
import { dateTime, money, qty, signed, signedMoney } from "@/lib/format";
import { humanize } from "@/lib/status";
import type { MovementType, StatusTone } from "@/lib/types";

export interface MovementTableRow {
  id: string;
  ts: string;
  type: MovementType;
  typeLabel: string;
  sku: string;
  productName: string;
  productHref: string;
  warehouseCode: string;
  locationCode: string;
  qtyBefore: number;
  qtyChange: number;
  qtyAfter: number;
  unitCost: number;
  valueChange: number;
  refNumber: string;
  refHref: string | null;
  user: string;
  reason: string;
}

const TYPE_TONE: Record<MovementType, StatusTone> = {
  "purchase-receipt": "success",
  sale: "info",
  "transfer-out": "info",
  "transfer-in": "info",
  adjustment: "warning",
  "return-in": "purple",
  "return-out": "purple",
  damage: "danger",
  "count-correction": "warning",
};

const TYPE_OPTIONS = (Object.keys(TYPE_TONE) as MovementType[]).map((value) => ({
  value,
  label: humanize(value),
  tone: TYPE_TONE[value],
}));

export function MovementsTable({
  rows,
  warehouses,
  initialSearch,
}: {
  rows: MovementTableRow[];
  warehouses: string[];
  initialSearch?: string;
}) {
  const { can } = useRole();

  const columns = useMemo<ColumnDef<MovementTableRow, unknown>[]>(
    () => [
      {
        accessorKey: "ts",
        size: 150,
        meta: { label: "Timestamp" },
        header: ({ column }) => <ColumnHeader column={column} title="When" />,
        cell: ({ getValue }) => (
          <span className="text-code whitespace-nowrap text-muted-foreground">
            {dateTime(getValue<string>())}
          </span>
        ),
      },
      {
        accessorKey: "typeLabel",
        size: 148,
        meta: { label: "Movement" },
        header: ({ column }) => <ColumnHeader column={column} title="Movement" />,
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
        cell: ({ row }) => <StatusBadge label={row.original.typeLabel} tone={TYPE_TONE[row.original.type]} />,
      },
      {
        accessorKey: "sku",
        size: 240,
        minSize: 160,
        meta: { label: "Product" },
        header: ({ column }) => <ColumnHeader column={column} title="Product" />,
        cell: ({ row }) => (
          <Link href={row.original.productHref} className="grid min-w-0 gap-0.5 hover:underline">
            <span className="text-code font-medium">{row.original.sku}</span>
            <span className="truncate text-[11px] text-muted-foreground">{row.original.productName}</span>
          </Link>
        ),
      },
      {
        accessorKey: "warehouseCode",
        size: 88,
        meta: { label: "Site" },
        header: ({ column }) => <ColumnHeader column={column} title="Site" />,
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
      },
      {
        accessorKey: "locationCode",
        size: 104,
        meta: { label: "Location" },
        header: ({ column }) => <ColumnHeader column={column} title="Location" />,
        cell: ({ getValue }) => (
          <span className="text-code text-muted-foreground">{getValue<string>()}</span>
        ),
      },
      {
        accessorKey: "qtyBefore",
        size: 96,
        meta: { label: "Before", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Before" align="right" />,
        cell: ({ getValue }) => <NumberCell value={qty(getValue<number>())} muted />,
      },
      {
        accessorKey: "qtyChange",
        size: 100,
        meta: { label: "Change", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Change" align="right" />,
        cell: ({ getValue }) => (
          <NumberCell
            value={signed(getValue<number>())}
            className={
              getValue<number>() > 0
                ? "font-semibold text-status-success"
                : "font-semibold text-status-danger"
            }
          />
        ),
      },
      {
        accessorKey: "qtyAfter",
        size: 96,
        meta: { label: "After", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="After" align="right" />,
        cell: ({ getValue }) => <NumberCell value={qty(getValue<number>())} className="font-medium" />,
      },
      {
        accessorKey: "unitCost",
        size: 92,
        meta: { label: "Unit cost", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Unit cost" align="right" />,
        cell: ({ getValue }) => <NumberCell value={money(getValue<number>(), { cents: true })} muted />,
      },
      {
        accessorKey: "valueChange",
        size: 108,
        meta: { label: "Value impact", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Value" align="right" />,
        cell: ({ getValue }) => (
          <NumberCell
            value={signedMoney(getValue<number>())}
            className={getValue<number>() > 0 ? "text-status-success" : "text-status-danger"}
          />
        ),
      },
      {
        accessorKey: "refNumber",
        size: 132,
        meta: { label: "Reference" },
        header: ({ column }) => <ColumnHeader column={column} title="Reference" />,
        cell: ({ row }) =>
          row.original.refHref ? (
            <Link href={row.original.refHref} className="text-code hover:underline">
              {row.original.refNumber}
            </Link>
          ) : (
            <span className="text-code text-muted-foreground">{row.original.refNumber}</span>
          ),
      },
      {
        accessorKey: "user",
        size: 170,
        meta: { label: "User" },
        header: ({ column }) => <ColumnHeader column={column} title="User" />,
        cell: ({ getValue }) => <PersonCell name={getValue<string>()} />,
      },
      {
        accessorKey: "reason",
        size: 240,
        meta: { label: "Reason" },
        header: ({ column }) => <ColumnHeader column={column} title="Reason" />,
        cell: ({ getValue }) => (
          <span className="truncate text-muted-foreground">{getValue<string>()}</span>
        ),
      },
    ],
    [],
  );

  return (
    <DataTable
      tableId="movements"
      columns={columns}
      data={rows}
      getRowId={(row) => row.id}
      searchPlaceholder="Search SKU, reference or reason…"
      initialSearch={initialSearch}
      exportName="inventory-movements"
      canExport={can("movements", "export")}
      totalLabel="movements"
      pageSize={50}
      defaultSort={[{ id: "ts", desc: true }]}
      defaultVisibility={{ unitCost: false, locationCode: false }}
      facets={[
        { columnId: "typeLabel", title: "Movement type", options: TYPE_OPTIONS },
        {
          columnId: "warehouseCode",
          title: "Warehouse",
          options: warehouses.map((w) => ({ value: w, label: w })),
        },
      ]}
      empty={
        <EmptyState
          icon={History}
          title="No movements match"
          description="The ledger is append-only, so nothing has been removed — narrow or clear the filters to find the entry you are looking for."
        />
      }
    />
  );
}
