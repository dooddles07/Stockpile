"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { KeyRound, Mail, Pencil, ShieldCheck, UserRound, UserX } from "lucide-react";
import { toast } from "sonner";

import { DataTable } from "@/components/data-table/data-table";
import { ColumnHeader } from "@/components/data-table/column-header";
import { PersonCell, actionsColumn, selectColumn } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/states";
import { useRole } from "@/components/providers/role-provider";
import { date, plural, relative } from "@/lib/format";
import { statusMeta } from "@/lib/status";
import { ROLES } from "@/lib/auth/permissions";

export interface UserTableRow {
  id: string;
  name: string;
  email: string;
  role: string;
  roleLabel: string;
  department: string;
  status: string;
  warehouseCode: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  twoFactor: boolean;
  phone: string;
}

const STATUS_OPTIONS = (["active", "invited", "suspended"] as const).map((value) => ({
  value,
  label: statusMeta(value).label,
  tone: statusMeta(value).tone,
}));

export function UsersTable({
  rows,
  departments,
}: {
  rows: UserTableRow[];
  departments: string[];
}) {
  const { can } = useRole();
  const canManage = can("users", "manage");

  // Read inside the component, not at module scope: `ROLES` is empty until
  // `<RoleProvider>` (an ancestor) hydrates it from Postgres.
  const roleOptions = useMemo(() => ROLES.map((r) => ({ value: r.label, label: r.label })), []);

  const columns = useMemo<ColumnDef<UserTableRow, unknown>[]>(
    () => [
      selectColumn<UserTableRow>(),
      {
        accessorKey: "name",
        size: 230,
        minSize: 180,
        meta: { label: "User" },
        header: ({ column }) => <ColumnHeader column={column} title="User" />,
        cell: ({ row }) => <PersonCell name={row.original.name} sub={row.original.email} />,
      },
      {
        accessorKey: "roleLabel",
        size: 168,
        meta: { label: "Role" },
        header: ({ column }) => <ColumnHeader column={column} title="Role" />,
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
        cell: ({ row }) => (
          <Link
            href={`/admin/roles/${row.original.role}`}
            className="flex items-center gap-1.5 hover:underline"
          >
            <ShieldCheck className="size-3.5 text-muted-foreground" aria-hidden />
            {row.original.roleLabel}
          </Link>
        ),
      },
      {
        accessorKey: "department",
        size: 172,
        meta: { label: "Department" },
        header: ({ column }) => <ColumnHeader column={column} title="Department" />,
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
      },
      {
        accessorKey: "status",
        size: 116,
        meta: { label: "Status" },
        header: ({ column }) => <ColumnHeader column={column} title="Status" />,
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
        cell: ({ getValue }) => <StatusBadge status={getValue<string>()} />,
      },
      {
        accessorKey: "warehouseCode",
        size: 100,
        meta: { label: "Site" },
        header: ({ column }) => <ColumnHeader column={column} title="Site" />,
        cell: ({ getValue }) =>
          getValue<string | null>() ? (
            <span className="font-medium">{getValue<string>()}</span>
          ) : (
            <span className="text-muted-foreground">all sites</span>
          ),
      },
      {
        accessorKey: "twoFactor",
        size: 108,
        meta: { label: "2FA" },
        header: ({ column }) => <ColumnHeader column={column} title="2FA" />,
        cell: ({ getValue }) =>
          getValue<boolean>() ? (
            <StatusBadge label="Enabled" tone="success" />
          ) : (
            <StatusBadge label="Off" tone="warning" />
          ),
      },
      {
        accessorKey: "lastLoginAt",
        size: 128,
        meta: { label: "Last login", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Last login" align="right" />,
        cell: ({ getValue }) =>
          getValue<string | null>() ? (
            <span className="text-muted-foreground">{relative(getValue<string>())}</span>
          ) : (
            <span className="text-status-warning">never</span>
          ),
      },
      {
        accessorKey: "createdAt",
        size: 116,
        meta: { label: "Added", align: "right" },
        header: ({ column }) => <ColumnHeader column={column} title="Added" align="right" />,
        cell: ({ getValue }) => (
          <span className="text-muted-foreground">{date(getValue<string>())}</span>
        ),
      },
      actionsColumn<UserTableRow>([
        {
          label: "Edit user",
          icon: Pencil,
          onSelect: (r) => toast.info(`Editing ${r.name}`),
          hidden: () => !can("users", "edit"),
        },
        {
          label: "Change role",
          icon: ShieldCheck,
          href: (r) => `/admin/roles/${r.role}`,
          hidden: () => !canManage,
        },
        {
          label: "Resend invitation",
          icon: Mail,
          onSelect: (r) => toast.success(`Invitation resent to ${r.email}`),
          hidden: (r) => !canManage || r.status !== "invited",
        },
        {
          label: "Reset password",
          icon: KeyRound,
          separatorBefore: true,
          onSelect: (r) =>
            toast.success(`Password reset sent to ${r.email}`, {
              description: "The link expires in 60 minutes and the reset is written to the audit log.",
            }),
          hidden: () => !canManage,
        },
        {
          label: "Suspend access",
          icon: UserX,
          destructive: true,
          onSelect: (r) =>
            toast.warning(`${r.name} would be suspended`, {
              description: "Sessions end immediately. The account and its history are kept.",
            }),
          hidden: (r) => !canManage || r.status === "suspended",
        },
      ]),
    ],
    [can, canManage],
  );

  return (
    <DataTable
      tableId="users"
      columns={columns}
      data={rows}
      getRowId={(row) => row.id}
      searchPlaceholder="Search name, email or department…"
      exportName="users"
      canExport={can("users", "export")}
      totalLabel="users"
      defaultSort={[{ id: "name", desc: false }]}
      defaultVisibility={{ createdAt: false }}
      facets={[
        { columnId: "roleLabel", title: "Role", options: roleOptions },
        { columnId: "status", title: "Status", options: STATUS_OPTIONS },
        {
          columnId: "department",
          title: "Department",
          options: departments.map((d) => ({ value: d, label: d })),
        },
      ]}
      empty={
        <EmptyState
          icon={UserRound}
          title="No users match"
          description="Every user holds exactly one role, and the role decides what they can see and change."
          action={
            canManage ? (
              <Button size="sm" onClick={() => toast.info("Invite a user")}>
                Invite a user
              </Button>
            ) : undefined
          }
        />
      }
      bulkActions={(selected, clear) =>
        canManage ? (
          <>
            <Button
              size="sm"
              variant="secondary"
              className="h-7"
              onClick={() => {
                toast.success(`Password reset sent to ${plural(selected.length, "user")}`);
                clear();
              }}
            >
              <KeyRound className="size-3.5" aria-hidden />
              Reset passwords
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-7"
              onClick={() =>
                toast.warning(`${plural(selected.length, "user")} would be suspended`, {
                  description: "Sessions end immediately for each of them.",
                })
              }
            >
              <UserX className="size-3.5" aria-hidden />
              Suspend
            </Button>
          </>
        ) : null
      }
    />
  );
}
