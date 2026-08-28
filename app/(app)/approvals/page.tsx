import type { Metadata } from "next";
import {
  ArrowLeftRight,
  BadgeCheck,
  ClipboardCheck,
  ShoppingCart,
  SlidersHorizontal,
} from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { EmptyState, PermissionDenied } from "@/components/states";
import { StatTile } from "@/components/record/field-grid";
import { WidgetCard, WidgetList, WidgetRow } from "@/components/widgets/widget-card";
import { StatusBadge } from "@/components/status/status-badge";
import { userByIdSync } from "@/lib/repo/inventory";
import { pendingApprovalsSync } from "@/lib/repo/metrics";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { daysUntil, money, qty, relative } from "@/lib/format";
import type { ModuleKey } from "@/lib/types";

export const metadata: Metadata = {
  title: "Approvals",
  description: "Everything across the business waiting on a decision from you.",
};

const GROUPS: {
  kind: "purchase-order" | "transfer" | "adjustment" | "count";
  title: string;
  icon: typeof ShoppingCart;
  module: ModuleKey;
  href: string;
  description: string;
}[] = [
  {
    kind: "purchase-order",
    title: "Purchase orders",
    icon: ShoppingCart,
    module: "purchase-orders",
    href: "/purchasing/purchase-orders",
    description: "Submitted orders above the sign-off threshold. Approving commits the spend.",
  },
  {
    kind: "transfer",
    title: "Stock transfers",
    icon: ArrowLeftRight,
    module: "transfers",
    href: "/warehousing/transfers",
    description: "Stock moving between sites. Approving releases it for despatch.",
  },
  {
    kind: "adjustment",
    title: "Stock adjustments",
    icon: SlidersHorizontal,
    module: "adjustments",
    href: "/inventory/adjustments",
    description: "Corrections over $500 of value. Approving writes them to the ledger.",
  },
  {
    kind: "count",
    title: "Stock counts",
    icon: ClipboardCheck,
    module: "counts",
    href: "/inventory/counts",
    description: "Counted variances awaiting review before they post as adjustments.",
  },
];

export default async function ApprovalsPage() {
  const role = await getRole();
  if (!can(role, "approvals")) return <PermissionDenied module="approvals" role={role} />;

  const all = pendingApprovalsSync();
  const visible = all.filter((item) => can(role, item.module));
  const canDecide = visible.filter((item) => can(role, item.module, "approve"));

  const oldest = visible[0];
  const oldestDays = oldest ? Math.abs(daysUntil(oldest.createdAt) ?? 0) : 0;
  const committed = visible.reduce((s, item) => s + Math.abs(item.amount), 0);

  return (
    <>
      <PageHeader
        title="Approvals"
        description={
          canDecide.length === visible.length
            ? "Every request routed to your role, in one queue rather than scattered across four modules."
            : `Requests across the business. Your role can decide on ${qty(canDecide.length)} of the ${qty(visible.length)} shown; the rest are here for visibility.`
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile label="Waiting" value={qty(visible.length)} tone={visible.length > 0 ? "warning" : "neutral"} />
          <StatTile
            label="You can decide"
            value={qty(canDecide.length)}
            tone={canDecide.length > 0 ? "warning" : "neutral"}
          />
          <StatTile label="Value held up" value={money(committed)} hint="Across every pending request" />
          <StatTile
            label="Oldest request"
            value={oldestDays > 0 ? `${oldestDays}d` : "—"}
            tone={oldestDays > 5 ? "danger" : oldestDays > 2 ? "warning" : "neutral"}
            hint={oldest ? oldest.number : "Queue is clear"}
          />
        </div>
      </PageHeader>

      <div className="p-4 sm:p-6">
        {visible.length === 0 ? (
          <div className="rounded-lg border bg-surface">
            <EmptyState
              icon={BadgeCheck}
              title="Nothing is waiting on a decision"
              description="Every purchase order, transfer, adjustment and count routed to your role has been actioned. New requests appear here and badge the sidebar."
            />
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {GROUPS.filter((group) => can(role, group.module)).map((group) => {
              const items = visible.filter((item) => item.kind === group.kind);
              const decidable = can(role, group.module, "approve");

              return (
                <WidgetCard
                  key={group.kind}
                  title={group.title}
                  count={items.length}
                  href={group.href}
                  hrefLabel="Open module"
                  description={
                    decidable
                      ? group.description
                      : `${group.description} Your role can view these but not decide on them.`
                  }
                >
                  {items.length === 0 ? (
                    <EmptyState
                      icon={group.icon}
                      title="Queue is clear"
                      description={`No ${group.title.toLowerCase()} are waiting.`}
                      className="py-10"
                    />
                  ) : (
                    <WidgetList>
                      {items.map((item) => {
                        const age = Math.abs(daysUntil(item.createdAt) ?? 0);
                        return (
                          <WidgetRow
                            key={item.id}
                            href={item.href}
                            title={item.title}
                            subtitle={`${item.subtitle} · raised by ${userByIdSync.get(item.requestedBy)?.name ?? "—"}`}
                            trailing={money(Math.abs(item.amount))}
                            trailingSub={
                              <span className="flex items-center justify-end gap-1.5">
                                {age > 5 && <StatusBadge label={`${age}d old`} tone="danger" />}
                                {age <= 5 && <span>{relative(item.createdAt)}</span>}
                              </span>
                            }
                          />
                        );
                      })}
                    </WidgetList>
                  )}
                </WidgetCard>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
