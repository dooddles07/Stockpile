import type { Table } from "@tanstack/react-table";

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s =
    value instanceof Date
      ? value.toISOString()
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serialise a flat array of records to CSV text, columns taken from the first
 *  row's keys. The header cells are the keys verbatim — a caller that wants
 *  friendlier labels shapes the rows before calling. */
export function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const columns = Object.keys(rows[0]);
  const header = columns.map(escapeCell).join(",");
  const lines = rows.map((row) => columns.map((c) => escapeCell(row[c])).join(","));
  return [header, ...lines].join("\r\n");
}

/** Hand the browser a `text/csv` file to save, named `<filename>-<date>.csv`.
 *  The BOM keeps Excel from mangling non-ASCII. */
export function triggerCsvDownload(filename: string, csv: string): void {
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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
    columns.map((c) => escapeCell(row.getValue(c.id))).join(","),
  );

  triggerCsvDownload(filename, [header.join(","), ...lines].join("\r\n"));

  return { rows: source.length, scope: selected.length > 0 ? "selected" : "filtered" } as const;
}
