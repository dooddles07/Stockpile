"use client";

import * as React from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { rowsToCsv, triggerCsvDownload } from "@/components/data-table/export";

interface ExportButtonProps extends React.ComponentProps<typeof Button> {
  /** The rows the screen is showing, already shaped for the spreadsheet.
   *  Column headers are each row's keys, so shape them how they should read. */
  rows: Record<string, unknown>[];
  /** Base name of the file: `<filename>-<date>.csv`. */
  filename: string;
}

/**
 * Turns the rows a page already has into a real `text/csv` download. The whole
 * of it: no server round trip, no job — the data is on the client already
 * because the page rendered it.
 */
export function ExportButton({ rows, filename, children, ...props }: ExportButtonProps) {
  const download = () => {
    if (rows.length === 0) {
      toast.info("Nothing to export", { description: "This view has no rows." });
      return;
    }
    triggerCsvDownload(filename, rowsToCsv(rows));
    toast.success(`Exported ${rows.length} ${rows.length === 1 ? "row" : "rows"}`, {
      description: "The CSV matches the rows on screen.",
    });
  };

  return (
    <Button {...props} onClick={download}>
      {children ?? (
        <>
          <Download className="size-3.5" aria-hidden />
          Export
        </>
      )}
    </Button>
  );
}
