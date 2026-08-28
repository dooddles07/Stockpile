"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  Archive,
  ArrowLeftRight,
  Copy,
  Eye,
  Pencil,
  ShoppingCart,
  SlidersHorizontal,
  Tag,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { DataTable } from "@/components/data-table/data-table";
import { ColumnHeader } from "@/components/data-table/column-header";
import {
  CodeCell,
  NumberCell,
  actionsColumn,
  selectColumn,
} from "@/components/data-table/columns";
import { StatusBadge } from "@/components/status/status-badge";
import { ProductThumb } from "@/components/product/product-thumb";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/states";
import { useRole } from "@/components/providers/role-provider";
import { money, percent, qty, relative } from "@/lib/format";
import { statusMeta } from "@/lib/status";
import type { StockHealth } from "@/lib/types";

export interface ProductTableRow {
  id: string;
  sku: string;
  name: string;
  shortName: string;
  category: string;
  brand: string;
  supplier: string;
  status: string;
  health: StockHealth;
  available: number;
  reserved: number;
  incoming: number;
  onHand: number;
  reorderPoint: number;
  unitCost: number;
  sellPrice: number;
  margin: number;
  stockValue: number;
  sites: number;
  updatedAt: string;
  unit: string;
}

const HEALTH_OPTIONS = (["healthy", "low", "critical", "out-of-stock", "overstock"] as const).map(
  (value) => ({ value, label: statusMeta(value).label, tone: statusMeta(value).tone }),
);

const STATUS_OPTIONS = (["active", "draft", "discontinued", "archived"] as const).map((value) => ({
  value,
  label: statusMeta(value).label,
  tone: statusMeta(value).tone,
}));

export function ProductsTable({
  rows,
  categories,
  suppliers,
}: {
  rows: ProductTableRow[];
  categories: string[];
  suppliers: string[];
}) {
  const { can } = useRole();
  const canEdit = can("products", "edit");

  const columns = useMemo<ColumnDef<ProductTableRow, unknown>[]>(
    () => [
      selectColumn<ProductTableRow>(),
      {
        accessorKey: "name",
        size: 340,
        minSize: 200,
        meta: { label: "Product" },
        header: ({ column }) => <ColumnHeader column={column} title="Product" />,
        cell: ({ row }) => (
          <Link
            href={`/inventory/products/${row.original.sku}`}
            className="flex min-w-0 items-center gap-2.5"
          >
            <ProductThumb category={row.original.category} sku={row.original.sku} />
            <span className="grid min-w-0 gap-0.5">
              <span className="truncate font-medium hover:underline">{row.original.shortName}</span>
              <span className="text-code truncate text-muted-foreground">{row.original.sku}</span>
            </span>
          </Link>
        ),
      },
      {
        accessorKey: "category",
        size: 160,
        meta: { label: "Category" },
        header: ({ column }) => <ColumnHeader column={column} title="Category" />,
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
        cell: ({ getValue }) => <span className="truncate">{getValue<string>()}</span>,
      },
      {
        accessorKey: "brand",
        size: 110,
        meta: { label: "Brand" },
        header: ({ column }) => <ColumnHeader column={column} title="Brand" />,
      },
      {
        accessorKey: "supplier",
        size: 190,
        meta: { label: "Supplier" },
        header: ({ column }) => <ColumnHeader column={column} title="Supplier" />,
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
        cell: ({ getValue }) => (
          <span className="truncate text-muted-foreground">{getValue<string>()}</span>
        ),
      },
      {
        accessorKey: "health",
        size: 120,
        meta: { label: "Stock health" },
        header: ({ column }) => <ColumnHeader column={column} title="Health" />,
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
        cell: ({ getValue }) => <StatusBadge status={getValue<string>()} />,
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
        accessorKey: "reserved",
        size: 104,
        meta: { label: "Reserved", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Reserved" align="right" />,
        cell: ({ getValue }) => <NumberCell value={qty(getValue<number>())} muted />,
      },
      {
        accessorKey: "incoming",
        size: 104,
        meta: { label: "Incoming", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Incoming" align="right" />,
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
        accessorKey: "unitCost",
        size: 100,
        meta: { label: "Unit cost", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Cost" align="right" />,
        cell: ({ getValue }) => <NumberCell value={money(getValue<number>(), { cents: true })} />,
      },
      {
        accessorKey: "sellPrice",
        size: 100,
        meta: { label: "Sell price", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Price" align="right" />,
        cell: ({ getValue }) => <NumberCell value={money(getValue<number>(), { cents: true })} />,
      },
      {
        accessorKey: "margin",
        size: 80,
        meta: { label: "Margin", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Margin" align="right" />,
        cell: ({ getValue }) => <NumberCell value={percent(getValue<number>(), 0)} muted />,
      },
      {
        accessorKey: "stockValue",
        size: 108,
        meta: { label: "Stock value", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Stock value" align="right" />,
        cell: ({ getValue }) => <NumberCell value={money(getValue<number>())} />,
      },
      {
        accessorKey: "sites",
        size: 72,
        meta: { label: "Sites", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Sites" align="right" />,
        cell: ({ getValue }) => <NumberCell value={getValue<number>()} muted />,
      },
      {
        accessorKey: "unit",
        size: 84,
        meta: { label: "Unit" },
        header: ({ column }) => <ColumnHeader column={column} title="Unit" />,
        cell: ({ getValue }) => <CodeCell value={getValue<string>()} />,
      },
      {
        accessorKey: "status",
        size: 118,
        meta: { label: "Status" },
        header: ({ column }) => <ColumnHeader column={column} title="Status" />,
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
        cell: ({ getValue }) => <StatusBadge status={getValue<string>()} />,
      },
      {
        accessorKey: "updatedAt",
        size: 108,
        meta: { label: "Updated", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Updated" align="right" />,
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">{relative(getValue<string>())}</span>
        ),
      },
      actionsColumn<ProductTableRow>([
        { label: "View product", icon: Eye, href: (r) => `/inventory/products/${r.sku}` },
        {
          label: "Edit product",
          icon: Pencil,
          href: (r) => `/inventory/products/${r.sku}?edit=1`,
          hidden: () => !canEdit,
        },
        {
          label: "Copy SKU",
          icon: Copy,
          onSelect: (r) => {
            void navigator.clipboard?.writeText(r.sku);
            toast.success(`Copied ${r.sku}`);
          },
        },
        {
          label: "Raise purchase order",
          icon: ShoppingCart,
          href: () => "/purchasing/purchase-orders/new",
          separatorBefore: true,
          hidden: () => !can("purchase-orders", "create"),
        },
        {
          label: "Adjust stock",
          icon: SlidersHorizontal,
          href: () => "/inventory/adjustments/new",
          hidden: () => !can("adjustments", "create"),
        },
        {
          label: "Move stock",
          icon: ArrowLeftRight,
          href: () => "/warehousing/transfers/new",
          hidden: () => !can("transfers", "create"),
        },
        {
          label: "Archive",
          icon: Archive,
          destructive: true,
          separatorBefore: true,
          onSelect: (r) =>
            toast.warning(`${r.sku} would be archived`, {
              description: "Archiving hides the product from ordering but keeps its history.",
            }),
          hidden: () => !can("products", "delete"),
        },
      ]),
    ],
    [can, canEdit],
  );

  return (
    <DataTable
      tableId="products"
      columns={columns}
      data={rows}
      getRowId={(row) => row.id}
      searchPlaceholder="Search name, SKU or brand…"
      stickyColumn
      exportName="products"
      canExport={can("products", "export")}
      totalLabel="products"
      defaultSort={[{ id: "name", desc: false }]}
      defaultVisibility={{ brand: false, unit: false, sites: false, stockValue: false }}
      facets={[
        { columnId: "health", title: "Stock health", options: HEALTH_OPTIONS },
        { columnId: "status", title: "Status", options: STATUS_OPTIONS },
        {
          columnId: "category",
          title: "Category",
          options: categories.map((c) => ({ value: c, label: c })),
        },
        {
          columnId: "supplier",
          title: "Supplier",
          options: suppliers.map((s) => ({ value: s, label: s })),
        },
      ]}
      empty={
        <EmptyState
          icon={Tag}
          title="No products match these filters"
          description="Nothing in the catalogue matches the current search and filter combination. Clear the filters, or add the product if it does not exist yet."
          action={
            can("products", "create") ? (
              <Button size="sm" render={<Link href="/inventory/products/new" />}>
                Add a product
              </Button>
            ) : undefined
          }
        />
      }
      bulkActions={(selected, clear) => (
        <>
          {can("purchase-orders", "create") && (
            <Button
              size="sm"
              variant="secondary"
              className="h-7"
              render={<Link href="/purchasing/purchase-orders/new" />}
            >
              <ShoppingCart className="size-3.5" aria-hidden />
              Reorder {selected.length}
            </Button>
          )}
          {canEdit && (
            <Button
              size="sm"
              variant="secondary"
              className="h-7"
              onClick={() => {
                toast.success(`${selected.length} products queued for a category change`);
                clear();
              }}
            >
              <Tag className="size-3.5" aria-hidden />
              Change category
            </Button>
          )}
          {can("products", "delete") && (
            <Button
              size="sm"
              variant="secondary"
              className="h-7"
              onClick={() =>
                toast.warning(`${selected.length} products would be archived`, {
                  description: "History is retained; the products stop appearing in ordering.",
                })
              }
            >
              <Trash2 className="size-3.5" aria-hidden />
              Archive
            </Button>
          )}
        </>
      )}
    />
  );
}
