"use client";

import * as React from "react";
import { ArrowRight, PackageSearch, ScanLine, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status/status-badge";
import { EmptyState } from "@/components/states";
import { money, plural, qty } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { StockHealth } from "@/lib/types";

export interface OperatorProduct {
  id: string;
  sku: string;
  name: string;
  shortName: string;
  brand: string;
  barcode: string | null;
  unit: string;
  unitCost: number;
  reorderPoint: number;
  health: StockHealth;
  available: number;
  onHand: number;
  reserved: number;
  incoming: number;
  bins: { code: string; zone: string; onHand: number; lotNumber: string | null }[];
  otherSites: { code: string; name: string; available: number }[];
}

const HEALTH_TONE: Record<StockHealth, "success" | "warning" | "danger" | "purple"> = {
  healthy: "success",
  low: "warning",
  critical: "danger",
  "out-of-stock": "danger",
  overstock: "purple",
};

/**
 * Lookup.
 *
 * The answer an operator wants is "how many, and which bin" — in that order,
 * above the fold, without a tap. Everything else is below it.
 */
export function LookupClient({
  products,
  siteCode,
  autoFocus = false,
  scanMode = false,
}: {
  products: OperatorProduct[];
  siteCode: string;
  autoFocus?: boolean;
  scanMode?: boolean;
}) {
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState<OperatorProduct | null>(null);
  const [noMatch, setNoMatch] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const term = query.trim().toLowerCase();
  const matches = React.useMemo(() => {
    if (term.length < 2) return [];
    return products
      .filter(
        (p) =>
          p.sku.toLowerCase().includes(term) ||
          p.name.toLowerCase().includes(term) ||
          p.shortName.toLowerCase().includes(term) ||
          p.barcode?.includes(term),
      )
      .slice(0, 25);
  }, [products, term]);

  // A scanner types the whole barcode then presses Enter. Treat an exact
  // barcode or SKU hit as a selection so the operator never has to tap a result.
  const submit = (raw: string) => {
    const value = raw.trim().toLowerCase();
    if (!value) return;
    const exact = products.find(
      (p) => p.barcode === value || p.sku.toLowerCase() === value,
    );
    if (exact) {
      setSelected(exact);
      setNoMatch(null);
      setQuery("");
    } else if (matches.length === 1) {
      setSelected(matches[0]);
      setNoMatch(null);
      setQuery("");
    } else if (matches.length === 0) {
      setNoMatch(raw.trim());
    }
  };

  if (selected) {
    return (
      <ProductPanel
        product={selected}
        siteCode={siteCode}
        onBack={() => {
          setSelected(null);
          setNoMatch(null);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
      />
    );
  }

  return (
    <div className="grid gap-3 p-4">
      <h1 className="sr-only">{scanMode ? "Scan a product" : "Look up a product"}</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(query);
        }}
      >
        <label htmlFor="operator-search" className="sr-only">
          {scanMode ? "Scan or type a barcode" : "Search by SKU, name or barcode"}
        </label>
        <div className="relative">
          {scanMode ? (
            <ScanLine
              className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
          ) : (
            <PackageSearch
              className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
          )}
          <Input
            id="operator-search"
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setNoMatch(null);
            }}
            placeholder={scanMode ? "Scan a barcode…" : "SKU, name or barcode"}
            inputMode={scanMode ? "numeric" : "search"}
            autoComplete="off"
            autoFocus={autoFocus}
            className="h-12 pl-10 pr-10 text-base"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setNoMatch(null);
                inputRef.current?.focus();
              }}
              aria-label="Clear"
              className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded text-muted-foreground"
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
        </div>
      </form>

      {noMatch && (
        <div className="rounded-md border border-status-danger-border bg-status-danger-bg px-3 py-2.5 text-[13px] text-status-danger">
          Nothing in the catalogue matches <span className="text-code">{noMatch}</span>. Check the
          barcode, or search by name instead.
        </div>
      )}

      {term.length >= 2 && matches.length > 0 && (
        <ul className="grid gap-2">
          {matches.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setSelected(p)}
                className="flex w-full items-center gap-3 rounded-lg border bg-surface px-3 py-3 text-left transition-colors active:bg-surface-sunken"
              >
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="line-clamp-2 text-[14px] font-medium leading-snug">
                    {p.shortName}
                  </span>
                  <span className="text-code text-[12px] text-muted-foreground">{p.sku}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block tabular text-[15px] font-semibold">{qty(p.available)}</span>
                  <span className="block text-[11px] text-muted-foreground">available</span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {term.length < 2 && !noMatch && (
        <EmptyState
          icon={scanMode ? ScanLine : PackageSearch}
          title={scanMode ? "Ready to scan" : "Look up a product"}
          description={
            scanMode
              ? "Point the scanner at a barcode. The result opens straight away — no tapping needed."
              : "Type at least two characters of a SKU, product name or barcode."
          }
          className="py-12"
        />
      )}
    </div>
  );
}

function ProductPanel({
  product,
  siteCode,
  onBack,
}: {
  product: OperatorProduct;
  siteCode: string;
  onBack: () => void;
}) {
  return (
    <div className="grid gap-3 p-4">
      <Button variant="ghost" size="sm" className="h-9 justify-self-start px-2" onClick={onBack}>
        <X className="size-4" aria-hidden />
        Clear
      </Button>

      <div className="rounded-lg border bg-surface p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[16px] font-semibold leading-snug">{product.name}</h1>
            <p className="mt-0.5 text-code text-[12px] text-muted-foreground">{product.sku}</p>
          </div>
          <StatusBadge status={product.health} tone={HEALTH_TONE[product.health]} size="md" />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          {[
            { label: "Available", value: product.available, strong: true },
            { label: "Reserved", value: product.reserved },
            { label: "Incoming", value: product.incoming },
          ].map((stat) => (
            <div key={stat.label} className="rounded-md border bg-surface-sunken px-2 py-2.5">
              <p
                className={cn(
                  "tabular text-[20px] font-semibold leading-none",
                  stat.strong && product.available === 0 && "text-status-danger",
                )}
              >
                {qty(stat.value)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>

        <p className="mt-3 text-[12px] text-muted-foreground">
          {product.brand} · {product.unit} · {money(product.unitCost)} cost · reorder at{" "}
          {qty(product.reorderPoint)}
        </p>
      </div>

      <section className="rounded-lg border bg-surface">
        <h2 className="border-b px-4 py-2.5 text-[13px] font-semibold">
          Where it is at {siteCode}
        </h2>
        {product.bins.length === 0 ? (
          <p className="px-4 py-4 text-[13px] text-muted-foreground">
            Nothing on the shelf at this site.
          </p>
        ) : (
          <ul className="divide-y">
            {product.bins.map((bin) => (
              <li key={bin.code} className="flex items-center gap-3 px-4 py-3">
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="text-code text-[14px] font-medium">{bin.code}</span>
                  <span className="text-[11px] text-muted-foreground">
                    Zone {bin.zone}
                    {bin.lotNumber && ` · lot ${bin.lotNumber}`}
                  </span>
                </span>
                <span className="tabular text-[15px] font-semibold">{qty(bin.onHand)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {product.otherSites.length > 0 && (
        <section className="rounded-lg border bg-surface">
          <h2 className="border-b px-4 py-2.5 text-[13px] font-semibold">
            {plural(product.otherSites.length, "other site")} holding stock
          </h2>
          <ul className="divide-y">
            {product.otherSites.map((site) => (
              <li key={site.code} className="flex items-center gap-3 px-4 py-3">
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="text-[14px] font-medium">{site.code}</span>
                  <span className="truncate text-[11px] text-muted-foreground">{site.name}</span>
                </span>
                <span className="tabular text-[15px] font-semibold">{qty(site.available)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
