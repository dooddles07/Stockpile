import Link from "next/link";
import { Lock, PackageOpen, RefreshCw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { MODULE_LABEL, ROLES, levelFor } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";
import type { ModuleKey, Role } from "@/lib/types";

/* ------------------------------------------------------------- empty ----- */

export function EmptyState({
  icon: Icon = PackageOpen,
  title,
  description,
  action,
  secondary,
  className,
  headingLevel = 2,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: React.ReactNode;
  secondary?: React.ReactNode;
  className?: string;
  /** 1 when this state IS the page (a 404), 2 when it sits inside one. */
  headingLevel?: 1 | 2;
}) {
  const Heading = `h${headingLevel}` as const;

  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-16 text-center", className)}>
      <span className="mb-4 flex size-11 items-center justify-center rounded-lg border bg-surface-sunken">
        <Icon className="size-5 text-muted-foreground" />
      </span>
      <Heading className="text-section">{title}</Heading>
      <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-muted-foreground">{description}</p>
      {(action || secondary) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondary}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- error ----- */

export function ErrorState({
  title = "Something went wrong",
  description,
  detail,
  onRetry,
  className,
  headingLevel = 2,
}: {
  title?: string;
  description: string;
  detail?: string;
  onRetry?: () => void;
  className?: string;
  /** 1 when this state IS the page, 2 when it sits inside one. */
  headingLevel?: 1 | 2;
}) {
  const Heading = `h${headingLevel}` as const;

  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-16 text-center", className)}>
      <span className="mb-4 flex size-11 items-center justify-center rounded-lg border border-status-danger-border bg-status-danger-bg">
        <TriangleAlert className="size-5 text-status-danger" />
      </span>
      <Heading className="text-section">{title}</Heading>
      <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-muted-foreground">{description}</p>
      {detail && (
        <p className="text-code mt-3 max-w-lg rounded-md border bg-surface-sunken px-3 py-2 text-left text-muted-foreground">
          {detail}
        </p>
      )}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-5" onClick={onRetry}>
          <RefreshCw className="size-4" aria-hidden />
          Try again
        </Button>
      )}
    </div>
  );
}

/* -------------------------------------------------------- permissions ---- */

/**
 * A denied screen must say who can see this and what to do next. A greyed-out
 * button with no explanation makes the operator file a ticket instead.
 */
export function PermissionDenied({
  module,
  role,
  action = "view",
}: {
  module: ModuleKey;
  role: Role;
  action?: string;
}) {
  const roleLabel = ROLES.find((r) => r.id === role)?.label ?? role;
  const allowed = ROLES.filter((r) => levelFor(r.id, module) !== "none" && r.id !== role);

  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <span className="mb-4 flex size-11 items-center justify-center rounded-lg border bg-surface-sunken">
        <Lock className="size-5 text-muted-foreground" />
      </span>
      <h1 className="text-section">You do not have access to {MODULE_LABEL[module]}</h1>
      <p className="mt-1.5 max-w-lg text-[13px] leading-relaxed text-muted-foreground">
        The <span className="font-medium text-foreground">{roleLabel}</span> role cannot {action}{" "}
        {MODULE_LABEL[module].toLowerCase()}. Nothing has been changed — this page simply is not part of
        the role.
      </p>
      {allowed.length > 0 && (
        <p className="mt-3 max-w-lg text-caption text-muted-foreground">
          Roles with access: {allowed.map((r) => r.label).join(", ")}.
        </p>
      )}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <Button size="sm" render={<Link href="/dashboard" />}>
          Back to dashboard
        </Button>
        <Button variant="outline" size="sm" render={<Link href="/admin/roles" />}>
          Review role permissions
        </Button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- skeletons ---- */

export function TableSkeleton({ rows = 10, columns = 7 }: { rows?: number; columns?: number }) {
  return (
    <div className="rounded-lg border bg-surface" aria-busy aria-label="Loading table">
      <div className="flex items-center gap-3 border-b bg-surface-sunken px-3 py-2.5">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className={cn("h-3", i === 0 ? "w-28" : "w-16")} />
        ))}
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-3 px-3 py-3">
            {Array.from({ length: columns }).map((_, c) => (
              <Skeleton
                key={c}
                className={cn("h-3.5", c === 0 ? "w-40" : c === 1 ? "w-24" : "w-14")}
                style={{ opacity: 1 - r * 0.06 }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function KpiSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-busy aria-label="Loading metrics">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="gap-0 p-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-7 w-28" />
          <Skeleton className="mt-3 h-2.5 w-20" />
        </Card>
      ))}
    </div>
  );
}

export function CardSkeleton({ lines = 5, className }: { lines?: number; className?: string }) {
  return (
    <Card className={cn("gap-0", className)} aria-busy>
      <CardHeader className="border-b pb-3">
        <Skeleton className="h-3.5 w-40" />
      </CardHeader>
      <CardContent className="grid gap-3 pt-4">
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <Skeleton className="h-3.5 flex-1" />
            <Skeleton className="h-3.5 w-14" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function ChartSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn("gap-0", className)} aria-busy>
      <CardHeader className="border-b pb-3">
        <Skeleton className="h-3.5 w-48" />
      </CardHeader>
      <CardContent className="pt-4">
        <div className="flex h-52 items-end gap-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="flex-1" style={{ height: `${30 + ((i * 37) % 60)}%` }} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
