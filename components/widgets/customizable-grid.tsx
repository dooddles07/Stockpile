"use client";

import * as React from "react";
import { SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useLocalStorage } from "@/hooks/use-local-storage";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface GridPanel {
  id: string;
  label: string;
  /** Column span at lg and above. */
  span?: 1 | 2 | 3;
  node: React.ReactNode;
}

const STORAGE_KEY = "stockpile:dashboard-panels";
const EMPTY: string[] = [];

/**
 * Dashboard customization. Panels are rendered on the server and passed in as
 * nodes; this only decides which of them are on screen, so hiding a panel
 * costs nothing at render time.
 */
export function CustomizableGrid({
  panels,
  className,
}: {
  panels: GridPanel[];
  className?: string;
}) {
  const [hidden, persist] = useLocalStorage<string[]>(STORAGE_KEY, EMPTY);

  const toggle = (id: string) =>
    persist(hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id]);

  const visible = panels.filter((p) => !hidden.includes(p.id));

  return (
    <section className={className}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-section">Operational queues</h2>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="h-8 gap-1.5" />}>
            <SlidersHorizontal className="size-3.5" aria-hidden />
            Customize
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="text-overline text-muted-foreground">
              Panels on this dashboard
            </DropdownMenuLabel>
            {panels.map((panel) => (
              <DropdownMenuCheckboxItem
                key={panel.id}
                checked={!hidden.includes(panel.id)}
                onCheckedChange={() => toggle(panel.id)}
              >
                {panel.label}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => persist([])}>Show all panels</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {visible.map((panel) => (
          <div
            key={panel.id}
            className={cn(
              panel.span === 3 && "lg:col-span-3",
              panel.span === 2 && "lg:col-span-2",
            )}
          >
            {panel.node}
          </div>
        ))}
      </div>
    </section>
  );
}
