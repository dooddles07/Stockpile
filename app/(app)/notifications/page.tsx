import Link from "next/link";
import type { Metadata } from "next";
import { Bell, Settings } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/states";
import { Section, StatTile } from "@/components/record/field-grid";
import { StatusBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import { notifications as allNotifications } from "@/lib/repo/ops";
import { indexById, users } from "@/lib/repo/reference";
import { NOW, DAY_MS } from "@/lib/data/rng";
import { plural, qty, relative } from "@/lib/format";
import { humanize, priorityMeta } from "@/lib/status";
import { cn } from "@/lib/utils";
import { DismissButton } from "./dismiss-button";

export const metadata: Metadata = {
  title: "Notifications",
  description: "Everything the system has flagged, newest first.",
};

export default async function NotificationsPage() {
  const [notifications, userById] = await Promise.all([allNotifications(), indexById(users)]);
  const unread = notifications.filter((n) => !n.read);
  const critical = notifications.filter((n) => n.priority === "critical");

  const dayAgo = NOW.getTime() - DAY_MS;
  const today = notifications.filter((n) => new Date(n.ts).getTime() >= dayAgo);

  // Grouped by category so a run of stock alerts does not bury the one
  // integration failure that actually needs a person.
  const categories = [...new Set(notifications.map((n) => n.category))];

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Grouped by what they are about, so a run of stock alerts does not bury the one thing that needs a person."
        actions={
          <Button variant="outline" size="sm" className="h-8" render={<Link href="/settings/notifications" />}>
            <Settings className="size-3.5" aria-hidden />
            Notification settings
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile label="Notifications" value={qty(notifications.length)} />
          <StatTile
            label="Unread"
            value={qty(unread.length)}
            tone={unread.length > 0 ? "info" : "neutral"}
          />
          <StatTile
            label="Critical"
            value={qty(critical.length)}
            tone={critical.length > 0 ? "danger" : "success"}
            hint={critical.length > 0 ? "Need attention now" : "Nothing urgent"}
          />
          <StatTile label="Last 24 hours" value={qty(today.length)} />
        </div>
      </PageHeader>

      <div className="grid gap-4 p-4 sm:p-6">
        {notifications.length === 0 ? (
          <div className="rounded-lg border bg-surface">
            <EmptyState
              icon={Bell}
              title="Nothing to report"
              description="Alerts appear here when stock runs low, an approval is waiting, or an integration stops syncing."
            />
          </div>
        ) : (
          categories.map((category) => {
            const items = notifications.filter((n) => n.category === category);
            const categoryUnread = items.filter((n) => !n.read).length;

            return (
              <Section
                key={category}
                title={humanize(category)}
                description={`${plural(items.length, "notification")}${categoryUnread > 0 ? ` · ${qty(categoryUnread)} unread` : ""}`}
                contentClassName="p-0"
              >
                <ul className="divide-y">
                  {items.map((n) => {
                    const tone = priorityMeta(n.priority);
                    const actor = n.actorId ? userById.get(n.actorId) : null;

                    return (
                      <li
                        key={n.id}
                        className={cn(
                          "flex items-stretch transition-colors",
                          !n.read && "bg-surface-sunken/40",
                        )}
                      >
                        <Link
                          href={n.href}
                          className="flex flex-1 gap-3 px-4 py-3 transition-colors hover:bg-surface-hover"
                        >
                          <span
                            className={cn(
                              "mt-1.5 size-1.5 shrink-0 rounded-full",
                              n.read ? "bg-transparent" : "bg-status-info",
                            )}
                            aria-label={n.read ? undefined : "Unread"}
                          />

                          <span className="grid min-w-0 flex-1 gap-1">
                            <span className="flex flex-wrap items-start justify-between gap-2">
                              <span
                                className={cn("min-w-0 text-[13px] leading-snug", !n.read && "font-medium")}
                              >
                                {n.title}
                              </span>
                              <span className="flex shrink-0 items-center gap-2">
                                <StatusBadge label={tone.label} tone={tone.tone} />
                                <span className="text-caption text-muted-foreground">
                                  {relative(n.ts)}
                                </span>
                              </span>
                            </span>

                            <span className="text-caption leading-relaxed text-muted-foreground">
                              {n.body}
                            </span>

                            {actor && (
                              <span className="text-[11px] text-muted-foreground">
                                raised by {actor.name}
                              </span>
                            )}
                          </span>
                        </Link>
                        <DismissButton id={n.id} label={n.title} />
                      </li>
                    );
                  })}
                </ul>
              </Section>
            );
          })
        )}
      </div>
    </>
  );
}
