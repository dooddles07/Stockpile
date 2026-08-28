import { cookies } from "next/headers";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppProviders } from "@/components/providers/app-providers";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { TopBar } from "@/components/shell/top-bar";
import { OfflineBanner } from "@/components/states/offline-banner";
import { getCurrentUser, getRole } from "@/lib/auth/session";
import { navCounts } from "@/lib/repo/metrics";
import { notifications as allNotifications } from "@/lib/repo/ops";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [role, user, cookieStore, counts, notifications] = await Promise.all([
    getRole(),
    getCurrentUser(),
    cookies(),
    navCounts(),
    allNotifications(),
  ]);
  const unread = notifications.filter((n) => !n.read).length;
  const sidebarOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <AppProviders role={role} user={user}>
      <SidebarProvider defaultOpen={sidebarOpen}>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-[13px] focus:font-medium focus:text-primary-foreground"
        >
          Skip to main content
        </a>
        <AppSidebar counts={counts} />
        <SidebarInset className="min-w-0 bg-background">
          <TopBar notifications={notifications} unreadCount={unread} />
          <OfflineBanner />
          <main id="main" className="min-w-0 flex-1">
            {children}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </AppProviders>
  );
}
