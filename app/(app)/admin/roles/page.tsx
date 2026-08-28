import Link from "next/link";
import { Fragment } from "react";
import type { Metadata } from "next";
import { ArrowRight, ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { Section, StatTile } from "@/components/record/field-grid";
import { StatusBadge } from "@/components/status/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ALL_MODULE_KEYS,
  LEVEL_LABEL,
  MODULE_GROUP,
  MODULE_LABEL,
  ROLES,
  levelFor,
  type AccessLevel,
} from "@/lib/auth/permissions";
import { db } from "@/lib/data/store";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { plural, qty } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Roles & permissions",
  description: "What each role can see and change, module by module.",
};

/** One glyph per level, so a whole row reads at a glance. */
const LEVEL_MARK: Record<AccessLevel, { mark: string; className: string }> = {
  none: { mark: "—", className: "text-muted-foreground/50" },
  read: { mark: "R", className: "text-status-neutral" },
  "read-export": { mark: "R+", className: "text-status-info" },
  write: { mark: "W", className: "text-status-success" },
  approve: { mark: "A", className: "text-status-warning" },
  manage: { mark: "M", className: "text-status-purple" },
};

export default async function RolesPage() {
  const role = await getRole();
  if (!can(role, "roles")) return <PermissionDenied module="roles" role={role} />;

  const usersByRole = new Map<string, number>();
  for (const u of db.users) {
    usersByRole.set(u.role, (usersByRole.get(u.role) ?? 0) + 1);
  }

  // Group the modules the way the navigation does, so the matrix reads in the
  // same order as the product itself.
  const groups = [...new Set(ALL_MODULE_KEYS.map((m) => MODULE_GROUP[m]))];

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Administration", href: "/admin/users" }, { label: "Roles & permissions" }]}
        title="Roles &amp; permissions"
        description="Access is declared once per role per module rather than as thousands of individual toggles. The letters expand into the actions each level allows."
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile label="Roles" value={qty(ROLES.length)} />
          <StatTile label="Modules" value={qty(ALL_MODULE_KEYS.length)} />
          <StatTile label="Users assigned" value={qty(db.users.length)} />
          <StatTile
            label="Your role"
            value={ROLES.find((r) => r.id === role)?.label ?? role}
            tone="info"
          />
        </div>
      </PageHeader>

      <div className="grid gap-4 p-4 sm:p-6">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {ROLES.map((r) => (
            <Link
              key={r.id}
              href={`/admin/roles/${r.id}`}
              className={cn(
                "group/role flex flex-col rounded-lg border bg-surface p-4 shadow-xs transition-colors hover:border-border-strong hover:bg-surface-hover",
                r.id === role && "border-primary",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <ShieldCheck className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <h2 className="text-card-title min-w-0 truncate">{r.label}</h2>
                </div>
                <ArrowRight
                  className="mt-0.5 size-3.5 shrink-0 -translate-x-1 text-muted-foreground opacity-0 transition-all group-hover/role:translate-x-0 group-hover/role:opacity-100"
                  aria-hidden
                />
              </div>

              <p className="mt-1.5 flex-1 text-caption leading-relaxed text-muted-foreground">
                {r.summary}
              </p>

              <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
                {r.id === role ? (
                  <StatusBadge label="Your role" tone="info" />
                ) : (
                  <span className="text-caption text-muted-foreground">
                    {plural(usersByRole.get(r.id) ?? 0, "user")}
                  </span>
                )}
                <span className="tabular text-caption text-muted-foreground" data-numeric>
                  {qty(ALL_MODULE_KEYS.filter((m) => levelFor(r.id, m) !== "none").length)} modules
                </span>
              </div>
            </Link>
          ))}
        </div>

        <Section
          title="Permission matrix"
          description="Every role against every module. R = view, R+ = view and export, W = edit, A = edit and approve, M = full control."
          contentClassName="p-0"
        >
          <div className="overflow-x-auto">
            <Table className="border-separate border-spacing-0 text-table">
              <TableHeader className="sticky top-0 z-10">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="sticky left-0 z-20 min-w-[13rem] border-b border-r bg-surface-sunken px-3 text-[11px] font-semibold uppercase text-muted-foreground">
                    Module
                  </TableHead>
                  {ROLES.map((r) => (
                    <TableHead
                      key={r.id}
                      className={cn(
                        "border-b bg-surface-sunken px-2 text-center text-[11px] font-semibold uppercase text-muted-foreground",
                        r.id === role && "text-foreground",
                      )}
                    >
                      <span className="block max-w-[5.5rem] leading-tight">{r.label}</span>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>

              <TableBody>
                {groups.map((group) => (
                  <Fragment key={group}>
                    <TableRow className="hover:bg-transparent">
                      <TableCell
                        colSpan={ROLES.length + 1}
                        className="border-b bg-surface-sunken/60 px-3 py-1.5 text-overline text-muted-foreground"
                      >
                        {group}
                      </TableCell>
                    </TableRow>

                    {ALL_MODULE_KEYS.filter((m) => MODULE_GROUP[m] === group).map((moduleKey) => (
                      <TableRow key={moduleKey} className="border-b">
                        <TableCell className="sticky left-0 z-10 border-b border-r bg-surface px-3 py-1.5 font-medium">
                          {MODULE_LABEL[moduleKey]}
                        </TableCell>

                        {ROLES.map((r) => {
                          const level = levelFor(r.id, moduleKey);
                          const meta = LEVEL_MARK[level];
                          return (
                            <TableCell
                              key={r.id}
                              className={cn(
                                "border-b px-2 py-1.5 text-center",
                                r.id === role && "bg-accent/40",
                              )}
                            >
                              <Tooltip>
                                <TooltipTrigger
                                  render={
                                    <span
                                      className={cn(
                                        "cursor-help font-semibold tabular",
                                        meta.className,
                                      )}
                                    />
                                  }
                                >
                                  {meta.mark}
                                </TooltipTrigger>
                                <TooltipContent>
                                  {r.label} · {MODULE_LABEL[moduleKey]}: {LEVEL_LABEL[level]}
                                </TooltipContent>
                              </Tooltip>
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t bg-surface-sunken px-3 py-2.5">
            {(Object.keys(LEVEL_MARK) as AccessLevel[]).map((level) => (
              <span key={level} className="flex items-center gap-1.5 text-caption">
                <span className={cn("w-5 text-center font-semibold", LEVEL_MARK[level].className)}>
                  {LEVEL_MARK[level].mark}
                </span>
                <span className="text-muted-foreground">{LEVEL_LABEL[level]}</span>
              </span>
            ))}
          </div>
        </Section>
      </div>
    </>
  );
}
