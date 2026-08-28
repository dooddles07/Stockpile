import { cn } from "@/lib/utils";

export interface Field {
  label: string;
  value: React.ReactNode;
  /** Renders the value in the identifier font (SKU, lot, barcode, PO number). */
  mono?: boolean;
  hint?: string;
  span?: 1 | 2 | 3;
}

/**
 * Label-above-value grid. Used on every detail page so a supplier's payment
 * terms and a product's barcode are read the same way.
 */
export function FieldGrid({
  fields,
  columns = 3,
  className,
}: {
  fields: Field[];
  columns?: 2 | 3 | 4;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid gap-x-6 gap-y-4",
        columns === 2 && "sm:grid-cols-2",
        columns === 3 && "sm:grid-cols-2 lg:grid-cols-3",
        columns === 4 && "sm:grid-cols-2 lg:grid-cols-4",
        className,
      )}
    >
      {fields.map((field) => (
        <div
          key={field.label}
          className={cn(
            "min-w-0",
            field.span === 2 && "sm:col-span-2",
            field.span === 3 && "sm:col-span-2 lg:col-span-3",
          )}
        >
          <dt className="text-caption text-muted-foreground">{field.label}</dt>
          <dd
            className={cn(
              "mt-1 break-words text-[13px] font-medium leading-relaxed",
              field.mono && "text-code font-normal",
            )}
          >
            {field.value}
          </dd>
          {field.hint && (
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{field.hint}</p>
          )}
        </div>
      ))}
    </dl>
  );
}

/** A titled block on a detail page. */
export function Section({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <section className={cn("overflow-hidden rounded-lg border bg-surface shadow-xs", className)}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-card-title">{title}</h2>
          {description && (
            <p className="mt-0.5 text-caption text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      <div className={cn("p-4", contentClassName)}>{children}</div>
    </section>
  );
}

/** A number with a label, for the metric strips on detail pages. */
export function StatTile({
  label,
  value,
  hint,
  tone,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "purple" | "info";
  className?: string;
}) {
  const toneClass = {
    neutral: "text-foreground",
    success: "text-status-success",
    warning: "text-status-warning",
    danger: "text-status-danger",
    purple: "text-status-purple",
    info: "text-status-info",
  }[tone ?? "neutral"];

  return (
    <div className={cn("min-w-0 rounded-md border bg-surface-sunken px-3 py-2.5", className)}>
      <p className="text-caption text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-[19px] font-bold leading-tight tabular", toneClass)} data-numeric>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
