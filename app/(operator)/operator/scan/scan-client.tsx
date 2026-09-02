"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, ScanLine, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/states";
import type { SearchHit } from "@/lib/repo/search";

/**
 * The handheld scanner.
 *
 * A scanner types a whole barcode or SKU and presses Enter. On submit this hits
 * the same `/api/search` route the command palette uses — already permission
 * filtered for the active role — and shows the product hits with the available
 * stock the route reports. One round trip per scan, not a catalogue shipped to
 * the phone.
 */
export function ScanClient() {
  const [query, setQuery] = React.useState("");
  const [term, setTerm] = React.useState("");
  const [hits, setHits] = React.useState<SearchHit[]>([]);
  const [state, setState] = React.useState<"idle" | "loading" | "done" | "error">("idle");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const scan = React.useCallback(async (raw: string) => {
    const q = raw.trim();
    if (q.length < 2) return;
    setTerm(q);
    setState("loading");
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (!response.ok) throw new Error(String(response.status));
      const data: { hits: SearchHit[] } = await response.json();
      setHits(data.hits.filter((h) => h.kind === "product"));
      setState("done");
    } catch {
      setHits([]);
      setState("error");
    }
  }, []);

  return (
    <div className="grid gap-3 p-4">
      <h1 className="sr-only">Scan a product</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          scan(query);
        }}
      >
        <label htmlFor="operator-scan" className="sr-only">
          Scan or type a barcode
        </label>
        <div className="relative">
          <ScanLine
            className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="operator-scan"
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Scan a barcode…"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            className="h-12 pl-10 pr-10 text-base"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setTerm("");
                setHits([]);
                setState("idle");
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

      {state === "loading" && (
        <p className="px-1 text-[13px] text-muted-foreground">Looking up {term}…</p>
      )}

      {state === "error" && (
        <div className="rounded-md border border-status-danger-border bg-status-danger-bg px-3 py-2.5 text-[13px] text-status-danger">
          The lookup failed. Check the connection and scan again.
        </div>
      )}

      {state === "done" && hits.length === 0 && (
        <div className="rounded-md border border-status-danger-border bg-status-danger-bg px-3 py-2.5 text-[13px] text-status-danger">
          Nothing in the catalogue matches <span className="text-code">{term}</span>. Check the
          barcode, or search by name instead.
        </div>
      )}

      {state === "done" && hits.length > 0 && (
        <ul className="grid gap-2">
          {hits.map((hit) => (
            <li key={hit.id}>
              <Link
                href={hit.href}
                className="flex items-center gap-3 rounded-lg border bg-surface px-3 py-3 transition-colors active:bg-surface-sunken"
              >
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="line-clamp-2 text-[14px] font-medium leading-snug">
                    {hit.title}
                  </span>
                  <span className="text-code text-[12px] text-muted-foreground">{hit.subtitle}</span>
                </span>
                <span className="shrink-0 tabular text-[14px] font-semibold">{hit.meta}</span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {state === "idle" && (
        <EmptyState
          icon={ScanLine}
          title="Ready to scan"
          description="Point the scanner at a barcode, or type a SKU and press Enter."
          className="py-12"
        />
      )}
    </div>
  );
}
