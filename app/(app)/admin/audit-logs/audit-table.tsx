"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ScrollText } from "lucide-react";

import { DataTable } from "@/components/data-table/data-table";
import { ColumnHeader } from "@/components/data-table/column-header";
import { PersonCell } from "@/components/data-table/columns";
import { StatusBadge } from "@/components/status/status-badge";
import { EmptyState } from "@/components/states";
import { useRole } from "@/components/providers/role-provider";
import { dateTime } from "@/lib/format";
import { humanize } from "@/lib/status";
import type { StatusTone } from "@/lib/types";

export interface AuditTableRow {
  id: string;
  ts: string;
  user: string;
  userEmail: string;
  action: string;
  actionLabel: string;
  entity: string;
  entityLabel: string;
  field: string | null;
  before: string | null;
  after: string | null;
  ip: string;
  device: string;
}

const ACTION_TONE: Record<string, StatusTone> = {
  create: "success",
  update: "info",
  delete: "danger",
  approve: "success",
  reject: "danger",
  login: "neutral",
  export: "purple",
  "permission-change": "warning",
};

const ACTION_OPTIONS = Object.keys(ACTION_TONE).map((value) => ({
  value: humanize(value),
  label: humanize(value),
  tone: ACTION_TONE[value],
}));

export function AuditTable({
  rows,
  entities,
  users,
  initialSearch,
}: {
  rows: AuditTableRow[];
  entities: string[];
  users: string[];
  initialSearch?: string;
}) {
  const { can } = useRole();

  const columns = useMemo<ColumnDef<AuditTableRow, unknown>[]>(
    () => [
      {
        accessorKey: "ts",
        size: 156,
        meta: { label: "When" },
        header: ({ column }) => <ColumnHeader column={column} title="When" />,
        cell: ({ getValue }) => (
          <span className="text-code whitespace-nowrap text-muted-foreground">
            {dateTime(getValue<string>())}
          </span>
        ),
      },
      {
        accessorKey: "actionLabel",
        size: 150,
        meta: { label: "Action" },
        header: ({ column }) => <ColumnHeader column={column} title="Action" />,
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
        cell: ({ row }) => (
          <StatusBadge
            label={row.original.actionLabel}
            tone={ACTION_TONE[row.original.action] ?? "neutral"}
          />
        ),
      },
      {
        accessorKey: "user",
        size: 200,
        meta: { label: "User" },
        header: ({ column }) => <ColumnHeader column={column} title="User" />,
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
        cell: ({ row }) => <PersonCell name={row.original.user} sub={row.original.userEmail} />,
      },
      {
        accessorKey: "entity",
        size: 150,
        meta: { label: "Entity" },
        header: ({ column }) => <ColumnHeader column={column} title="Entity" />,
        filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
      },
      {
        accessorKey: "entityLabel",
        size: 170,
        meta: { label: "Record" },
        header: ({ column }) => <ColumnHeader column={column} title="Record" />,
        cell: ({ getValue }) => (
          <span className="text-code truncate">{getValue<string>()}</span>
        ),
      },
      {
        accessorKey: "field",
        size: 140,
        meta: { label: "Field" },
        header: ({ column }) => <ColumnHeader column={column} title="Field" />,
        cell: ({ getValue }) =>
          getValue<string | null>() ? (
            <span className="text-code text-muted-foreground">{getValue<string>()}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "before",
        size: 168,
        meta: { label: "Before" },
        header: ({ column }) => <ColumnHeader column={column} title="Before" />,
        cell: ({ getValue }) =>
          getValue<string | null>() ? (
            <span className="text-code truncate text-status-danger">{getValue<string>()}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "after",
        size: 168,
        meta: { label: "After" },
        header: ({ column }) => <ColumnHeader column={column} title="After" />,
        cell: ({ getValue }) =>
          getValue<string | null>() ? (
            <span className="text-code truncate text-status-success">{getValue<string>()}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        accessorKey: "ip",
        size: 132,
        meta: { label: "IP address" },
        header: ({ column }) => <ColumnHeader column={column} title="IP" />,
        cell: ({ getValue }) => (
          <span className="text-code text-muted-foreground">{getValue<string>()}</span>
        ),
      },
      {
        accessorKey: "device",
        size: 200,
        meta: { label: "Device" },
        header: ({ column }) => <ColumnHeader column={column} title="Device" />,
        cell: ({ getValue }) => (
          <span className="truncate text-muted-foreground">{getValue<string>()}</span>
        ),
      },
    ],
    [],
  );

  return (
    <DataTable
      tableId="audit-logs"
      columns={columns}
      data={rows}
      getRowId={(row) => row.id}
      searchPlaceholder="Search record, field or value…"
      initialSearch={initialSearch}
      exportName="audit-log"
      canExport={can("audit", "export")}
      totalLabel="audit entries"
      pageSize={50}
      defaultSort={[{ id: "ts", desc: true }]}
      defaultVisibility={{ device: false, ip: false }}
      facets={[
        { columnId: "actionLabel", title: "Action", options: ACTION_OPTIONS },
        {
          columnId: "entity",
          title: "Entity",
          options: entities.map((e) => ({ value: e, label: e })),
        },
        { columnId: "user", title: "User", options: users.map((u) => ({ value: u, label: u })) },
      ]}
      empty={
        <EmptyState
          icon={ScrollText}
          title="No audit entries match"
          description="The audit log is append-only — nothing is ever edited or removed from it. Narrow or clear the filters to find the entry you are looking for."
        />
      }
    />
  );
}
