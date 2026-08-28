"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQueryState } from "nuqs";
import type { ColumnDef } from "@tanstack/react-table";
import {
  ArrowLeftRight,
  ClipboardCheck,
  Eye,
  PackageSearch,
  ShoppingCart,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";

import { DataTable } from "@/components/data-table/data-table";
import { ColumnHeader } from "@/components/data-table/column-header";
import { NumberCell, actionsColumn, selectColumn } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/status/status-badge";
import { ProductThumb } from "@/components/product/product-thumb";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/states";
import { useRole } from "@/components/providers/role-provider";
import { money, plural, qty, relative } from "@/lib/format";
import { statusMeta } from "@/lib/status";
import { STOCK_VIEWS, type StockViewKey } from "@/lib/repo/inventory";
import type { StockHealth } from "@/lib/types";

export interface StockTableRow {
  id: string;
  sku: string;
  name: string;
  category: string;
  warehouseCode: string;
  warehouseName: string;
  locationCode: string;
  onHand: number;
  reserved: number;
  damaged: number;
  available: number;
  incoming: number;
  inTransit: number;
  reorderPoint: number;
  unitCost: number;
  value: number;
  health: StockHealth;
  expiresAt: string | null;
  daysToExpiry: number | null;
  lotNumber: string | null;
  lastCountedAt: string | null;
}

const HEALTH_OPTIONS = (["healthy", "low", "critical", "out-of-stock", "overstock"] as const).map(
  (value) => ({ value, label: statusMeta(value).label, tone: statusMeta(value).tone }),
);

const VIEW_EMPTY: Record<StockViewKey, { title: string; description: string }> = {
  all: {
    title: "No stock records",
    description: "Nothing matches the current search and filters across any warehouse.",
  },
  "low-stock": {
    title: "Nothing is running low",
    description:
      "Every SKU with a reorder point is currently above it. This view fills up as stock is drawn down.",
  },
  critical: {
    title: "No critical shortages",
    description: "Nothing has fallen under 40% of its reorder point.",
  },
  "out-of-stock": {
    title: "Nothing is out of stock",
    description: "Every active SKU has at least some quantity available to allocate.",
  },
  overstock: {
    title: "No overstock detected",
    description:
      "No SKU is holding more than six times its reorder point, so no capital is obviously sitting still.",
  },
  expiring: {
    title: "Nothing expires soon",
    description: "No tracked lot reaches its expiry date in the next 30 days.",
  },
};

export function StockTable({
  rows,
  view,
  warehouses,
  categories,
}: {
  rows: StockTableRow[];
  view: StockViewKey;
  warehouses: string[];
  categories: string[];
}) {
  const { can } = useRole();
  const [, setView] = useQueryState("view", { defaultValue: "all", clearOnDefault: true });

  const showExpiry = view === "expiring" || rows.some((r) => r.expiresAt);

  const columns = useMemo<ColumnDef<StockTableRow, unknown>[]>(
    () => [
      selectColumn<StockTableRow>(),
      {
        accessorKey: "name",
        size: 320,
        minSize: 180,
        meta: { label: "Product" },
        header: ({ column }) => <ColumnHeader column={column} title="Product" />,
        cell: ({ row }) => (
          <Link href={`/inventory/products/${row.original.sku}`} className="flex min-w-0 items-center gap-2.5">
            <ProductThumb category={row.original.category} sku={row.original.sku} />
            <span className="grid min-w-0 gap-0.5">
              <span className="truncate font-medium hover:underline">{row.original.name}</span>
              <span className="text-code truncate text-muted-foreground">{row.original.sku}</span>
            </span>
          </Link>
        ),
      },
      {
        accessorKey: "warehouseCode",
        size: 96,
        meta: { label: "Warehouse" },
        header: ({ column }) => <ColumnHeader column={column} title="Site" />,
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
        cell: ({ row }) => (
          <span className="grid gap-0.5">
            <span className="font-medium">{row.original.warehouseCode}</span>
            <span className="truncate text-[11px] text-muted-foreground">
              {row.original.warehouseName.replace(/ (Distribution Center|Fulfillment Center|Retail Depot|Cold Storage)$/, "")}
            </span>
          </span>
        ),
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
        accessorKey: "category",
        size: 150,
        meta: { label: "Category" },
        header: ({ column }) => <ColumnHeader column={column} title="Category" />,
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
      },
      {
        accessorKey: "health",
        size: 118,
        meta: { label: "Health" },
        header: ({ column }) => <ColumnHeader column={column} title="Health" />,
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
        cell: ({ getValue }) => <StatusBadge status={getValue<string>()} />,
      },
      {
        accessorKey: "onHand",
        size: 100,
        meta: { label: "On hand", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="On hand" align="right" />,
        cell: ({ getValue }) => <NumberCell value={qty(getValue<number>())} />,
      },
      {
        accessorKey: "reserved",
        size: 104,
        meta: { label: "Reserved", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Reserved" align="right" />,
        cell: ({ getValue }) => <NumberCell value={qty(getValue<number>())} muted />,
      },
      {
        accessorKey: "damaged",
        size: 100,
        meta: { label: "Damaged", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Damaged" align="right" />,
        cell: ({ getValue }) =>
          getValue<number>() > 0 ? (
            <NumberCell value={qty(getValue<number>())} className="text-status-danger" />
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "available",
        size: 108,
        meta: { label: "Available", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Available" align="right" />,
        cell: ({ row }) => (
          <NumberCell
            value={qty(row.original.available)}
            className={
              row.original.available === 0
                ? "font-semibold text-status-danger"
                : row.original.available < row.original.reorderPoint
                  ? "font-semibold text-status-warning"
                  : "font-medium"
            }
          />
        ),
      },
      {
        accessorKey: "incoming",
        size: 104,
        meta: { label: "Incoming", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Incoming" align="right" />,
        cell: ({ getValue }) => <NumberCell value={qty(getValue<number>())} muted />,
      },
      {
        accessorKey: "inTransit",
        size: 108,
        meta: { label: "In transit", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="In transit" align="right" />,
        cell: ({ getValue }) => <NumberCell value={qty(getValue<number>())} muted />,
      },
      {
        accessorKey: "reorderPoint",
        size: 108,
        meta: { label: "Reorder at", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Reorder at" align="right" />,
        cell: ({ getValue }) => <NumberCell value={qty(getValue<number>())} muted />,
      },
      {
        accessorKey: "value",
        size: 104,
        meta: { label: "Stock value", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Value" align="right" />,
        cell: ({ getValue }) => <NumberCell value={money(getValue<number>())} />,
      },
      {
        accessorKey: "lotNumber",
        size: 132,
        meta: { label: "Lot" },
        header: ({ column }) => <ColumnHeader column={column} title="Lot" />,
        cell: ({ getValue }) =>
          getValue<string | null>() ? (
            <span className="text-code text-muted-foreground">{getValue<string>()}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "daysToExpiry",
        size: 108,
        meta: { label: "Expiry", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Expiry" align="right" />,
        cell: ({ row }) => {
          const d = row.original.daysToExpiry;
          if (d === null) return <span className="text-muted-foreground">—</span>;
          return (
            <NumberCell
              value={d < 0 ? `${Math.abs(d)}d overdue` : `${d}d`}
              className={d < 0 ? "font-semibold text-status-danger" : d <= 30 ? "text-status-warning" : ""}
            />
          );
        },
      },
      {
        accessorKey: "lastCountedAt",
        size: 108,
        meta: { label: "Last counted", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Counted" align="right" />,
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">
            {getValue<string | null>() ? relative(getValue<string>()) : "never"}
          </span>
        ),
      },
      actionsColumn<StockTableRow>([
        { label: "View product", icon: Eye, href: (r) => `/inventory/products/${r.sku}` },
        {
          label: "Adjust this line",
          icon: SlidersHorizontal,
          href: () => "/inventory/adjustments/new",
          hidden: () => !can("adjustments", "create"),
        },
        {
          label: "Move to another site",
          icon: ArrowLeftRight,
          href: () => "/warehousing/transfers/new",
          hidden: () => !can("transfers", "create"),
        },
        {
          label: "Count this location",
          icon: ClipboardCheck,
          href: () => "/inventory/counts/new",
          hidden: () => !can("counts", "create"),
        },
      ]),
    ],
    [can],
  );

  const emptyCopy = VIEW_EMPTY[view];

  return (
    <DataTable
      tableId="stock-levels"
      columns={columns}
      data={rows}
      getRowId={(row) => row.id}
      searchPlaceholder="Search SKU, product or location…"
      stickyColumn
      exportName={`stock-${view}`}
      canExport={can("stock", "export")}
      totalLabel="stock records"
      pageSize={50}
      defaultSort={[{ id: "available", desc: false }]}
      defaultVisibility={{
        inTransit: false,
        lotNumber: showExpiry,
        daysToExpiry: showExpiry,
        lastCountedAt: false,
        category: false,
      }}
      views={Object.entries(STOCK_VIEWS).map(([id, v]) => ({
        id,
        label: v.label,
        description: v.description,
      }))}
      activeView={view}
      onViewChange={(id) => setView(id === "all" ? null : id)}
      facets={[
        { columnId: "health", title: "Health", options: HEALTH_OPTIONS },
        {
          columnId: "warehouseCode",
          title: "Warehouse",
          options: warehouses.map((w) => ({ value: w, label: w })),
        },
        {
          columnId: "category",
          title: "Category",
          options: categories.map((c) => ({ value: c, label: c })),
        },
      ]}
      empty={
        <EmptyState
          icon={PackageSearch}
          title={emptyCopy.title}
          description={emptyCopy.description}
          action={
            view !== "all" ? (
              <Button variant="outline" size="sm" onClick={() => setView(null)}>
                Show all stock
              </Button>
            ) : undefined
          }
        />
      }
      bulkActions={(selected, clear) => (
        <>
          {can("purchase-orders", "create") && (
            <Button size="sm" variant="secondary" className="h-7" render={<Link href="/purchasing/purchase-orders/new" />}>
              <ShoppingCart className="size-3.5" aria-hidden />
              Reorder {selected.length}
            </Button>
          )}
          {can("transfers", "create") && (
            <Button size="sm" variant="secondary" className="h-7" render={<Link href="/warehousing/transfers/new" />}>
              <ArrowLeftRight className="size-3.5" aria-hidden />
              Transfer
            </Button>
          )}
          {can("counts", "create") && (
            <Button
              size="sm"
              variant="secondary"
              className="h-7"
              onClick={() => {
                toast.success(`Count scheduled for ${plural(selected.length, "line")}`, {
                  description: "Assign counters from the stock count you just created.",
                });
                clear();
              }}
            >
              <ClipboardCheck className="size-3.5" aria-hidden />
              Schedule count
            </Button>
          )}
        </>
      )}
    />
  );
}
