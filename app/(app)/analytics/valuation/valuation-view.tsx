"use client";

import Link from "next/link";
import * as React from "react";
import { useQueryState } from "nuqs";
import { Info } from "lucide-react";

import { Section, StatTile } from "@/components/record/field-grid";
import { SimpleTable } from "@/components/record/simple-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { money, percent, plural, qty, signedMoney } from "@/lib/format";
import type { ValuationRow } from "@/lib/repo/analytics";
import { cn } from "@/lib/utils";

const METHODS = {
  avco: "Average cost (AVCO)",
  fifo: "First in, first out (FIFO)",
} as const;

const METHOD_NOTE = {
  avco:
    "Every unit is valued at the product's standard cost. Simple, stable, and what most reorder and margin reporting assumes.",
  fifo:
    "The units still on hand are treated as the most recently received ones, valued at the prices actually paid. Diverges from AVCO whenever purchase prices move.",
} as const;

/**
 * Stock valuation.
 *
 * The method selector is not decoration: AVCO and FIFO give different numbers
 * for the same shelf, and which one is in force decides what goes on the
 * balance sheet. The difference between them is shown rather than hidden.
 */
export function ValuationView({ rows }: { rows: ValuationRow[] }) {
  const [method, setMethod] = useQueryState("method", {
    defaultValue: "avco",
    clearOnDefault: true,
  });

  const active = method === "fifo" ? "fifo" : "avco";

  const totals = React.useMemo(() => {
    const avco = rows.reduce((s, r) => s + r.avcoValue, 0);
    const fifo = rows.reduce((s, r) => s + r.fifoValue, 0);
    const retail = rows.reduce((s, r) => s + r.retailValue, 0);
    const units = rows.reduce((s, r) => s + r.onHand, 0);
    return {
      avco: Math.round(avco),
      fifo: Math.round(fifo),
      retail: Math.round(retail),
      units,
      active: Math.round(active === "fifo" ? fifo : avco),
      difference: Math.round(fifo - avco),
      margin: Math.round(retail - (active === "fifo" ? fifo : avco)),
    };
  }, [rows, active]);

  const divergent = React.useMemo(
    () =>
      rows
        .map((r) => ({ ...r, delta: r.fifoValue - r.avcoValue }))
        .filter((r) => Math.abs(r.delta) > 1)
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, 10),
    [rows],
  );

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile
          label={`Value (${active.toUpperCase()})`}
          value={money(totals.active)}
          hint={`${qty(totals.units)} units`}
        />
        <StatTile label="AVCO" value={money(totals.avco)} />
        <StatTile label="FIFO" value={money(totals.fifo)} />
        <StatTile
          label="FIFO vs AVCO"
          value={signedMoney(totals.difference)}
          tone={Math.abs(totals.difference) > totals.avco * 0.02 ? "warning" : "neutral"}
          hint={
            totals.avco > 0
              ? `${percent(Math.abs(totals.difference) / totals.avco, 2)} apart`
              : undefined
          }
        />
        <StatTile
          label="Margin at retail"
          value={money(totals.margin)}
          tone="success"
          hint={`${money(totals.retail)} retail value`}
        />
      </div>

      <Section
        title="Valuation method"
        description={METHOD_NOTE[active]}
        actions={
          <Select items={METHODS} value={active} onValueChange={(v) => setMethod(v ?? "avco")}>
            <SelectTrigger size="sm" className="h-8 w-[16rem] text-[13px]" aria-label="Valuation method">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(METHODS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
        contentClassName="p-0"
      >
        <SimpleTable
          rows={rows.slice(0, 60)}
          getRowId={(r) => r.productId}
          columns={[
            {
              key: "product",
              header: "Product",
              cell: (r) => (
                <Link href={`/inventory/products/${r.sku}`} className="grid gap-0.5 hover:underline">
                  <span className="font-medium">{r.name}</span>
                  <span className="text-code text-[11px] text-muted-foreground">{r.sku}</span>
                </Link>
              ),
            },
            { key: "category", header: "Category", hideOnMobile: true, cell: (r) => r.category },
            { key: "onHand", header: "On hand", align: "right", cell: (r) => qty(r.onHand) },
            {
              key: "unitCost",
              header: "Unit cost",
              align: "right",
              hideOnMobile: true,
              cell: (r) => money(r.unitCost, { cents: true }),
            },
            {
              key: "avco",
              header: "AVCO",
              align: "right",
              cell: (r) => (
                <span className={cn(active === "avco" && "font-semibold")}>{money(r.avcoValue)}</span>
              ),
            },
            {
              key: "fifo",
              header: "FIFO",
              align: "right",
              cell: (r) => (
                <span className={cn(active === "fifo" && "font-semibold")}>{money(r.fifoValue)}</span>
              ),
            },
            {
              key: "delta",
              header: "Difference",
              align: "right",
              hideOnMobile: true,
              cell: (r) => {
                const delta = r.fifoValue - r.avcoValue;
                if (Math.abs(delta) < 1) return <span className="text-muted-foreground">—</span>;
                return (
                  <span className={delta > 0 ? "text-status-success" : "text-status-danger"}>
                    {signedMoney(delta)}
                  </span>
                );
              },
            },
            {
              key: "retail",
              header: "Retail value",
              align: "right",
              cell: (r) => money(r.retailValue),
            },
            {
              key: "margin",
              header: "Margin",
              align: "right",
              cell: (r) => (
                <span className="text-status-success">
                  {percent(r.retailValue > 0 ? r.marginValue / r.retailValue : 0, 0)}
                </span>
              ),
            },
          ]}
          footer={
            <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
              <span className="text-muted-foreground">
                Showing the 60 highest-value of {plural(rows.length, "SKU")}
              </span>
              <span className="tabular" data-numeric>
                <span className="text-muted-foreground">Total ({active.toUpperCase()}) </span>
                <span className="font-semibold">{money(totals.active)}</span>
              </span>
            </div>
          }
        />
      </Section>

      {divergent.length > 0 && (
        <Section
          title="Where the two methods disagree most"
          description="These are the SKUs whose purchase price has moved. Switching method changes the balance sheet by the sum of these differences."
          actions={
            <Tooltip>
              <TooltipTrigger render={<span className="cursor-help" />}>
                <Info className="size-4 text-muted-foreground" aria-hidden />
                <span className="sr-only">Why the methods differ</span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                A positive difference means recent receipts cost more than standard cost, so FIFO
                values the shelf higher than AVCO.
              </TooltipContent>
            </Tooltip>
          }
          contentClassName="p-0"
        >
          <SimpleTable
            rows={divergent}
            getRowId={(r) => r.productId}
            columns={[
              {
                key: "product",
                header: "Product",
                cell: (r) => (
                  <Link href={`/inventory/products/${r.sku}`} className="grid gap-0.5 hover:underline">
                    <span className="font-medium">{r.name}</span>
                    <span className="text-code text-[11px] text-muted-foreground">{r.sku}</span>
                  </Link>
                ),
              },
              { key: "onHand", header: "On hand", align: "right", cell: (r) => qty(r.onHand) },
              { key: "avco", header: "AVCO", align: "right", cell: (r) => money(r.avcoValue) },
              { key: "fifo", header: "FIFO", align: "right", cell: (r) => money(r.fifoValue) },
              {
                key: "delta",
                header: "Difference",
                align: "right",
                cell: (r) => (
                  <span
                    className={
                      r.delta > 0
                        ? "font-semibold text-status-success"
                        : "font-semibold text-status-danger"
                    }
                  >
                    {signedMoney(r.delta)}
                  </span>
                ),
              },
              {
                key: "pct",
                header: "Swing",
                align: "right",
                cell: (r) => (
                  <span className="text-muted-foreground">
                    {r.avcoValue > 0 ? percent(Math.abs(r.delta) / r.avcoValue, 1) : "—"}
                  </span>
                ),
              },
            ]}
          />
        </Section>
      )}
    </div>
  );
}
