import Link from "next/link";
import { Boxes, LayoutDashboard } from "lucide-react";

import { AppProviders } from "@/components/providers/app-providers";
import { OfflineBanner } from "@/components/states/offline-banner";
import { OperatorTabs } from "./operator-tabs";
import { Button } from "@/components/ui/button";
import { getCurrentUser, getRole } from "@/lib/auth/session";
import { warehouseById } from "@/lib/repo/inventory";
import { db } from "@/lib/data/store";
import { pendingApprovals } from "@/lib/repo/metrics";
import { can } from "@/lib/auth/permissions";
import { ROLE_BY_ID } from "@/lib/auth/permissions";

/**
 * The handheld surface.
 *
 * Deliberately not the desktop app squeezed narrow. An operator on the floor is
 * one-handed, wearing gloves, and doing one of four things — look something up,
 * scan it, receive it, or approve it. So: no sidebar, no data tables, 44px
 * targets, and a bottom tab bar where a thumb actually reaches.
 */
export default async function OperatorLayout({ children }: { children: React.ReactNode }) {
  const [role, user] = await Promise.all([getRole(), getCurrentUser()]);

  // A site is assumed rather than asked for: the handheld belongs to a building.
  const site = warehouseById.get(user.warehouseId ?? "") ?? db.warehouses[0];

  const approvals = can(role, "approvals")
    ? pendingApprovals().filter((a) => can(role, a.module, "approve")).length
    : 0;
  const receiving = can(role, "receiving")
    ? db.purchaseOrders.filter(
        (p) => ["ordered", "partially-received"].includes(p.status) && p.warehouseId === site.id,
      ).length +
      db.transfers.filter(
        (t) => ["in-transit", "partially-received"].includes(t.status) && t.toWarehouseId === site.id,
      ).length
    : 0;

  return (
    <AppProviders role={role} user={user}>
      <div className="flex min-h-screen flex-col bg-background pb-16">
        <header className="sticky top-0 z-30 border-b bg-surface">
          <div className="flex items-center gap-3 px-4 py-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Boxes className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold leading-tight">{site.code}</p>
              <p className="truncate text-[11px] leading-tight text-muted-foreground">
                {user.name} · {ROLE_BY_ID.get(role)?.label ?? role}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 shrink-0 px-2"
              render={<Link href="/dashboard" />}
            >
              <LayoutDashboard className="size-4" aria-hidden />
              <span className="sr-only sm:not-sr-only">Full app</span>
            </Button>
          </div>
        </header>

        <OfflineBanner />

        <main id="main" className="min-w-0 flex-1">
          {children}
        </main>

        <OperatorTabs approvals={approvals} receiving={receiving} />
      </div>
    </AppProviders>
  );
}
