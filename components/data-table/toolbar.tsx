"use client";

import type { Table } from "@tanstack/react-table";
import {
  Columns3,
  Download,
  Rows2,
  Rows3,
  Rows4,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FacetedFilter, type FacetOption } from "./faceted-filter";
import { SavedViewsMenu } from "./saved-views-menu";
import { exportTableCsv } from "./export";

export type Density = "compact" | "default" | "comfortable";

export interface FacetConfig {
  columnId: string;
  title: string;
  options: FacetOption[];
}

export interface TableView {
  id: string;
  label: string;
  description?: string;
}

const DENSITY_ICON = { compact: Rows4, default: Rows3, comfortable: Rows2 } as const;

export function DataTableToolbar<TData>({
  table,
  tableId,
  searchPlaceholder = "Search…",
  facets = [],
  views,
  activeView,
  onViewChange,
  density,
  onDensityChange,
  exportName,
  canExport = true,
  extra,
}: {
  table: Table<TData>;
  tableId: string;
  searchPlaceholder?: string;
  facets?: FacetConfig[];
  views?: TableView[];
  activeView?: string;
  onViewChange?: (id: string) => void;
  density: Density;
  onDensityChange: (d: Density) => void;
  exportName: string;
  canExport?: boolean;
  extra?: React.ReactNode;
}) {
  const filtered = table.getState().columnFilters.length > 0 || Boolean(table.getState().globalFilter);
  const hideableColumns = table.getAllLeafColumns().filter((c) => c.getCanHide());
  const DensityIcon = DENSITY_ICON[density];

  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-surface px-3 py-2">
      <div className="relative min-w-[13rem] flex-1 sm:max-w-xs">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={(table.getState().globalFilter as string) ?? ""}
          onChange={(e) => table.setGlobalFilter(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="h-8 pl-8 text-[13px]"
        />
      </div>

      {facets.map((facet) => (
        <FacetedFilter
          key={facet.columnId}
          column={table.getColumn(facet.columnId)}
          title={facet.title}
          options={facet.options}
        />
      ))}

      {filtered && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          onClick={() => {
            table.resetColumnFilters();
            table.setGlobalFilter("");
          }}
        >
          Reset
          <X className="size-3.5" aria-hidden />
        </Button>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        {extra}

        <SavedViewsMenu
          table={table}
          tableId={tableId}
          builtIn={views}
          activeBuiltIn={activeView}
          onBuiltInChange={onViewChange}
        />

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                aria-label={`Row density: ${density}. Click to change.`}
                onClick={() =>
                  onDensityChange(
                    density === "compact" ? "default" : density === "default" ? "comfortable" : "compact",
                  )
                }
              />
            }
          >
            <DensityIcon className="size-3.5" aria-hidden />
          </TooltipTrigger>
          <TooltipContent>Row density — {density}</TooltipContent>
        </Tooltip>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="outline" size="icon" className="size-8" aria-label="Choose columns" />}
          >
            <Columns3 className="size-3.5" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-96 w-52 overflow-y-auto">
            <DropdownMenuLabel className="text-overline text-muted-foreground">Columns</DropdownMenuLabel>
            {hideableColumns.map((column) => {
              const meta = column.columnDef.meta as { label?: string } | undefined;
              return (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={column.getIsVisible()}
                  onCheckedChange={(checked) => column.toggleVisibility(Boolean(checked))}
                >
                  {meta?.label ?? column.id}
                </DropdownMenuCheckboxItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => table.resetColumnVisibility()}>
              Reset columns
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {canExport && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  aria-label="Export to CSV"
                  onClick={() => {
                    const result = exportTableCsv(table, exportName);
                    toast.success(`Exported ${result.rows} ${result.scope} rows`, {
                      description: `${exportName}.csv now matches the columns and filters on screen.`,
                    });
                  }}
                />
              }
            >
              <Download className="size-3.5" aria-hidden />
            </TooltipTrigger>
            <TooltipContent>Export what is on screen to CSV</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
