"use client";

import * as React from "react";
import { Package, Plus, Search, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/states";
import { money, qty } from "@/lib/format";
import { documentTotals, lineMoney } from "@/lib/totals";
import { cn } from "@/lib/utils";

export interface PickableProduct {
  id: string;
  sku: string;
  name: string;
  unit: string;
  unitCost: number;
  sellPrice: number;
  available: number;
}

export interface EditorLine {
  key: string;
  product: PickableProduct;
  quantity: number;
  unitPrice: number;
  discountPct: number;
  taxPct: number;
}

/**
 * The line-item grid shared by purchase orders, sales orders, transfers,
 * returns and adjustments.
 *
 * Each document decides which money columns apply — a transfer moves stock
 * without a price, an adjustment has no tax — so the columns are opt-in rather
 * than five near-identical copies of this file.
 */
export function LineItemEditor({
  products,
  lines,
  onChange,
  priceMode = "cost",
  showPricing = true,
  showDiscount = true,
  showTax = true,
  /** Warn when the requested quantity exceeds what is available to allocate. */
  checkAvailability = false,
  emptyHint,
  className,
}: {
  products: PickableProduct[];
  lines: EditorLine[];
  onChange: (lines: EditorLine[]) => void;
  priceMode?: "cost" | "sell";
  showPricing?: boolean;
  showDiscount?: boolean;
  showTax?: boolean;
  checkAvailability?: boolean;
  emptyHint?: string;
  className?: string;
}) {
  const [pickerOpen, setPickerOpen] = React.useState(false);

  const addProduct = (product: PickableProduct) => {
    setPickerOpen(false);
    if (lines.some((l) => l.product.id === product.id)) {
      // Bump the existing line instead of creating a duplicate — two lines for
      // one SKU on one order is almost always a mis-click.
      onChange(
        lines.map((l) =>
          l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l,
        ),
      );
      return;
    }
    onChange([
      ...lines,
      {
        key: `${product.id}-${lines.length}`,
        product,
        quantity: 1,
        unitPrice: priceMode === "cost" ? product.unitCost : product.sellPrice,
        discountPct: 0,
        taxPct: 0,
      },
    ]);
  };

  const update = (key: string, patch: Partial<EditorLine>) =>
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const remove = (key: string) => onChange(lines.filter((l) => l.key !== key));

  const totals = documentTotals(lines);

  return (
    <div className={cn("overflow-hidden rounded-lg border bg-surface", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-card-title">Line items</h3>
          <p className="mt-0.5 text-caption text-muted-foreground">
            {lines.length === 0
              ? (emptyHint ?? "Add the products this document covers.")
              : `${lines.length} line${lines.length === 1 ? "" : "s"} · ${qty(totals.units)} units`}
          </p>
        </div>

        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger render={<Button size="sm" className="h-8" />}>
            <Plus className="size-3.5" aria-hidden />
            Add product
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[22rem] p-0">
            <Command>
              <CommandInput placeholder="Search by name or SKU…" />
              <CommandList className="max-h-72">
                <CommandEmpty>No product matches that search.</CommandEmpty>
                <CommandGroup>
                  {products.slice(0, 200).map((product) => (
                    <CommandItem
                      key={product.id}
                      value={`${product.sku} ${product.name}`}
                      onSelect={() => addProduct(product)}
                      className="items-start gap-2"
                    >
                      <Package className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <span className="truncate text-[13px]">{product.name}</span>
                        <span className="text-code text-[11px] text-muted-foreground">
                          {product.sku} · {qty(product.available)} available
                        </span>
                      </span>
                      <span className="shrink-0 text-caption text-muted-foreground">
                        {money(priceMode === "cost" ? product.unitCost : product.sellPrice, {
                          cents: true,
                        })}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {lines.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No line items yet"
          description={
            emptyHint ??
            "Search the catalogue and add the products this document covers. Quantities and prices can be edited after adding."
          }
          className="py-12"
        />
      ) : (
        <div className="overflow-x-auto">
          <Table className="text-table">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-9 bg-surface-sunken px-3 text-[11px] font-semibold uppercase text-muted-foreground">
                  Product
                </TableHead>
                <TableHead className="h-9 w-28 bg-surface-sunken px-3 text-right text-[11px] font-semibold uppercase text-muted-foreground">
                  Quantity
                </TableHead>
                {showPricing && (
                  <TableHead className="h-9 w-32 bg-surface-sunken px-3 text-right text-[11px] font-semibold uppercase text-muted-foreground">
                    Unit price
                  </TableHead>
                )}
                {showDiscount && (
                  <TableHead className="h-9 w-24 bg-surface-sunken px-3 text-right text-[11px] font-semibold uppercase text-muted-foreground">
                    Disc %
                  </TableHead>
                )}
                {showTax && (
                  <TableHead className="h-9 w-24 bg-surface-sunken px-3 text-right text-[11px] font-semibold uppercase text-muted-foreground">
                    Tax %
                  </TableHead>
                )}
                {showPricing && (
                  <TableHead className="h-9 w-32 bg-surface-sunken px-3 text-right text-[11px] font-semibold uppercase text-muted-foreground">
                    Line total
                  </TableHead>
                )}
                <TableHead className="h-9 w-12 bg-surface-sunken px-3">
                  <span className="sr-only">Remove</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => {
                const { gross, net, lineTotal } = lineMoney(line);
                const short = checkAvailability && line.quantity > line.product.available;

                return (
                  <TableRow key={line.key} className="border-b">
                    <TableCell className="px-3 py-2">
                      <span className="grid gap-0.5">
                        <span className="font-medium">{line.product.name}</span>
                        <span className="text-code text-[11px] text-muted-foreground">
                          {line.product.sku} · {qty(line.product.available)} available
                        </span>
                        {short && (
                          <span className="text-[11px] font-medium text-status-warning">
                            Only {qty(line.product.available)} available — the shortfall goes on backorder.
                          </span>
                        )}
                      </span>
                    </TableCell>

                    <TableCell className="px-3 py-2">
                      <Input
                        type="number"
                        min={1}
                        inputMode="numeric"
                        aria-label={`Quantity for ${line.product.sku}`}
                        value={line.quantity}
                        onChange={(e) =>
                          update(line.key, { quantity: Math.max(1, Number(e.target.value) || 1) })
                        }
                        className={cn(
                          "h-8 text-right tabular",
                          short && "border-status-warning",
                        )}
                      />
                    </TableCell>

                    {showPricing && (
                      <TableCell className="px-3 py-2">
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          inputMode="decimal"
                          aria-label={`Unit price for ${line.product.sku}`}
                          value={line.unitPrice}
                          onChange={(e) =>
                            update(line.key, { unitPrice: Math.max(0, Number(e.target.value) || 0) })
                          }
                          className="h-8 text-right tabular"
                        />
                      </TableCell>
                    )}

                    {showDiscount && (
                      <TableCell className="px-3 py-2">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step="0.5"
                          inputMode="decimal"
                          aria-label={`Discount percent for ${line.product.sku}`}
                          value={line.discountPct}
                          onChange={(e) =>
                            update(line.key, {
                              discountPct: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                            })
                          }
                          className="h-8 text-right tabular"
                        />
                      </TableCell>
                    )}

                    {showTax && (
                      <TableCell className="px-3 py-2">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step="0.25"
                          inputMode="decimal"
                          aria-label={`Tax percent for ${line.product.sku}`}
                          value={line.taxPct}
                          onChange={(e) =>
                            update(line.key, {
                              taxPct: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                            })
                          }
                          className="h-8 text-right tabular"
                        />
                      </TableCell>
                    )}

                    {showPricing && (
                      <TableCell className="px-3 py-2 text-right tabular font-medium" data-numeric>
                        {money(lineTotal, { cents: true })}
                      </TableCell>
                    )}

                    <TableCell className="px-3 py-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-destructive"
                        onClick={() => remove(line.key)}
                        aria-label={`Remove ${line.product.sku}`}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {lines.length > 0 && showPricing && (
        <dl className="grid gap-1.5 border-t bg-surface-sunken px-4 py-3 text-[13px]">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="tabular" data-numeric>
              {money(totals.subtotal, { cents: true })}
            </dd>
          </div>
          {showDiscount && totals.discountTotal > 0 && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Discount</dt>
              <dd className="tabular text-status-success" data-numeric>
                −{money(totals.discountTotal, { cents: true })}
              </dd>
            </div>
          )}
          {showTax && totals.taxTotal > 0 && (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Tax</dt>
              <dd className="tabular" data-numeric>
                {money(totals.taxTotal, { cents: true })}
              </dd>
            </div>
          )}
          <div className="mt-1 flex justify-between gap-4 border-t pt-2 text-[15px] font-semibold">
            <dt>Total</dt>
            <dd className="tabular" data-numeric>
              {money(totals.total, { cents: true })}
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}
