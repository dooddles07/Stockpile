"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Package, Star, Warehouse } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NAV, NAV_INDEX, type NavItem } from "@/lib/nav";
import { useRole } from "@/components/providers/role-provider";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { cn } from "@/lib/utils";
import type { NavCounts } from "@/lib/repo/metrics";

const FAVORITES_KEY = "stockpile:favorites";
const EMPTY_FAVORITES: string[] = [];

const WORKSPACES = [
  { id: "stockpile-na", name: "Stockpile North America", detail: "6 sites · USD" },
  { id: "stockpile-eu", name: "Stockpile Europe", detail: "4 sites · EUR" },
  { id: "stockpile-apac", name: "Stockpile APAC", detail: "2 sites · SGD" },
];

function useFavorites() {
  const [favorites, setFavorites] = useLocalStorage<string[]>(FAVORITES_KEY, EMPTY_FAVORITES);
  const toggle = useCallback(
    (href: string) =>
      setFavorites(
        favorites.includes(href) ? favorites.filter((h) => h !== href) : [...favorites, href],
      ),
    [favorites, setFavorites],
  );
  return { favorites, toggle };
}

export function AppSidebar({ counts, companyName }: { counts: NavCounts; companyName: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { can } = useRole();
  const { favorites, toggle } = useFavorites();
  const [workspace, setWorkspace] = useState(WORKSPACES[0]);

  const currentView = searchParams.get("view");

  const isActive = useCallback(
    (item: NavItem) => {
      const [base, query] = item.href.split("?");
      if (query) {
        const wanted = new URLSearchParams(query).get("view");
        return pathname === base && currentView === wanted;
      }
      if (pathname === base) return !currentView || !NAV_INDEX.some((n) => n.href.startsWith(`${base}?`));
      if (item.match?.some((m) => pathname.startsWith(m))) return true;
      return pathname.startsWith(`${base}/`);
    },
    [pathname, currentView],
  );

  const sections = useMemo(
    () =>
      NAV.map((section) => ({
        ...section,
        items: section.items.filter((item) => can(item.module)),
      })).filter((section) => section.items.length > 0),
    [can],
  );

  const favoriteItems = useMemo(
    () => NAV_INDEX.filter((item) => favorites.includes(item.href) && can(item.module)),
    [favorites, can],
  );

  const renderItem = (item: NavItem, key: string) => {
    const active = isActive(item);
    const badgeCount = item.badge ? counts[item.badge] : 0;
    const starred = favorites.includes(item.href);

    return (
      <SidebarMenuItem key={key} className="group/nav">
        <SidebarMenuButton
          isActive={active}
          tooltip={item.label}
          render={<Link href={item.href} prefetch={false} />}
        >
          <item.icon aria-hidden />
          <span>{item.label}</span>
        </SidebarMenuButton>

        {badgeCount > 0 && (
          <SidebarMenuBadge
            className={cn(
              "pointer-events-none tabular",
              item.badge === "approvals" && "text-status-warning",
              item.badge === "lowStock" && "text-status-danger",
              "group-hover/nav:opacity-0",
            )}
          >
            {badgeCount > 99 ? "99+" : badgeCount}
          </SidebarMenuBadge>
        )}

        <SidebarMenuAction
          onClick={() => toggle(item.href)}
          aria-label={starred ? `Unpin ${item.label}` : `Pin ${item.label} to favorites`}
          aria-pressed={starred}
          className={cn(
            "opacity-0 transition-opacity group-hover/nav:opacity-100 focus-visible:opacity-100",
            starred && "opacity-100",
          )}
        >
          <Star className={cn("size-3.5", starred && "fill-status-warning text-status-warning")} />
        </SidebarMenuAction>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader className="border-b border-sidebar-border p-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring"
              />
            }
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Package className="size-4" strokeWidth={2} aria-hidden />
            </span>
            <span className="grid min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <span className="truncate text-[13px] font-semibold leading-tight">{companyName}</span>
              <span className="truncate text-[11px] leading-tight text-muted-foreground">
                {workspace.name}
              </span>
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel className="text-overline text-muted-foreground">
              Workspaces
            </DropdownMenuLabel>
            {WORKSPACES.map((ws) => (
              <DropdownMenuItem key={ws.id} onClick={() => setWorkspace(ws)} className="gap-2">
                <Warehouse className="size-4 text-muted-foreground" aria-hidden />
                <span className="grid flex-1">
                  <span className="text-[13px] font-medium">{ws.name}</span>
                  <span className="text-[11px] text-muted-foreground">{ws.detail}</span>
                </span>
                {ws.id === workspace.id && <Check className="size-4" aria-hidden />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarHeader>

      <SidebarContent className="gap-0">
        {favoriteItems.length > 0 && (
          <>
            <SidebarGroup className="py-2">
              <SidebarGroupLabel className="text-overline">Favorites</SidebarGroupLabel>
              <SidebarMenu>{favoriteItems.map((item) => renderItem(item, `fav-${item.href}`))}</SidebarMenu>
            </SidebarGroup>
            <SidebarSeparator className="mx-2" />
          </>
        )}

        {sections.map((section) => (
          <SidebarGroup key={section.label} className="py-2">
            <SidebarGroupLabel className="text-overline">{section.label}</SidebarGroupLabel>
            <SidebarMenu>{section.items.map((item) => renderItem(item, item.href))}</SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-2 group-data-[collapsible=icon]:hidden">
        <p className="px-1.5 text-[11px] leading-relaxed text-muted-foreground">
          Stockpile 4.2 · Data as of 27 Aug 2026
        </p>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
