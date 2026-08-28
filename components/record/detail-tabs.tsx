"use client";

import { useQueryState } from "nuqs";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export interface DetailTab {
  id: string;
  label: string;
  count?: number;
  content: React.ReactNode;
}

/**
 * Tabs whose selection lives in the URL, so a link to a product's history is a
 * link to that tab — the difference between "look at the movements" and
 * "open the product then click the fifth tab".
 */
export function DetailTabs({
  tabs,
  defaultTab,
  className,
}: {
  tabs: DetailTab[];
  defaultTab?: string;
  className?: string;
}) {
  const fallback = defaultTab ?? tabs[0]?.id;
  const [tab, setTab] = useQueryState("tab", {
    defaultValue: fallback,
    clearOnDefault: true,
  });

  const active = tabs.some((t) => t.id === tab) ? tab : fallback;

  return (
    <Tabs value={active} onValueChange={(value) => setTab(value)} className={cn("gap-0", className)}>
      <div className="sticky top-14 z-10 border-b bg-surface px-4 sm:px-6">
        <TabsList variant="line"
          className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-0 bg-transparent p-0 scrollbar-none">
          {tabs.map((t) => (
            <TabsTrigger
              key={t.id}
              value={t.id}
              className="relative h-auto flex-none gap-1.5 rounded-none border-0 border-b-2 border-transparent bg-transparent px-3 py-2.5 after:hidden text-[13px] font-medium text-muted-foreground shadow-none transition-colors data-active:border-primary data-active:bg-transparent data-active:text-foreground data-active:shadow-none hover:text-foreground"
            >
              {t.label}
              {t.count !== undefined && (
                <span
                  className="tabular rounded-sm bg-surface-sunken px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground"
                  data-numeric
                >
                  {t.count}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      {tabs.map((t) => (
        <TabsContent key={t.id} value={t.id} className="mt-0 p-4 sm:p-6">
          {t.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
