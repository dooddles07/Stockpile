"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { SETTINGS_NAV } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function SettingsNav() {
  const pathname = usePathname();

  return (
    // min-w-0: a grid item defaults to min-width:auto, so without this the nav
    // grows to fit all seven tabs and the ul's overflow-x-auto never engages —
    // the whole page scrolls sideways instead of the tab strip.
    <nav aria-label="Settings sections" className="min-w-0">
      <ul className="flex gap-1 overflow-x-auto scrollbar-none lg:sticky lg:top-[6.5rem] lg:flex-col lg:overflow-visible">
        {SETTINGS_NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <li key={item.href} className="shrink-0 lg:shrink">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block whitespace-nowrap rounded-md px-3 py-2 text-[13px] font-medium transition-colors",
                  active
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-surface-hover hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
