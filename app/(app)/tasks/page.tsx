import Link from "next/link";
import type { Metadata } from "next";
import {
  BadgeCheck,
  ClipboardCheck,
  ClipboardList,
  ListChecks,
  PackageCheck,
  Search,
  ShoppingCart,
} from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/states";
import { Section, StatTile } from "@/components/record/field-grid";
import { StatusBadge } from "@/components/status/status-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { db } from "@/lib/data/store";
import { userByIdSync } from "@/lib/repo/inventory";
import { dueLabel, initials, plural, qty } from "@/lib/format";
import { humanize, priorityMeta } from "@/lib/status";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Tasks",
  description: "Work assigned across approvals, receiving, counting and picking.",
};

const TYPE_ICON = {
  approval: BadgeCheck,
  receiving: PackageCheck,
  count: ClipboardCheck,
  picking: ClipboardList,
  review: Search,
  reorder: ShoppingCart,
} as const;

/** Overdue first, then by priority, then by how soon it is due. */
const PRIORITY_RANK = { critical: 0, high: 1, normal: 2, low: 3 } as const;

export default async function TasksPage() {
  const tasks = [...db.tasks].sort((a, b) => {
    if (a.status === "overdue" !== (b.status === "overdue")) {
      return a.status === "overdue" ? -1 : 1;
    }
    const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (p !== 0) return p;
    return a.dueAt.localeCompare(b.dueAt);
  });

  const open = tasks.filter((t) => t.status !== "done");
  const overdue = tasks.filter((t) => t.status === "overdue");
  const inProgress = tasks.filter((t) => t.status === "in-progress");
  const critical = tasks.filter((t) => t.priority === "critical" && t.status !== "done");

  return (
    <>
      <PageHeader
        title="Tasks"
        description="Everything waiting on a person, in the order it should be picked up: overdue first, then by priority, then by how soon it is due."
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile label="Open" value={qty(open.length)} />
          <StatTile
            label="In progress"
            value={qty(inProgress.length)}
            tone={inProgress.length > 0 ? "info" : "neutral"}
          />
          <StatTile
            label="Overdue"
            value={qty(overdue.length)}
            tone={overdue.length > 0 ? "danger" : "success"}
          />
          <StatTile
            label="Critical"
            value={qty(critical.length)}
            tone={critical.length > 0 ? "danger" : "neutral"}
            hint={critical.length > 0 ? "Blocking something" : "Nothing blocking"}
          />
        </div>
      </PageHeader>

      <div className="p-4 sm:p-6">
        <Section
          title="Task queue"
          description={`${plural(open.length, "task")} open. Opening a task takes you to the record it is about.`}
          contentClassName="p-0"
        >
          {tasks.length === 0 ? (
            <EmptyState
              icon={ListChecks}
              title="Nothing assigned"
              description="Tasks are created by approvals, receiving, counting and reorder automation. An empty queue means the work is done."
            />
          ) : (
            <ul className="divide-y">
              {tasks.map((task) => {
                const Icon = TYPE_ICON[task.type];
                const tone = priorityMeta(task.priority);
                const assignee = userByIdSync.get(task.assignedTo);

                return (
                  <li key={task.id}>
                    <Link
                      href={task.href}
                      className="flex flex-wrap items-start gap-3 px-4 py-3.5 transition-colors hover:bg-surface-hover"
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border",
                          task.status === "overdue"
                            ? "border-status-danger-border bg-status-danger-bg text-status-danger"
                            : "bg-surface-sunken text-muted-foreground",
                        )}
                        aria-hidden
                      >
                        <Icon className="size-4" />
                      </span>

                      <span className="grid min-w-0 flex-1 gap-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="min-w-0 text-[13px] font-medium">{task.title}</span>
                          <StatusBadge label={humanize(task.type)} tone="neutral" showDot={false} />
                        </span>
                        <span className="text-caption leading-relaxed text-muted-foreground">
                          {task.detail}
                        </span>
                      </span>

                      <span className="flex shrink-0 items-center gap-3">
                        {assignee && (
                          <span className="hidden items-center gap-2 sm:flex">
                            <Avatar className="size-6">
                              <AvatarFallback className="bg-surface-sunken text-[10px] font-semibold text-muted-foreground">
                                {initials(assignee.name)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-caption text-muted-foreground">
                              {assignee.name}
                            </span>
                          </span>
                        )}

                        <span className="grid justify-items-end gap-1">
                          <StatusBadge label={tone.label} tone={tone.tone} />
                          <span
                            className={cn(
                              "text-caption",
                              task.status === "overdue"
                                ? "font-semibold text-status-danger"
                                : "text-muted-foreground",
                            )}
                          >
                            {dueLabel(task.dueAt)}
                          </span>
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}
