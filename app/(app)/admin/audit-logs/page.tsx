import type { Metadata } from "next";
import { Download, ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { StatTile } from "@/components/record/field-grid";
import { AuditTable, type AuditTableRow } from "./audit-table";
import { db } from "@/lib/data/store";
import { userById } from "@/lib/repo/inventory";
import { NOW } from "@/lib/data/rng";
import { DAY_MS } from "@/lib/data/rng";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { humanize } from "@/lib/status";
import { qty } from "@/lib/format";
import { ActionButton } from "@/components/actions/action-button";

export const metadata: Metadata = {
  title: "Audit logs",
  description: "An append-only record of every change made in the system.",
};

export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const role = await getRole();
  if (!can(role, "audit")) return <PermissionDenied module="audit" role={role} />;

  const { q } = await searchParams;

  const rows: AuditTableRow[] = db.auditEntries.map((e) => {
    const user = userById.get(e.userId);
    return {
      id: e.id,
      ts: e.ts,
      user: user?.name ?? "—",
      userEmail: user?.email ?? "—",
      action: e.action,
      actionLabel: humanize(e.action),
      entity: e.entity,
      entityLabel: e.entityLabel,
      field: e.field,
      before: e.before,
      after: e.after,
      ip: e.ip,
      device: e.device,
    };
  });

  const weekAgo = NOW.getTime() - 7 * DAY_MS;
  const thisWeek = rows.filter((r) => new Date(r.ts).getTime() >= weekAgo);
  const permissionChanges = rows.filter((r) => r.action === "permission-change");
  const deletions = rows.filter((r) => r.action === "delete");

  const entities = [...new Set(rows.map((r) => r.entity))].sort();
  const users = [...new Set(rows.map((r) => r.user))].sort();

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Administration", href: "/admin/users" }, { label: "Audit logs" }]}
        title="Audit logs"
        description="Every change, who made it, what it was before and what it became. Entries are appended and never edited — a correction is a new entry, not a rewrite of an old one."
        actions={
          can(role, "audit", "export") && (
            <ActionButton
              variant="outline" size="sm" className="h-8"
              feedback="Export started"
              detail="Every entry matching the current filters, with its before and after values, as CSV."
            >
              <Download className="size-3.5" aria-hidden />
              Export log
            </ActionButton>
          )
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile label="Entries" value={qty(rows.length)} />
          <StatTile
            label="Last 7 days"
            value={qty(thisWeek.length)}
            hint={`${qty(new Set(thisWeek.map((r) => r.user)).size)} distinct users`}
          />
          <StatTile
            label="Permission changes"
            value={qty(permissionChanges.length)}
            tone={permissionChanges.length > 0 ? "warning" : "neutral"}
            hint="Who can do what changed"
          />
          <StatTile
            label="Deletions"
            value={qty(deletions.length)}
            tone={deletions.length > 0 ? "danger" : "neutral"}
          />
        </div>
      </PageHeader>

      <div className="p-4 sm:p-6">
        <div className="mb-3 flex items-start gap-2.5 rounded-lg border bg-surface px-4 py-3">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <p className="text-caption leading-relaxed text-muted-foreground">
            This log is what an auditor reads. It is append-only, retained for seven years, and
            captures the value before and after each change alongside the IP and device it came
            from. Nobody — including a Super Admin — can edit or remove an entry.
          </p>
        </div>

        <AuditTable rows={rows} entities={entities} users={users} initialSearch={q} />
      </div>
    </>
  );
}
