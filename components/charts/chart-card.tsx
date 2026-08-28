"use client";

import * as React from "react";
import { BarChart3, TableIcon } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface ChartSeriesMeta {
  key: string;
  label: string;
  format?: (v: number) => string;
}

/**
 * Every chart in Stockpile ships with its numbers. The toggle is not a nicety:
 * a line chart is unreadable to a screen reader and imprecise for anyone who
 * needs the actual figure to put in a purchase order.
 */
export function ChartCard({
  title,
  description,
  actions,
  data,
  series,
  labelKey = "label",
  labelHeader = "Period",
  children,
  className,
  contentClassName,
  headingLevel = 2,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  data: Record<string, string | number>[];
  series: ChartSeriesMeta[];
  labelKey?: string;
  labelHeader?: string;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  /**
   * Heading level. A card is a page-level region (h2) unless it sits under a
   * region heading of its own, in which case pass 3 so the outline still reads
   * top to bottom without a skip.
   */
  headingLevel?: 2 | 3;
}) {
  const [asTable, setAsTable] = React.useState(false);
  const Heading = `h${headingLevel}` as const;

  return (
    <Card className={cn("gap-0 overflow-hidden py-0 shadow-xs", className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 border-b px-4 py-3">
        <div className="min-w-0">
          <Heading className="text-card-title">{title}</Heading>
          {description && (
            <p className="mt-0.5 text-caption text-muted-foreground">{description}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {actions}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => setAsTable((v) => !v)}
                  aria-label={asTable ? "Show as chart" : "Show as table"}
                  aria-pressed={asTable}
                />
              }
            >
              {asTable ? <BarChart3 className="size-4" aria-hidden /> : <TableIcon className="size-4" aria-hidden />}
            </TooltipTrigger>
            <TooltipContent>{asTable ? "Show as chart" : "View the underlying numbers"}</TooltipContent>
          </Tooltip>
        </div>
      </CardHeader>

      <CardContent className={cn("px-4 py-4", contentClassName)}>
        {asTable ? (
          <div className="max-h-64 overflow-auto rounded-md border">
            <Table className="text-table">
              <TableHeader className="sticky top-0 z-10">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="bg-surface-sunken text-[11px] uppercase tracking-wide">
                    {labelHeader}
                  </TableHead>
                  {series.map((s) => (
                    <TableHead
                      key={s.key}
                      className="bg-surface-sunken text-right text-[11px] uppercase tracking-wide"
                    >
                      {s.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="py-1.5 font-medium">{row[labelKey]}</TableCell>
                    {series.map((s) => (
                      <TableCell key={s.key} className="py-1.5 text-right tabular" data-numeric>
                        {s.format ? s.format(Number(row[s.key])) : Number(row[s.key]).toLocaleString("en-US")}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
