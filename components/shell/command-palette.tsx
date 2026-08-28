"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  ArrowLeftRight,
  Boxes,
  Building2,
  ClipboardCheck,
  FileText,
  Loader2,
  Moon,
  Plus,
  ShoppingCart,
  SlidersHorizontal,
  Sun,
  Truck,
  UserRound,
} from "lucide-react";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { NAV_INDEX } from "@/lib/nav";
import { useRole } from "@/components/providers/role-provider";
import { statusMeta } from "@/lib/status";
import type { SearchHit, SearchKind } from "@/lib/repo/search";
import type { ModuleKey } from "@/lib/types";

const KIND_ICON: Record<SearchKind, typeof Boxes> = {
  product: Boxes,
  "purchase-order": ShoppingCart,
  "sales-order": FileText,
  transfer: ArrowLeftRight,
  supplier: Truck,
  customer: UserRound,
  warehouse: Building2,
  adjustment: SlidersHorizontal,
  count: ClipboardCheck,
};

const KIND_HEADING: Record<SearchKind, string> = {
  product: "Products",
  "purchase-order": "Purchase orders",
  "sales-order": "Sales orders",
  transfer: "Transfers",
  supplier: "Suppliers",
  customer: "Customers",
  warehouse: "Warehouses",
  adjustment: "Adjustments",
  count: "Stock counts",
};

const QUICK_ACTIONS: {
  label: string;
  href: string;
  module: ModuleKey;
  icon: typeof Plus;
}[] = [
  {
    label: "New purchase order",
    href: "/purchasing/purchase-orders/new",
    module: "purchase-orders",
    icon: ShoppingCart,
  },
  {
    label: "New sales order",
    href: "/sales/orders/new",
    module: "sales-orders",
    icon: FileText,
  },
  {
    label: "New stock transfer",
    href: "/warehousing/transfers/new",
    module: "transfers",
    icon: ArrowLeftRight,
  },
  {
    label: "New stock adjustment",
    href: "/inventory/adjustments/new",
    module: "adjustments",
    icon: SlidersHorizontal,
  },
  {
    label: "New stock count",
    href: "/inventory/counts/new",
    module: "counts",
    icon: ClipboardCheck,
  },
  {
    label: "New product",
    href: "/inventory/products/new",
    module: "products",
    icon: Boxes,
  },
];

export function CommandPalette({
  open,
  onOpenChange,
  finalFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where focus returns on close. Opened by ⌘K there is no trigger to infer. */
  finalFocus?: React.RefObject<HTMLButtonElement | null>;
}) {
  const router = useRouter();
  const { can } = useRole();
  const { resolvedTheme, setTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      // Reset on close here rather than in an effect: an effect would fire a
      // second render pass every time the dialog closes.
      if (!next) {
        setQuery("");
        setHits([]);
        setLoading(false);
        requestId.current++;
      }
      onOpenChange(next);
    },
    [onOpenChange],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, handleOpenChange]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const ticket = ++requestId.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = (await res.json()) as { hits: SearchHit[] };
        if (ticket === requestId.current) setHits(data.hits);
      } catch {
        if (ticket === requestId.current) setHits([]);
      } finally {
        if (ticket === requestId.current) setLoading(false);
      }
    }, 140);
    return () => clearTimeout(timer);
  }, [query]);

  const go = (href: string) => {
    handleOpenChange(false);
    router.push(href);
  };

  const q = query.trim().toLowerCase();

  const navMatches = useMemo(
    () =>
      NAV_INDEX.filter((item) => can(item.module)).filter(
        (item) =>
          !q ||
          item.label.toLowerCase().includes(q) ||
          item.section.toLowerCase().includes(q),
      ),
    [q, can],
  );

  const actionMatches = useMemo(
    () =>
      QUICK_ACTIONS.filter((a) => can(a.module, "create")).filter(
        (a) => !q || a.label.toLowerCase().includes(q),
      ),
    [q, can],
  );

  const grouped = useMemo(() => {
    const map = new Map<SearchKind, SearchHit[]>();
    // Below two characters there is nothing to match on; drop stale results at
    // render time instead of clearing state in an effect.
    for (const hit of q.length < 2 ? [] : hits) {
      const list = map.get(hit.kind) ?? [];
      list.push(hit);
      map.set(hit.kind, list);
    }
    return [...map.entries()];
  }, [hits, q]);

  const nothing =
    !loading &&
    grouped.length === 0 &&
    navMatches.length === 0 &&
    actionMatches.length === 0;

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      finalFocus={finalFocus}
      title="Search Stockpile"
      description="Search products, orders, suppliers and pages, or run a command."
      className="w-[min(92vw,40rem)] max-w-none"
    >
      <Command shouldFilter={false} loop>
        <div className="relative">
          <CommandInput
            placeholder="Search a SKU, order number, supplier, or jump to a page…"
            value={query}
            onValueChange={setQuery}
          />
          {loading && (
            <Loader2
              className="absolute right-4 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
              aria-hidden
            />
          )}
        </div>

        <CommandList className="max-h-[26rem]">
          {nothing && (
            <CommandEmpty>
              <span className="block text-sm">No matches for “{query}”.</span>
              <span className="mt-1 block text-caption text-muted-foreground">
                Try a SKU (BCL-SCN-104), an order number (PO-2026-1043), or a
                supplier name.
              </span>
            </CommandEmpty>
          )}

          {grouped.map(([kind, items]) => {
            const Icon = KIND_ICON[kind];
            return (
              <CommandGroup key={kind} heading={KIND_HEADING[kind]}>
                {items.map((hit) => (
                  <CommandItem
                    key={`${kind}-${hit.id}`}
                    value={`${kind}-${hit.id}`}
                    onSelect={() => go(hit.href)}
                  >
                    <Icon
                      className="size-4 text-muted-foreground"
                      aria-hidden
                    />
                    <span className="flex-1 truncate">{hit.title}</span>
                    <span className="text-code shrink-0 text-muted-foreground">
                      {hit.subtitle}
                    </span>
                    <CommandShortcut className="shrink-0">
                      {statusMeta(hit.meta).label !== hit.meta
                        ? statusMeta(hit.meta).label
                        : hit.meta}
                    </CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            );
          })}

          {grouped.length > 0 &&
            (navMatches.length > 0 || actionMatches.length > 0) && (
              <CommandSeparator />
            )}

          {actionMatches.length > 0 && (
            <CommandGroup heading="Create">
              {actionMatches.map((a) => (
                <CommandItem
                  key={a.href}
                  value={`action-${a.href}`}
                  onSelect={() => go(a.href)}
                >
                  <a.icon
                    className="size-4 text-muted-foreground"
                    aria-hidden
                  />
                  {a.label}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {navMatches.length > 0 && (
            <CommandGroup heading="Go to">
              {navMatches.slice(0, 12).map((item) => (
                <CommandItem
                  key={item.href}
                  value={`nav-${item.href}`}
                  onSelect={() => go(item.href)}
                >
                  <item.icon
                    className="size-4 text-muted-foreground"
                    aria-hidden
                  />
                  <span className="flex-1">{item.label}</span>
                  <CommandShortcut>{item.section}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          <CommandSeparator />
          <CommandGroup heading="Preferences">
            <CommandItem
              value="toggle-theme"
              onSelect={() => {
                setTheme(resolvedTheme === "dark" ? "light" : "dark");
                handleOpenChange(false);
              }}
            >
              {resolvedTheme === "dark" ? (
                <Sun className="size-4 text-muted-foreground" aria-hidden />
              ) : (
                <Moon className="size-4 text-muted-foreground" aria-hidden />
              )}
              Switch to {resolvedTheme === "dark" ? "light" : "dark"} theme
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
