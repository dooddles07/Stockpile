import Link from "next/link";
import { Fragment } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Check, Lock, Minus, Pencil, ShieldCheck } from "lucide-react";

import { RecordHeader, StatStrip } from "@/components/record/record-header";
import { Section, StatTile } from "@/components/record/field-grid";
import { SimpleTable } from "@/components/record/simple-table";
import { StatusBadge } from "@/components/status/status-badge";
import { EmptyState, PermissionDenied } from "@/components/states";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ALL_MODULE_KEYS,
  LEVEL_LABEL,
  MODULE_GROUP,
  MODULE_LABEL,
  PERMISSION_ACTIONS,
  ROLES,
  ROLE_BY_ID,
  actionsFor,
  levelFor,
} from "@/lib/auth/permissions";
import { indexById, users as allUsers, warehouses as allWarehouses } from "@/lib/repo/reference";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { humanize } from "@/lib/status";
import { plural, qty, relative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/types";

export async function generateStaticParams() {
  return ROLES.map((r) => ({ id: r.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const meta = ROLE_BY_ID.get(id as Role);
  return meta
    ? { title: meta.label, description: meta.summary }
    : { title: "Role not found" };
}

export default async function RoleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const role = await getRole();
  if (!can(role, "roles")) return <PermissionDenied module="roles" role={role} />;

  const { id } = await params;
  const target = ROLE_BY_ID.get(id as Role);
  if (!target) notFound();

  const canEdit = can(role, "roles", "manage");
  const warehouseById = await indexById(allWarehouses);
  const holders = (await allUsers()).filter((u) => u.role === target.id);
  const granted = ALL_MODULE_KEYS.filter((m) => levelFor(target.id, m) !== "none");
  const writable = ALL_MODULE_KEYS.filter((m) => can(target.id, m, "edit"));
  const approvable = ALL_MODULE_KEYS.filter((m) => can(target.id, m, "approve"));

  const groups = [...new Set(ALL_MODULE_KEYS.map((m) => MODULE_GROUP[m]))];

  return (
    <>
      <RecordHeader
        crumbs={[
          { label: "Administration", href: "/admin/users" },
          { label: "Roles & permissions", href: "/admin/roles" },
          { label: target.label },
        ]}
        backHref="/admin/roles"
        backLabel="Roles"
        leading={
          <span className="flex size-9 items-center justify-center rounded-md border bg-surface-sunken">
            <ShieldCheck className="size-4 text-muted-foreground" aria-hidden />
          </span>
        }
        title={target.label}
        subtitle={target.summary}
        badge={target.id === role ? <StatusBadge label="Your role" tone="info" size="md" /> : undefined}
        meta={
          <>
            <span className="text-caption text-muted-foreground">
              {plural(holders.length, "user")} hold this role
            </span>
            <span className="text-caption text-muted-foreground">
              {plural(granted.length, "module")} of {ALL_MODULE_KEYS.length}
            </span>
          </>
        }
        actions={
          canEdit ? (
            <Button size="sm" className="h-8" render={<Link href={`/admin/roles/${target.id}/edit`} />}>
              <Pencil className="size-3.5" aria-hidden />
              Edit permissions
            </Button>
          ) : (
            <StatusBadge label="Read only" tone="neutral" size="md" />
          )
        }
      >
        <StatStrip columns={4}>
          <StatTile label="Users" value={qty(holders.length)} />
          <StatTile
            label="Modules visible"
            value={qty(granted.length)}
            hint={`of ${ALL_MODULE_KEYS.length}`}
          />
          <StatTile
            label="Can edit"
            value={qty(writable.length)}
            tone={writable.length > 0 ? "success" : "neutral"}
          />
          <StatTile
            label="Can approve"
            value={qty(approvable.length)}
            tone={approvable.length > 0 ? "warning" : "neutral"}
          />
        </StatStrip>
      </RecordHeader>

      <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-3">
        <div className="grid content-start gap-4 lg:col-span-2">
          <Section
            title="Permissions by module"
            description="A level expands into a set of actions. Ticks show exactly what this role can do."
            contentClassName="p-0"
          >
            <div className="overflow-x-auto">
              <Table className="border-separate border-spacing-0 text-table">
                <TableHeader className="sticky top-0 z-10">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="sticky left-0 z-20 min-w-[12rem] border-b border-r bg-surface-sunken px-3 text-[11px] font-semibold uppercase text-muted-foreground">
                      Module
                    </TableHead>
                    <TableHead className="border-b bg-surface-sunken px-3 text-[11px] font-semibold uppercase text-muted-foreground">
                      Level
                    </TableHead>
                    {PERMISSION_ACTIONS.map((action) => (
                      <TableHead
                        key={action}
                        className="border-b bg-surface-sunken px-2 text-center text-[11px] font-semibold uppercase text-muted-foreground"
                      >
                        {humanize(action)}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {groups.map((group) => (
                    <Fragment key={group}>
                      <TableRow className="hover:bg-transparent">
                        <TableCell
                          colSpan={PERMISSION_ACTIONS.length + 2}
                          className="border-b bg-surface-sunken/60 px-3 py-1.5 text-overline text-muted-foreground"
                        >
                          {group}
                        </TableCell>
                      </TableRow>

                      {ALL_MODULE_KEYS.filter((m) => MODULE_GROUP[m] === group).map((moduleKey) => {
                        const level = levelFor(target.id, moduleKey);
                        const allowed = actionsFor(target.id, moduleKey);
                        const denied = level === "none";

                        return (
                          <TableRow key={moduleKey} className={cn("border-b", denied && "opacity-55")}>
                            <TableCell className="sticky left-0 z-10 border-b border-r bg-surface px-3 py-1.5 font-medium">
                              {MODULE_LABEL[moduleKey]}
                            </TableCell>
                            <TableCell className="border-b px-3 py-1.5">
                              {denied ? (
                                <span className="flex items-center gap-1.5 text-muted-foreground">
                                  <Lock className="size-3" aria-hidden />
                                  No access
                                </span>
                              ) : (
                                <StatusBadge
                                  label={LEVEL_LABEL[level]}
                                  tone={
                                    level === "manage"
                                      ? "purple"
                                      : level === "approve"
                                        ? "warning"
                                        : level === "write"
                                          ? "success"
                                          : level === "read-export"
                                            ? "info"
                                            : "neutral"
                                  }
                                  showDot={false}
                                />
                              )}
                            </TableCell>

                            {PERMISSION_ACTIONS.map((action) => (
                              <TableCell key={action} className="border-b px-2 py-1.5 text-center">
                                {allowed.includes(action) ? (
                                  <Check
                                    className="mx-auto size-3.5 text-status-success"
                                    aria-label={`Can ${action}`}
                                  />
                                ) : (
                                  <Minus
                                    className="mx-auto size-3 text-muted-foreground/40"
                                    aria-label={`Cannot ${action}`}
                                  />
                                )}
                              </TableCell>
                            ))}
                          </TableRow>
                        );
                      })}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Section>
        </div>

        <div className="grid content-start gap-4">
          <Section title="Accountable for" description="What this role owns day to day.">
            <ul className="grid gap-2">
              {target.responsibilities.map((item) => (
                <li key={item} className="flex items-start gap-2 text-[13px]">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-status-success" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section
            title="People with this role"
            description={`${plural(holders.length, "user")} currently assigned.`}
            actions={
              can(role, "users") && (
                <Button variant="outline" size="sm" className="h-7" render={<Link href="/admin/users" />}>
                  All users
                </Button>
              )
            }
            contentClassName="p-0"
          >
            <SimpleTable
              rows={holders}
              getRowId={(u) => u.id}
              columns={[
                {
                  key: "name",
                  header: "User",
                  cell: (u) => (
                    <span className="grid gap-0.5">
                      <span className="font-medium">{u.name}</span>
                      <span className="truncate text-[11px] text-muted-foreground">{u.email}</span>
                    </span>
                  ),
                },
                {
                  key: "site",
                  header: "Site",
                  cell: (u) =>
                    u.warehouseId ? (
                      <span className="font-medium">{warehouseById.get(u.warehouseId)?.code}</span>
                    ) : (
                      <span className="text-muted-foreground">all</span>
                    ),
                },
                { key: "status", header: "Status", cell: (u) => <StatusBadge status={u.status} /> },
                {
                  key: "lastLogin",
                  header: "Last login",
                  align: "right",
                  cell: (u) => (
                    <span className="text-muted-foreground">
                      {u.lastLoginAt ? relative(u.lastLoginAt) : "never"}
                    </span>
                  ),
                },
              ]}
              empty={
                <EmptyState
                  title="Nobody holds this role"
                  description="The role exists but is unassigned. Its permissions have no effect until someone is given it."
                  className="py-10"
                />
              }
            />
          </Section>
        </div>
      </div>
    </>
  );
}
