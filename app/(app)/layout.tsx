import { cookies } from "next/headers";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppProviders } from "@/components/providers/app-providers";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { TopBar } from "@/components/shell/top-bar";
import { OfflineBanner } from "@/components/states/offline-banner";
import { getCurrentUser, getRole } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { companySettings } from "@/lib/domain/settings";
import { navCounts } from "@/lib/repo/metrics";
import { notifications as allNotifications } from "@/lib/repo/ops";
import { roles as allRoles } from "@/lib/repo/reference";

/**
 * Every screen here reads the active role from a cookie and its data from
 * Postgres at request time, so nothing under this segment is prerenderable —
 * and a production build carries no connection string (see the CI `build` job).
 */
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [role, user, cookieStore, counts, notifications, roles, company] = await Promise.all([
    getRole(),
    getCurrentUser(),
    cookies(),
    navCounts(),
    allNotifications(),
    allRoles(),
    companySettings(getDb()),
  ]);
  const unread = notifications.filter((n) => !n.read).length;
  const sidebarOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <AppProviders role={role} user={user} roles={roles}>
      <SidebarProvider defaultOpen={sidebarOpen}>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-[13px] focus:font-medium focus:text-primary-foreground"
        >
          Skip to main content
        </a>
        <AppSidebar counts={counts} companyName={company.companyName} />
        <SidebarInset className="min-w-0 bg-background">
          <TopBar notifications={notifications} unreadCount={unread} />
          <OfflineBanner />
          <div id="main" className="min-w-0 flex-1">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </AppProviders>
  );
}
