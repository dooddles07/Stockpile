"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";

/** Row-selection column. Same everywhere so bulk actions behave identically. */
export function selectColumn<T>(): ColumnDef<T, unknown> {
  return {
    id: "select",
    size: 40,
    enableSorting: false,
    enableHiding: false,
    enableResizing: false,
    meta: { label: "Select" },
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        indeterminate={table.getIsSomePageRowsSelected()}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(Boolean(value))}
        aria-label="Select all rows on this page"
        className="translate-y-px"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
        aria-label="Select row"
        className="translate-y-px"
      />
    ),
  };
}

export interface RowAction<T> {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  href?: (row: T) => string;
  onSelect?: (row: T) => void;
  destructive?: boolean;
  separatorBefore?: boolean;
  hidden?: (row: T) => boolean;
}

export function actionsColumn<T>(actions: RowAction<T>[]): ColumnDef<T, unknown> {
  return {
    id: "actions",
    size: 48,
    enableSorting: false,
    enableHiding: false,
    enableResizing: false,
    meta: { label: "Actions", align: "right" },
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) => {
      const visible = actions.filter((a) => !a.hidden?.(row.original));
      if (visible.length === 0) return null;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="size-7 opacity-60 transition-opacity group-hover/row:opacity-100 data-[popup-open]:opacity-100"
                aria-label="Row actions"
              />
            }
          >
            <MoreHorizontal className="size-4" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {visible.map((action, i) => (
              <div key={action.label}>
                {action.separatorBefore && i > 0 && <DropdownMenuSeparator />}
                <DropdownMenuItem
                  variant={action.destructive ? "destructive" : "default"}
                  onClick={() => action.onSelect?.(row.original)}
                  render={action.href ? <Link href={action.href(row.original)} /> : undefined}
                >
                  {action.icon && <action.icon className="size-4" aria-hidden />}
                  {action.label}
                </DropdownMenuItem>
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  };
}

/* ------------------------------------------------------------- cells ----- */

export function CodeCell({ value, className }: { value: string; className?: string }) {
  return <span className={cn("text-code text-muted-foreground", className)}>{value}</span>;
}

export function NumberCell({
  value,
  muted,
  className,
}: {
  value: string | number;
  muted?: boolean;
  className?: string;
}) {
  return (
    <span
      data-numeric
      className={cn("tabular", muted && "text-muted-foreground", className)}
    >
      {value}
    </span>
  );
}

export function PersonCell({ name, sub }: { name: string; sub?: string }) {
  return (
    <span className="flex items-center gap-2">
      <Avatar className="size-6">
        <AvatarFallback className="bg-surface-sunken text-[10px] font-semibold text-muted-foreground">
          {initials(name)}
        </AvatarFallback>
      </Avatar>
      <span className="grid min-w-0">
        <span className="truncate">{name}</span>
        {sub && <span className="truncate text-[11px] text-muted-foreground">{sub}</span>}
      </span>
    </span>
  );
}

export function TwoLineCell({
  primary,
  secondary,
  href,
  mono,
}: {
  primary: string;
  secondary?: string;
  href?: string;
  mono?: boolean;
}) {
  const content = (
    <span className="grid min-w-0 gap-0.5">
      <span className="truncate font-medium">{primary}</span>
      {secondary && (
        <span className={cn("truncate text-[11px] text-muted-foreground", mono && "text-code")}>
          {secondary}
        </span>
      )}
    </span>
  );
  return href ? (
    <Link href={href} className="block min-w-0 hover:underline">
      {content}
    </Link>
  ) : (
    content
  );
}
