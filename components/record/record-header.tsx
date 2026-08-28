import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader, type Crumb } from "@/components/shell/page-header";
import { cn } from "@/lib/utils";

/**
 * Header for a single record. Adds a back link and a leading visual to the
 * standard page header so a product, a PO and a supplier all open the same way.
 */
export function RecordHeader({
  crumbs,
  backHref,
  backLabel,
  leading,
  title,
  subtitle,
  badge,
  meta,
  actions,
  children,
}: {
  crumbs?: Crumb[];
  backHref: string;
  backLabel: string;
  leading?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <PageHeader
      crumbs={crumbs}
      title={
        <span className="flex min-w-0 items-center gap-3">
          {leading}
          <span className="min-w-0 truncate">{title}</span>
        </span>
      }
      description={subtitle}
      badge={badge}
      meta={meta}
      actions={
        <>
          <Button variant="ghost" size="sm" className="h-8" render={<Link href={backHref} />}>
            <ArrowLeft className="size-3.5" aria-hidden />
            {backLabel}
          </Button>
          {actions}
        </>
      }
    >
      {children}
    </PageHeader>
  );
}

/** Horizontal strip of key numbers under a record header. */
export function StatStrip({
  children,
  columns = 6,
  className,
}: {
  children: React.ReactNode;
  columns?: 4 | 5 | 6;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-2",
        columns === 4 && "grid-cols-2 lg:grid-cols-4",
        columns === 5 && "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
        columns === 6 && "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6",
        className,
      )}
    >
      {children}
    </div>
  );
}
