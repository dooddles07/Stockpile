"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Map as MapIcon } from "lucide-react";

import { DataTable } from "@/components/data-table/data-table";
import { ColumnHeader } from "@/components/data-table/column-header";
import { NumberCell } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/status/status-badge";
import { EmptyState } from "@/components/states";
import { useRole } from "@/components/providers/role-provider";
import { MeterBar, capacityTone } from "@/components/status/meter-bar";
import { percent, qty } from "@/lib/format";
import { humanize } from "@/lib/status";
import { cn } from "@/lib/utils";

export interface LocationTableRow {
  id: string;
  code: string;
  warehouseCode: string;
  warehouseName: string;
  warehouseId: string;
  zone: string;
  aisle: string;
  rack: string;
  bin: string;
  type: string;
  typeLabel: string;
  capacityUnits: number;
  occupiedUnits: number;
  fill: number;
  skuCount: number;
  restricted: boolean;
}

const TYPE_OPTIONS = ["bin", "shelf", "floor", "staging", "quarantine"].map((value) => ({
  value: humanize(value),
  label: humanize(value),
}));

export function LocationsTable({
  rows,
  warehouses,
}: {
  rows: LocationTableRow[];
  warehouses: string[];
}) {
  const { can } = useRole();

  const columns = useMemo<ColumnDef<LocationTableRow, unknown>[]>(
    () => [
      {
        accessorKey: "code",
        size: 140,
        meta: { label: "Location" },
        header: ({ column }) => <ColumnHeader column={column} title="Location" />,
        cell: ({ row }) => (
          <Link
            href={`/warehousing/warehouses/${row.original.warehouseId}?tab=locations`}
            className="text-code font-medium hover:underline"
          >
            {row.original.code}
          </Link>
        ),
      },
      {
        accessorKey: "warehouseCode",
        size: 100,
        meta: { label: "Warehouse" },
        header: ({ column }) => <ColumnHeader column={column} title="Site" />,
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
        cell: ({ row }) => (
          <span className="grid gap-0.5">
            <span className="font-medium">{row.original.warehouseCode}</span>
            <span className="truncate text-[11px] text-muted-foreground">
              {row.original.warehouseName.split(" ").slice(0, 2).join(" ")}
            </span>
          </span>
        ),
      },
      {
        accessorKey: "zone",
        size: 80,
        meta: { label: "Zone", align: "center" },
        header: ({ column }) => <ColumnHeader column={column} title="Zone" align="center" />,
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
        cell: ({ getValue }) => (
          <span className="inline-flex size-6 items-center justify-center rounded border bg-surface-sunken text-[11px] font-semibold">
            {getValue<string>()}
          </span>
        ),
      },
      {
        accessorKey: "aisle",
        size: 80,
        meta: { label: "Aisle", align: "center" },
        header: ({ column }) => <ColumnHeader column={column} title="Aisle" align="center" />,
        cell: ({ getValue }) => <span className="text-code">{getValue<string>()}</span>,
      },
      {
        accessorKey: "rack",
        size: 80,
        meta: { label: "Rack", align: "center" },
        header: ({ column }) => <ColumnHeader column={column} title="Rack" align="center" />,
        cell: ({ getValue }) => <span className="text-code">{getValue<string>()}</span>,
      },
      {
        accessorKey: "bin",
        size: 80,
        meta: { label: "Bin", align: "center" },
        header: ({ column }) => <ColumnHeader column={column} title="Bin" align="center" />,
        cell: ({ getValue }) => <span className="text-code">{getValue<string>()}</span>,
      },
      {
        accessorKey: "typeLabel",
        size: 120,
        meta: { label: "Type" },
        header: ({ column }) => <ColumnHeader column={column} title="Type" />,
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
      },
      {
        accessorKey: "skuCount",
        size: 88,
        meta: { label: "SKUs", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="SKUs" align="right" />,
        cell: ({ getValue }) => <NumberCell value={qty(getValue<number>())} muted />,
      },
      {
        accessorKey: "occupiedUnits",
        size: 108,
        meta: { label: "Occupied", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Occupied" align="right" />,
        cell: ({ getValue }) => <NumberCell value={qty(getValue<number>())} />,
      },
      {
        accessorKey: "capacityUnits",
        size: 108,
        meta: { label: "Capacity", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Capacity" align="right" />,
        cell: ({ getValue }) => <NumberCell value={qty(getValue<number>())} muted />,
      },
      {
        accessorKey: "fill",
        size: 140,
        meta: { label: "Fill", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Fill" align="right" />,
        cell: ({ row }) => {
          const fill = row.original.fill;
          return (
            <span className="flex items-center justify-end gap-2">
              <MeterBar
                value={fill}
                tone={capacityTone(fill)}
                size="sm"
                className="w-16"
                label={`${row.original.code} is ${percent(fill, 0)} occupied`}
              />
              <NumberCell
                value={percent(fill, 0)}
                className={cn(
                  "w-10 text-right",
                  fill > 0.95 && "font-semibold text-status-danger",
                  fill > 0.85 && fill <= 0.95 && "font-semibold text-status-warning",
                )}
              />
            </span>
          );
        },
      },
      {
        accessorKey: "restricted",
        size: 108,
        meta: { label: "Access" },
        header: ({ column }) => <ColumnHeader column={column} title="Access" />,
        cell: ({ getValue }) =>
          getValue<boolean>() ? (
            <StatusBadge label="Restricted" tone="purple" />
          ) : (
            <span className="text-muted-foreground">Open</span>
          ),
      },
    ],
    [],
  );

  return (
    <DataTable
      tableId="locations"
      columns={columns}
      data={rows}
      getRowId={(row) => row.id}
      searchPlaceholder="Search a location code…"
      exportName="stock-locations"
      canExport={can("locations", "export")}
      totalLabel="locations"
      pageSize={50}
      defaultSort={[{ id: "fill", desc: true }]}
      facets={[
        {
          columnId: "warehouseCode",
          title: "Warehouse",
          options: warehouses.map((w) => ({ value: w, label: w })),
        },
        {
          columnId: "zone",
          title: "Zone",
          options: ["A", "B", "C", "D"].map((z) => ({ value: z, label: `Zone ${z}` })),
        },
        { columnId: "typeLabel", title: "Type", options: TYPE_OPTIONS },
      ]}
      empty={
        <EmptyState
          icon={MapIcon}
          title="No locations match"
          description="Locations are the addressable places stock can sit — zone, aisle, rack and bin. Clear the filters to see the full map."
        />
      }
    />
  );
}
