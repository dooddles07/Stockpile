import Link from "next/link";
import type { Metadata } from "next";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { PermissionDenied } from "@/components/states";
import { StatTile } from "@/components/record/field-grid";
import { Button } from "@/components/ui/button";
import { UsersTable, type UserTableRow } from "./users-table";
import { db } from "@/lib/data/store";
import { warehouseById } from "@/lib/repo/inventory";
import { ROLE_BY_ID } from "@/lib/auth/permissions";
import { getRole } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { percent, qty } from "@/lib/format";

export const metadata: Metadata = {
  title: "Users",
  description: "Who has access, under which role.",
};

export default async function UsersPage() {
  const role = await getRole();
  if (!can(role, "users")) return <PermissionDenied module="users" role={role} />;

  const rows: UserTableRow[] = db.users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    roleLabel: ROLE_BY_ID.get(u.role)?.label ?? u.role,
    department: u.department,
    status: u.status,
    warehouseCode: u.warehouseId ? (warehouseById.get(u.warehouseId)?.code ?? null) : null,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
    twoFactor: u.twoFactor,
    phone: u.phone,
  }));

  const active = rows.filter((r) => r.status === "active");
  const invited = rows.filter((r) => r.status === "invited");
  const suspended = rows.filter((r) => r.status === "suspended");
  const withTwoFactor = rows.filter((r) => r.twoFactor);
  const departments = [...new Set(db.users.map((u) => u.department))].sort();

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Administration", href: "/admin/users" }, { label: "Users" }]}
        title="Users"
        description="Every user holds exactly one role. Changing someone's role changes what they can see and do immediately, and the change is written to the audit log."
        actions={
          can(role, "users", "manage") && (
            <Button size="sm" className="h-8" render={<Link href="/admin/users/new" />}>
              <Plus className="size-3.5" aria-hidden />
              Invite a user
            </Button>
          )
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile label="Users" value={qty(rows.length)} hint={`${qty(active.length)} active`} />
          <StatTile
            label="Pending invitations"
            value={qty(invited.length)}
            tone={invited.length > 0 ? "info" : "neutral"}
          />
          <StatTile
            label="Suspended"
            value={qty(suspended.length)}
            tone={suspended.length > 0 ? "warning" : "neutral"}
            hint="Access revoked, history kept"
          />
          <StatTile
            label="Two-factor coverage"
            value={percent(rows.length > 0 ? withTwoFactor.length / rows.length : 0, 0)}
            tone={
              withTwoFactor.length / Math.max(1, rows.length) >= 0.9
                ? "success"
                : withTwoFactor.length / Math.max(1, rows.length) >= 0.6
                  ? "warning"
                  : "danger"
            }
            hint={`${qty(rows.length - withTwoFactor.length)} without it`}
          />
        </div>
      </PageHeader>

      <div className="p-4 sm:p-6">
        <UsersTable rows={rows} departments={departments} />
      </div>
    </>
  );
}
