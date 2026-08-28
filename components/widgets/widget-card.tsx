import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * The dashboard is a set of queues, not a set of charts. Each widget answers
 * one question and links to the full list rather than trying to be it.
 */
export function WidgetCard({
  title,
  count,
  href,
  hrefLabel = "View all",
  description,
  action,
  children,
  className,
  contentClassName,
  headingLevel = 2,
}: {
  title: string;
  count?: number;
  href?: string;
  hrefLabel?: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  /**
   * Heading level. A card is a page-level region (h2) unless it sits under a
   * region heading of its own, in which case pass 3 so the outline still reads
   * top to bottom without a skip.
   */
  headingLevel?: 2 | 3;
}) {
  const Heading = `h${headingLevel}` as const;

  return (
    <Card className={cn("gap-0 overflow-hidden py-0 shadow-xs", className)}>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Heading className="text-card-title truncate">{title}</Heading>
          {count !== undefined && count > 0 && (
            <span
              className="tabular rounded-sm bg-surface-sunken px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground"
              data-numeric
            >
              {count}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {action}
          {href && (
            <Link
              href={href}
              className="group/link flex items-center gap-1 text-caption font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {hrefLabel}
              <ArrowRight className="size-3 transition-transform group-hover/link:translate-x-0.5" aria-hidden />
            </Link>
          )}
        </div>
      </CardHeader>
      {description && (
        <p className="border-b bg-surface-sunken px-4 py-2 text-caption text-muted-foreground">
          {description}
        </p>
      )}
      <CardContent className={cn("p-0", contentClassName)}>{children}</CardContent>
    </Card>
  );
}

/** A single row inside a widget. Clickable when `href` is given. */
export function WidgetRow({
  href,
  leading,
  title,
  subtitle,
  trailing,
  trailingSub,
  className,
}: {
  href?: string;
  leading?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  trailing?: React.ReactNode;
  trailingSub?: React.ReactNode;
  className?: string;
}) {
  const inner = (
    <>
      {leading && <span className="mt-0.5 shrink-0">{leading}</span>}
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="truncate text-[13px] font-medium leading-snug">{title}</span>
        {subtitle && (
          <span className="truncate text-caption text-muted-foreground">{subtitle}</span>
        )}
      </span>
      {(trailing || trailingSub) && (
        <span className="grid shrink-0 justify-items-end gap-0.5 text-right">
          {trailing && <span className="text-[13px] font-medium tabular" data-numeric>{trailing}</span>}
          {trailingSub && <span className="text-caption text-muted-foreground">{trailingSub}</span>}
        </span>
      )}
    </>
  );

  const shell = cn("flex items-start gap-2.5 px-4 py-2.5", href && "transition-colors hover:bg-surface-hover", className);

  return href ? (
    <Link href={href} className={shell}>
      {inner}
    </Link>
  ) : (
    <div className={shell}>{inner}</div>
  );
}

export function WidgetList({ children }: { children: React.ReactNode }) {
  return <div className="divide-y">{children}</div>;
}
