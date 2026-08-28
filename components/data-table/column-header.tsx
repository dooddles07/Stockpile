"use client";

import type { Column } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, EyeOff } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * Sortable header. Shift-click adds a secondary sort rather than replacing the
 * first — operators sort by warehouse then by SKU constantly.
 */
export function ColumnHeader<TData, TValue>({
  column,
  title,
  align = "left",
  className,
}: {
  column: Column<TData, TValue>;
  title: string;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  const alignClass =
    align === "right" ? "justify-end text-right" : align === "center" ? "justify-center" : "justify-start";

  if (!column.getCanSort()) {
    return <span className={cn("flex items-center", alignClass, className)}>{title}</span>;
  }

  const sorted = column.getIsSorted();
  const index = column.getSortIndex();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className={cn(
              "-mx-1.5 flex h-6 w-full items-center gap-1 rounded px-1.5 transition-colors hover:bg-surface-hover data-[popup-open]:bg-surface-hover",
              alignClass,
              className,
            )}
          />
        }
      >
        <span className="truncate">{title}</span>
        {sorted === "asc" ? (
          <ArrowUp className="size-3.5 shrink-0 text-foreground" aria-hidden />
        ) : sorted === "desc" ? (
          <ArrowDown className="size-3.5 shrink-0 text-foreground" aria-hidden />
        ) : (
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground/60" aria-hidden />
        )}
        {sorted && index > 0 && (
          <span className="text-[10px] font-semibold text-muted-foreground">{index + 1}</span>
        )}
        <span className="sr-only">
          {sorted === "asc" ? "sorted ascending" : sorted === "desc" ? "sorted descending" : "not sorted"}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuItem onClick={() => column.toggleSorting(false)}>
          <ArrowUp className="size-4 text-muted-foreground" aria-hidden />
          Ascending
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => column.toggleSorting(true)}>
          <ArrowDown className="size-4 text-muted-foreground" aria-hidden />
          Descending
        </DropdownMenuItem>
        {sorted && (
          <DropdownMenuItem onClick={() => column.clearSorting()}>
            <ChevronsUpDown className="size-4 text-muted-foreground" aria-hidden />
            Clear sort
          </DropdownMenuItem>
        )}
        {column.getCanHide() && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => column.toggleVisibility(false)}>
              <EyeOff className="size-4 text-muted-foreground" aria-hidden />
              Hide column
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
