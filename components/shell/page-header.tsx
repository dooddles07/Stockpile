import Link from "next/link";
import { Fragment } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * Every page in the product opens with this: where you are, what this record
 * is, and what you can do to it. Actions live top-right, never buried at the
 * bottom of a form.
 */
export function PageHeader({
  crumbs,
  title,
  description,
  badge,
  meta,
  actions,
  children,
  className,
  sticky = false,
}: {
  crumbs?: Crumb[];
  title: React.ReactNode;
  description?: React.ReactNode;
  badge?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  sticky?: boolean;
}) {
  return (
    <div
      className={cn(
        "border-b bg-surface px-4 pb-4 pt-4 sm:px-6",
        sticky && "sticky top-14 z-20",
        className,
      )}
    >
      {crumbs && crumbs.length > 0 && (
        <Breadcrumb className="mb-2">
          <BreadcrumbList className="text-caption">
            {crumbs.map((crumb, i) => (
              <Fragment key={`${crumb.label}-${i}`}>
                <BreadcrumbItem>
                  {crumb.href && i < crumbs.length - 1 ? (
                    <BreadcrumbLink render={<Link href={crumb.href} />}>{crumb.label}</BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
                {i < crumbs.length - 1 && <BreadcrumbSeparator />}
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      )}

      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1 className="text-page-title min-w-0 truncate">{title}</h1>
            {badge}
          </div>
          {description && (
            <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
          {meta && <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">{meta}</div>}
        </div>

        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>

      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

/** A labelled fact for the header's meta row. */
export function HeaderFact({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <span className="flex items-center gap-1.5 text-caption">
      {Icon && <Icon className="size-3.5 text-muted-foreground" />}
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </span>
  );
}
