"use client";

import * as React from "react";
import { Download, Printer, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/states";
import { plural, qty } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface ReportColumnSpec {
  key: string;
  header: string;
  align?: "left" | "right";
}

const PAGE_SIZES = { "50": "50 rows", "100": "100 rows", "250": "250 rows", "1000": "1,000 rows" };

/**
 * A report result set.
 *
 * Rows arrive pre-formatted for display and raw for export, so what lands in
 * the CSV is the same figure the reader saw — the classic reporting bug is an
 * export that silently re-derives its numbers.
 */
export function ReportTable({
  name,
  columns,
  rows,
  raw,
  canExport,
}: {
  name: string;
  columns: ReportColumnSpec[];
  rows: Record<string, string>[];
  raw: Record<string, unknown>[];
  canExport: boolean;
}) {
  const [query, setQuery] = React.useState("");
  const [pageSize, setPageSize] = React.useState("100");

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => columns.some((c) => (row[c.key] ?? "").toLowerCase().includes(q)));
  }, [rows, columns, query]);

  const limit = Number(pageSize);
  const visible = filtered.slice(0, limit);

  const exportCsv = () => {
    const indices = filtered.map((row) => rows.indexOf(row));
    const header = columns.map((c) => c.header).join(",");
    const lines = indices.map((i) => {
      const source = raw[i] ?? {};
      return columns
        .map((c) => {
          const value = source[c.key];
          const s = value === null || value === undefined ? "" : String(value);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(",");
    });
    const csv = [header, ...lines].join("\r\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${plural(indices.length, "row")}`, {
      description: "The CSV holds the unformatted values behind what is on screen.",
    });
  };

  return (
    <div className="overflow-hidden rounded-lg border bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b bg-surface px-3 py-2">
        <div className="relative min-w-[13rem] flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter these results…"
            aria-label={`Filter ${name}`}
            className="h-8 pl-8 text-[13px]"
          />
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <Select items={PAGE_SIZES} value={pageSize} onValueChange={(v) => setPageSize(v ?? "100")}>
            <SelectTrigger size="sm" className="h-8 w-[7.5rem] text-[12px]" aria-label="Rows to show">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PAGE_SIZES).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => toast.info(`${name} sent to the printer`)}
          >
            <Printer className="size-3.5" aria-hidden />
            Print
          </Button>

          {canExport && (
            <Button variant="outline" size="sm" className="h-8" onClick={exportCsv}>
              <Download className="size-3.5" aria-hidden />
              Export CSV
            </Button>
          )}
        </div>
      </div>

      <div className="max-h-[calc(100vh-22rem)] overflow-auto">
        {visible.length === 0 ? (
          <EmptyState
            title="Nothing matches that filter"
            description="Clear the filter to see the full result set."
            action={
              <Button variant="outline" size="sm" onClick={() => setQuery("")}>
                Clear filter
              </Button>
            }
          />
        ) : (
          <Table className="border-separate border-spacing-0 text-table">
            <TableHeader className="sticky top-0 z-10">
              <TableRow className="hover:bg-transparent">
                {columns.map((c) => (
                  <TableHead
                    key={c.key}
                    className={cn(
                      "border-b bg-surface-sunken px-3 text-[11px] font-semibold uppercase text-muted-foreground",
                      c.align === "right" && "text-right",
                    )}
                  >
                    {c.header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((row, i) => (
                <TableRow key={i} className="border-b">
                  {columns.map((c) => (
                    <TableCell
                      key={c.key}
                      className={cn(
                        "border-b px-3 py-1.5 align-middle",
                        c.align === "right" && "text-right tabular",
                      )}
                      data-numeric={c.align === "right" ? "" : undefined}
                    >
                      {row[c.key] ?? "—"}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-surface px-3 py-2 text-caption">
        <span className="text-muted-foreground">
          Showing{" "}
          <span className="tabular font-medium text-foreground" data-numeric>
            {qty(visible.length)}
          </span>{" "}
          of{" "}
          <span className="tabular font-medium text-foreground" data-numeric>
            {qty(filtered.length)}
          </span>{" "}
          rows
          {filtered.length !== rows.length && ` (filtered from ${qty(rows.length)})`}
        </span>
        {filtered.length > visible.length && (
          <span className="text-muted-foreground">
            Export includes all {qty(filtered.length)} filtered rows, not just the visible ones.
          </span>
        )}
      </div>
    </div>
  );
}
