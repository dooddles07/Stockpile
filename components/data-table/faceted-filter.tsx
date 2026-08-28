"use client";

import type { Column } from "@tanstack/react-table";
import { Check, ListFilter } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/status/status-badge";
import { cn } from "@/lib/utils";
import type { StatusTone } from "@/lib/types";

export interface FacetOption {
  label: string;
  value: string;
  tone?: StatusTone;
  icon?: React.ComponentType<{ className?: string }>;
}

/**
 * Multi-select column filter with live counts from the current result set, so
 * an operator can see "Low stock (38)" before committing to the click.
 */
export function FacetedFilter<TData, TValue>({
  column,
  title,
  options,
}: {
  column?: Column<TData, TValue>;
  title: string;
  options: FacetOption[];
}) {
  if (!column) return null;

  const facets = column.getFacetedUniqueValues();
  const selected = new Set((column.getFilterValue() as string[]) ?? []);

  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" size="sm" className="h-8 gap-1.5 border-dashed" />}>
        <ListFilter className="size-3.5" aria-hidden />
        {title}
        {selected.size > 0 && (
          <>
            <Separator orientation="vertical" className="mx-0.5 h-4" />
            <span className="flex items-center gap-1">
              {selected.size > 2 ? (
                <span className="rounded-sm bg-surface-sunken px-1.5 py-0.5 text-[11px] font-medium">
                  {selected.size} selected
                </span>
              ) : (
                options
                  .filter((o) => selected.has(o.value))
                  .map((o) => (
                    <StatusBadge key={o.value} label={o.label} tone={o.tone ?? "neutral"} showDot={false} />
                  ))
              )}
            </span>
          </>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-0">
        <Command>
          <CommandInput placeholder={title} />
          <CommandList>
            <CommandEmpty>No matches.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selected.has(option.value);
                const count = facets?.get(option.value) ?? 0;
                return (
                  <CommandItem
                    key={option.value}
                    onSelect={() => {
                      const next = new Set(selected);
                      if (isSelected) next.delete(option.value);
                      else next.add(option.value);
                      const values = [...next];
                      column.setFilterValue(values.length ? values : undefined);
                    }}
                  >
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded-sm border",
                        isSelected ? "border-primary bg-primary text-primary-foreground" : "border-input",
                      )}
                      aria-hidden
                    >
                      {isSelected && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    {option.icon && <option.icon className="size-4 text-muted-foreground" />}
                    <span className="flex-1 truncate">{option.label}</span>
                    <span className="tabular text-[11px] text-muted-foreground" data-numeric>
                      {count}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            {selected.size > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={() => column.setFilterValue(undefined)}
                    className="justify-center text-center"
                  >
                    Clear filter
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
