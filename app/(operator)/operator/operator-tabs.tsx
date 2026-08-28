"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BadgeCheck, PackageCheck, ScanLine, Search } from "lucide-react";

import { cn } from "@/lib/utils";

const TABS = [
  { href: "/operator", label: "Look up", icon: Search, badge: null },
  { href: "/operator/scan", label: "Scan", icon: ScanLine, badge: null },
  { href: "/operator/receive", label: "Receive", icon: PackageCheck, badge: "receiving" },
  { href: "/operator/approve", label: "Approve", icon: BadgeCheck, badge: "approvals" },
] as const;

export function OperatorTabs({
  approvals,
  receiving,
}: {
  approvals: number;
  receiving: number;
}) {
  const pathname = usePathname();
  const counts = { approvals, receiving };

  return (
    <nav
      aria-label="Operator tasks"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="grid grid-cols-4">
        {TABS.map((tab) => {
          const active = tab.href === "/operator" ? pathname === tab.href : pathname.startsWith(tab.href);
          const count = tab.badge ? counts[tab.badge] : 0;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <span className="relative">
                  <tab.icon className={cn("size-5", active && "stroke-[2.25]")} aria-hidden />
                  {count > 0 && (
                    <span className="absolute -right-2.5 -top-1.5 min-w-4 rounded-full bg-status-danger px-1 text-center text-[10px] font-semibold leading-4 text-white">
                      {count > 99 ? "99+" : count}
                    </span>
                  )}
                </span>
                {tab.label}
                {active && <span className="absolute inset-x-6 top-0 h-0.5 rounded-b bg-primary" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
