import Link from "next/link";
import { ArrowRight, Minus, TrendingDown, TrendingUp } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** 12-point trend line. Inline SVG — a chart library for a 40px sparkline is waste. */
export function Sparkline({
  points,
  className,
  tone = "muted",
}: {
  points: number[];
  className?: string;
  tone?: "muted" | "success" | "warning" | "danger";
}) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const w = 96;
  const h = 28;

  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * w;
    const y = h - ((p - min) / span) * (h - 4) - 2;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const stroke = {
    muted: "stroke-muted-foreground/60",
    success: "stroke-status-success",
    warning: "stroke-status-warning",
    danger: "stroke-status-danger",
  }[tone];

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={cn("h-7 w-24 overflow-visible", className)}
      fill="none"
      aria-hidden
      focusable="false"
    >
      <polyline
        points={coords.join(" ")}
        className={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export interface KpiCardProps {
  label: string;
  value: string;
  /** Signed change against the comparison period. */
  deltaPct?: number | null;
  deltaLabel?: string;
  direction?: "up" | "down" | "flat";
  /** Whether an increase is good news — decides the delta's colour. */
  goodWhen?: "up" | "down";
  tone?: "neutral" | "success" | "warning" | "danger";
  href?: string;
  hint?: string;
  spark?: number[];
  className?: string;
}

export function KpiCard({
  label,
  value,
  deltaPct,
  deltaLabel,
  direction = "flat",
  goodWhen = "up",
  tone = "neutral",
  href,
  hint,
  spark,
  className,
}: KpiCardProps) {
  const good = direction === "flat" ? null : (direction === "up") === (goodWhen === "up");
  const DeltaIcon = direction === "up" ? TrendingUp : direction === "down" ? TrendingDown : Minus;

  const deltaClass =
    good === null
      ? "text-muted-foreground"
      : good
        ? "text-status-success"
        : "text-status-danger";

  const accent =
    tone === "danger"
      ? "before:bg-status-danger"
      : tone === "warning"
        ? "before:bg-status-warning"
        : tone === "success"
          ? "before:bg-status-success"
          : "before:bg-transparent";

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        {hint ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="cursor-help text-label text-muted-foreground underline decoration-dotted decoration-from-font underline-offset-4" />
              }
            >
              {label}
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{hint}</TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-label text-muted-foreground">{label}</span>
        )}
        {href && (
          <ArrowRight
            className="size-3.5 shrink-0 -translate-x-1 text-muted-foreground opacity-0 transition-all group-hover/kpi:translate-x-0 group-hover/kpi:opacity-100"
            aria-hidden
          />
        )}
      </div>

      <div className="mt-2 flex items-end justify-between gap-3">
        <span className="text-metric">{value}</span>
        {spark && spark.length > 1 && (
          <Sparkline
            points={spark}
            tone={tone === "neutral" ? "muted" : tone === "success" ? "success" : tone}
          />
        )}
      </div>

      {(deltaPct !== undefined || deltaLabel) && (
        <div className="mt-2 flex items-center gap-1.5 text-caption">
          {deltaPct !== null && deltaPct !== undefined && (
            <span className={cn("flex items-center gap-0.5 font-medium tabular", deltaClass)} data-numeric>
              <DeltaIcon className="size-3.5" aria-hidden />
              {deltaPct > 0 ? "+" : ""}
              {(deltaPct * 100).toFixed(1)}%
            </span>
          )}
          {deltaLabel && <span className="text-muted-foreground">{deltaLabel}</span>}
        </div>
      )}
    </>
  );

  const shell = cn(
    "group/kpi relative overflow-hidden rounded-lg border bg-surface p-4 shadow-xs transition-colors",
    "before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:content-['']",
    accent,
    href && "hover:border-border-strong hover:bg-surface-hover",
    className,
  );

  return href ? (
    <Link href={href} className={cn(shell, "block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring")}>
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}
