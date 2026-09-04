"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type Table as TanTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  X,
} from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTableToolbar, type Density, type FacetConfig, type TableView } from "./toolbar";
import { EmptyState } from "@/components/states";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { qty } from "@/lib/format";
import { cn } from "@/lib/utils";

const ROW_HEIGHT: Record<Density, string> = {
  compact: "h-9",
  default: "h-11",
  comfortable: "h-14",
};

const CELL_PAD: Record<Density, string> = {
  compact: "px-3 py-1",
  default: "px-3 py-2",
  comfortable: "px-3 py-3",
};

/** Pixel heights matching ROW_HEIGHT, for the virtualizer's size estimate. */
const ROW_PX: Record<Density, number> = { compact: 36, default: 44, comfortable: 56 };

/**
 * Below this, mounting every row is cheaper than the virtualizer's own
 * bookkeeping — and keeps Ctrl+F working on the whole page, which operators
 * use more than they admit.
 */
const VIRTUALIZE_ABOVE = 60;

export interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  /** Stable storage key for density and column visibility preferences. */
  tableId: string;
  getRowId?: (row: TData, index: number) => string;
  searchPlaceholder?: string;
  /** Seeds the search box — used when arriving from a deep link like ?q=SKU. */
  initialSearch?: string;
  facets?: FacetConfig[];
  views?: TableView[];
  activeView?: string;
  onViewChange?: (id: string) => void;
  /** Rendered above the table when rows are selected. */
  bulkActions?: (selected: TData[], clear: () => void) => React.ReactNode;
  rowHref?: (row: TData) => string;
  stickyColumn?: boolean;
  defaultSort?: SortingState;
  defaultVisibility?: VisibilityState;
  pageSize?: number;
  exportName: string;
  canExport?: boolean;
  toolbarExtra?: React.ReactNode;
  empty?: React.ReactNode;
  className?: string;
  /** Total row count when the caller has already narrowed the dataset. */
  totalLabel?: string;
}

export function DataTable<TData>({
  columns,
  data,
  tableId,
  getRowId,
  searchPlaceholder = "Search…",
  initialSearch = "",
  facets = [],
  views,
  activeView,
  onViewChange,
  bulkActions,
  rowHref,
  stickyColumn = false,
  defaultSort = [],
  defaultVisibility = {},
  pageSize = 25,
  exportName,
  canExport = true,
  toolbarExtra,
  empty,
  className,
  totalLabel = "rows",
}: DataTableProps<TData>) {
  const router = useRouter();
  const [sorting, setSorting] = React.useState<SortingState>(defaultSort);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = React.useState(initialSearch);
  const [rowSelection, setRowSelection] = React.useState({});
  const [columnVisibility, setColumnVisibility] = useLocalStorage<VisibilityState>(
    `stockpile:cols:${tableId}`,
    defaultVisibility,
  );
  const [density, setDensity] = useLocalStorage<Density>(`stockpile:density:${tableId}`, "default");

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, globalFilter, columnVisibility, rowSelection },
    getRowId,
    enableColumnResizing: true,
    columnResizeMode: "onChange",
    enableMultiSort: true,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: (updater) =>
      setColumnVisibility(typeof updater === "function" ? updater(columnVisibility) : updater),
    onRowSelectionChange: setRowSelection,
    globalFilterFn: "includesString",
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    initialState: { pagination: { pageSize } },
  });

  const selectedRows = table.getSelectedRowModel().rows.map((r) => r.original);
  const clearSelection = () => setRowSelection({});
  const filteredRows = table.getFilteredRowModel().rows;

  /**
   * The header checkbox only reaches the current page, which is the honest
   * behaviour — but an operator who filtered to 340 rows and wants to act on
   * all of them should not have to page through them. Offer the wider
   * selection explicitly rather than silently changing what the checkbox means.
   */
  const pageFullySelected = table.getIsAllPageRowsSelected();
  const canSelectAllMatching =
    pageFullySelected && filteredRows.length > selectedRows.length;
  const selectAllMatching = () =>
    setRowSelection(
      Object.fromEntries(filteredRows.map((row) => [row.id, true])),
    );
  const rows = table.getRowModel().rows;

  // Virtualize only the long pages. At 25 rows the spacer rows and measurement
  // cost more than they save; at 200 they are the difference between a table
  // that scrolls and one that stutters.
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const virtualize = rows.length > VIRTUALIZE_ABOVE;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_PX[density],
    overscan: 12,
    enabled: virtualize,
  });
  const virtualRows = virtualizer.getVirtualItems();
  const paddingTop = virtualize && virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom =
    virtualize && virtualRows.length > 0
      ? virtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
      : 0;
  const visibleRows = virtualize ? virtualRows.map((v) => rows[v.index]) : rows;

  return (
    <div className={cn("overflow-hidden rounded-lg border bg-surface", className)}>
      <DataTableToolbar
        table={table}
        tableId={tableId}
        searchPlaceholder={searchPlaceholder}
        facets={facets}
        views={views}
        activeView={activeView}
        onViewChange={onViewChange}
        density={density}
        onDensityChange={setDensity}
        exportName={exportName}
        canExport={canExport}
        extra={toolbarExtra}
      />

      {bulkActions && selectedRows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-primary px-3 py-2 text-primary-foreground">
          <span className="text-[13px] font-medium" role="status">
            {qty(selectedRows.length)} selected
          </span>
          {canSelectAllMatching && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-primary-foreground underline underline-offset-2 hover:bg-primary-foreground/15 hover:text-primary-foreground"
              onClick={selectAllMatching}
            >
              Select all {qty(filteredRows.length)} matching
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
            onClick={clearSelection}
          >
            <X className="size-3.5" aria-hidden />
            Clear
          </Button>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {bulkActions(selectedRows, clearSelection)}
          </div>
        </div>
      )}

      <div ref={scrollRef} className="relative max-h-[calc(100vh-19rem)] overflow-auto">
        <Table
          className="border-separate border-spacing-0 text-table"
          style={{ width: table.getCenterTotalSize() }}
        >
          <TableHeader className="sticky top-0 z-20">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header, i) => {
                  const meta = header.column.columnDef.meta as
                    | { label?: string; align?: "left" | "right" | "center"; sticky?: boolean }
                    | undefined;
                  const isSticky = stickyColumn && (header.column.id === "select" || i <= 1);
                  return (
                    <TableHead
                      key={header.id}
                      style={{ width: header.getSize() }}
                      className={cn(
                        "relative select-none border-b bg-surface-sunken px-2.5 text-[11px] font-semibold uppercase text-muted-foreground",
                        meta?.align === "right" && "text-right",
                        meta?.align === "center" && "text-center",
                        isSticky && "sticky z-30 bg-surface-sunken",
                        header.column.id === "select" && "left-0",
                        isSticky && header.column.id !== "select" && "left-10 border-r",
                      )}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanResize() && (
                        <span
                          onMouseDown={header.getResizeHandler()}
                          onTouchStart={header.getResizeHandler()}
                          onDoubleClick={() => header.column.resetSize()}
                          role="separator"
                          aria-orientation="vertical"
                          aria-label={`Resize ${(header.column.columnDef.meta as { label?: string } | undefined)?.label ?? header.column.id} column`}
                          className={cn(
                            "absolute right-0 top-0 h-full w-1 cursor-col-resize touch-none select-none bg-transparent transition-colors hover:bg-border-strong",
                            header.column.getIsResizing() && "bg-primary",
                          )}
                        />
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={table.getVisibleLeafColumns().length} className="p-0">
                  {empty ?? (
                    <EmptyState
                      title="No matching rows"
                      description="Nothing here matches the current search and filters. Clear them to see the full list."
                      action={
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            table.resetColumnFilters();
                            table.setGlobalFilter("");
                          }}
                        >
                          Clear filters
                        </Button>
                      }
                    />
                  )}
                </TableCell>
              </TableRow>
            ) : (
              <>
                {paddingTop > 0 && (
                  <tr aria-hidden style={{ height: paddingTop }}>
                    <td colSpan={table.getVisibleLeafColumns().length} />
                  </tr>
                )}
                {visibleRows.map((row) => {
                const href = rowHref?.(row.original);
                return (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() ? "selected" : undefined}
                    tabIndex={href ? 0 : undefined}
                    className={cn(
                      ROW_HEIGHT[density],
                      "group/row border-b transition-colors",
                      href && "cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
                    )}
                    onClick={
                      href
                        ? (e) => {
                            const target = e.target as HTMLElement;
                            // Never hijack a click on a control inside the row.
                            if (target.closest("button, a, input, [role='checkbox'], [role='menu']")) return;
                            router.push(href);
                          }
                        : undefined
                    }
                    onKeyDown={
                      href
                        ? (e) => {
                            if (e.key !== "Enter" && e.key !== " ") return;
                            const target = e.target as HTMLElement;
                            if (target.closest("button, a, input, [role='checkbox'], [role='menu']")) return;
                            e.preventDefault();
                            router.push(href);
                          }
                        : undefined
                    }
                  >
                    {row.getVisibleCells().map((cell, i) => {
                      const meta = cell.column.columnDef.meta as
                        | { align?: "left" | "right" | "center" }
                        | undefined;
                      const isSticky = stickyColumn && (cell.column.id === "select" || i <= 1);
                      return (
                        <TableCell
                          key={cell.id}
                          style={{ width: cell.column.getSize() }}
                          className={cn(
                            CELL_PAD[density],
                            "border-b align-middle",
                            meta?.align === "right" && "text-right",
                            meta?.align === "center" && "text-center",
                            isSticky &&
                              "sticky z-10 bg-surface group-hover/row:bg-surface-hover group-data-[state=selected]/row:bg-accent",
                            cell.column.id === "select" && "left-0",
                            isSticky && cell.column.id !== "select" && "left-10 border-r",
                          )}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
                })}
                {paddingBottom > 0 && (
                  <tr aria-hidden style={{ height: paddingBottom }}>
                    <td colSpan={table.getVisibleLeafColumns().length} />
                  </tr>
                )}
              </>
            )}
          </TableBody>
        </Table>
      </div>

      <TablePagination table={table} totalLabel={totalLabel} />
    </div>
  );
}

function TablePagination<TData>({
  table,
  totalLabel,
}: {
  table: TanTable<TData>;
  totalLabel: string;
}) {
  const { pageIndex, pageSize } = table.getState().pagination;
  const total = table.getFilteredRowModel().rows.length;
  const first = total === 0 ? 0 : pageIndex * pageSize + 1;
  const last = Math.min(total, (pageIndex + 1) * pageSize);
  const selected = table.getSelectedRowModel().rows.length;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-surface px-3 py-2">
      <p className="text-caption text-muted-foreground">
        <span className="tabular font-medium text-foreground" data-numeric>
          {qty(first)}–{qty(last)}
        </span>{" "}
        of <span className="tabular font-medium text-foreground" data-numeric>{qty(total)}</span> {totalLabel}
        {selected > 0 && <> · {qty(selected)} selected</>}
      </p>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-caption text-muted-foreground">
          Rows
          <Select
            value={String(pageSize)}
            onValueChange={(v) => table.setPageSize(Number(v))}
          >
            <SelectTrigger size="sm" className="h-7 w-[4.5rem] text-[12px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[25, 50, 100, 200].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <div className="flex items-center gap-1">
          <span className="mr-1 text-caption tabular text-muted-foreground" data-numeric>
            Page {pageIndex + 1} of {Math.max(1, table.getPageCount())}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="size-7"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
            aria-label="First page"
          >
            <ChevronsLeft className="size-3.5" aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-7"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label="Previous page"
          >
            <ChevronLeft className="size-3.5" aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-7"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label="Next page"
          >
            <ChevronRight className="size-3.5" aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-7"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
            aria-label="Last page"
          >
            <ChevronsRight className="size-3.5" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}
