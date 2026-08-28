"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useTheme } from "next-themes";
import {
  Bell,
  BookOpen,
  Check,
  CircleHelp,
  Keyboard,
  LifeBuoy,
  LogOut,
  Moon,
  Search,
  Settings,
  Smartphone,
  Sun,
  UserCog,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CommandPalette } from "./command-palette";
import { useRole } from "@/components/providers/role-provider";
import { ROLES } from "@/lib/auth/permissions";
import { initials, relative } from "@/lib/format";
import { priorityMeta } from "@/lib/status";
import { StatusBadge } from "@/components/status/status-badge";
import { cn } from "@/lib/utils";
import type { AppNotification } from "@/lib/types";

export function TopBar({
  notifications,
  unreadCount,
}: {
  notifications: AppNotification[];
  unreadCount: number;
}) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Closing the palette should put the caret back on the search box. Opened by
  // shortcut there is no trigger to restore to, so focus falls to <body> and a
  // keyboard user restarts their tab order from the top of the page.
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  const { role, user, setRole, switching } = useRole();
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-surface px-3">
      <SidebarTrigger className="shrink-0" />
      <Separator orientation="vertical" className="mr-1 h-5" />

      <button
        type="button"
        ref={searchTriggerRef}
        onClick={() => setPaletteOpen(true)}
        className="group flex h-8 w-full min-w-0 max-w-md items-center gap-2 rounded-md border bg-surface-sunken px-2.5 text-left text-[13px] text-muted-foreground transition-colors hover:border-border-strong hover:bg-surface"
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className="hidden flex-1 truncate sm:inline">Search products, orders, suppliers…</span>
        <kbd className="hidden shrink-0 items-center gap-0.5 rounded border bg-surface px-1.5 font-sans text-[11px] font-medium text-muted-foreground sm:flex">
          <span className="text-[13px] leading-none">⌘</span>K
        </kbd>
      </button>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        {/* Role switcher — this build has no auth vendor; the switcher is how
            permission behaviour is exercised across every screen. */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                className={cn("h-8 gap-1.5 px-2.5", switching && "opacity-60")}
              />
            }
          >
            <UserCog className="size-3.5" aria-hidden />
            <span className="hidden text-[13px] font-medium md:inline">
              {ROLES.find((r) => r.id === role)?.label}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel className="text-overline text-muted-foreground">
              View as role
            </DropdownMenuLabel>
            {ROLES.map((r) => (
              <DropdownMenuItem key={r.id} onClick={() => setRole(r.id)} className="items-start gap-2">
                <span className="grid flex-1 gap-0.5">
                  <span className="text-[13px] font-medium">{r.label}</span>
                  <span className="text-[11px] leading-snug text-muted-foreground">{r.summary}</span>
                </span>
                {r.id === role && <Check className="mt-0.5 size-4 shrink-0" aria-hidden />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href="/admin/roles" />}>
              <Settings className="size-4" aria-hidden />
              Manage roles &amp; permissions
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Popover>
          <PopoverTrigger
            render={
              <Button variant="ghost" size="icon" className="relative size-8" aria-label={`Notifications, ${unreadCount} unread`} />
            }
          >
            <Bell className="size-4" aria-hidden />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-destructive-foreground">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </PopoverTrigger>
          <PopoverContent align="end" className="w-96 p-0">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="text-card-title">Notifications</span>
              <span className="text-caption text-muted-foreground">{unreadCount} unread</span>
            </div>
            <ScrollArea className="h-80">
              <ul className="divide-y">
                {notifications.slice(0, 8).map((n) => {
                  const tone = priorityMeta(n.priority);
                  return (
                    <li key={n.id}>
                      <Link
                        href={n.href}
                        className="flex gap-2.5 px-3 py-2.5 transition-colors hover:bg-surface-hover"
                      >
                        <span
                          className={cn(
                            "mt-1.5 size-1.5 shrink-0 rounded-full",
                            n.read ? "bg-transparent" : "bg-status-info",
                          )}
                          aria-hidden
                        />
                        <span className="grid min-w-0 flex-1 gap-1">
                          <span className="flex items-start justify-between gap-2">
                            <span className={cn("text-[13px] leading-snug", !n.read && "font-medium")}>
                              {n.title}
                            </span>
                            <StatusBadge label={tone.label} tone={tone.tone} className="shrink-0" />
                          </span>
                          <span className="line-clamp-2 text-caption text-muted-foreground">{n.body}</span>
                          <span className="text-caption text-muted-foreground">{relative(n.ts)}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
            <div className="border-t p-2">
              <Button variant="ghost" size="sm" className="w-full" render={<Link href="/notifications" />}>
                View all notifications
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* The accessible name is swapped by CSS, not by React state: the theme
            is only known on the client, and branching on it during render is a
            hydration mismatch on every page load. */}
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        >
          <Sun className="size-4 dark:hidden" aria-hidden />
          <Moon className="hidden size-4 dark:block" aria-hidden />
          <span className="sr-only dark:hidden">Switch to dark theme</span>
          <span className="sr-only hidden dark:inline">Switch to light theme</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon" className="size-8" aria-label="Help" />}
          >
            <CircleHelp className="size-4" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem>
              <BookOpen className="size-4" aria-hidden />
              Documentation
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setPaletteOpen(true)}>
              <Keyboard className="size-4" aria-hidden />
              Keyboard shortcuts
              <span className="ml-auto text-caption text-muted-foreground">⌘K</span>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <LifeBuoy className="size-4" aria-hidden />
              Contact support
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <DropdownMenu>
          <DropdownMenuTrigger
            render={<button type="button" className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" aria-label="Account menu" />}
          >
            <Avatar className="size-8">
              <AvatarFallback className="bg-primary text-[11px] font-semibold text-primary-foreground">
                {initials(user.name)}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="grid gap-0.5">
              <span className="text-[13px] font-semibold">{user.name}</span>
              <span className="text-[11px] font-normal text-muted-foreground">{user.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem render={<Link href="/settings/company" />}>
                <Settings className="size-4" aria-hidden />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link href="/settings/security" />}>
                <UserCog className="size-4" aria-hidden />
                Security &amp; sessions
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link href="/operator" />}>
                <Smartphone className="size-4" aria-hidden />
                Handheld mode
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive">
              <LogOut className="size-4" aria-hidden />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        finalFocus={searchTriggerRef}
      />
    </header>
  );
}
