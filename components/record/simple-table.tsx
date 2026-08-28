import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface SimpleColumn<T> {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  width?: string;
  cell: (row: T) => React.ReactNode;
  /** Hide below the sm breakpoint — the column is secondary on a phone. */
  hideOnMobile?: boolean;
}

/**
 * A read-only table for the inside of a detail page: line items, stock by
 * location, price history. Sorting, filters and export belong to the full
 * <DataTable>; a purchase order's eight lines need none of that machinery.
 */
export function SimpleTable<T>({
  columns,
  rows,
  getRowId,
  footer,
  empty,
  className,
  rowClassName,
}: {
  columns: SimpleColumn<T>[];
  rows: T[];
  getRowId: (row: T, index: number) => string;
  footer?: React.ReactNode;
  empty?: React.ReactNode;
  className?: string;
  rowClassName?: (row: T) => string | undefined;
}) {
  if (rows.length === 0 && empty) {
    return <div className={cn("rounded-md border", className)}>{empty}</div>;
  }

  return (
    <div className={cn("overflow-x-auto rounded-md border", className)}>
      <Table className="text-table">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((col) => (
              <TableHead
                key={col.key}
                style={col.width ? { width: col.width } : undefined}
                className={cn(
                  "h-9 whitespace-nowrap bg-surface-sunken px-3 text-[11px] font-semibold uppercase text-muted-foreground",
                  col.align === "right" && "text-right",
                  col.align === "center" && "text-center",
                  col.hideOnMobile && "hidden sm:table-cell",
                )}
              >
                {col.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={getRowId(row, i)} className={cn("border-b", rowClassName?.(row))}>
              {columns.map((col) => (
                <TableCell
                  key={col.key}
                  className={cn(
                    "px-3 py-2 align-middle",
                    col.align === "right" && "text-right tabular",
                    col.align === "center" && "text-center",
                    col.hideOnMobile && "hidden sm:table-cell",
                  )}
                  data-numeric={col.align === "right" ? "" : undefined}
                >
                  {col.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {footer && <div className="border-t bg-surface-sunken px-3 py-2">{footer}</div>}
    </div>
  );
}
