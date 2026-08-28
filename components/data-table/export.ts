import type { Table } from "@tanstack/react-table";

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Exports what the operator is actually looking at: current column visibility,
 * current sort, current filters. Exporting the raw dataset instead is the
 * classic bug — the numbers in the spreadsheet stop matching the screen.
 */
export function exportTableCsv<T>(table: Table<T>, filename: string) {
  const columns = table
    .getVisibleLeafColumns()
    .filter((c) => c.id !== "select" && c.id !== "actions");

  const header = columns.map((c) => {
    const meta = c.columnDef.meta as { label?: string } | undefined;
    return escapeCell(meta?.label ?? c.id);
  });

  const selected = table.getSelectedRowModel().rows;
  const source = selected.length > 0 ? selected : table.getSortedRowModel().rows;

  const lines = source.map((row) =>
    columns
      .map((c) => {
        const value = row.getValue(c.id);
        return escapeCell(
          value instanceof Date
            ? value.toISOString()
            : typeof value === "object" && value !== null
              ? JSON.stringify(value)
              : value,
        );
      })
      .join(","),
  );

  const csv = [header.join(","), ...lines].join("\r\n");
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  return { rows: source.length, scope: selected.length > 0 ? "selected" : "filtered" } as const;
}
