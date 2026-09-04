import Link from "next/link";
import { ArrowRight, Minus, TrendingDown, TrendingUp } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

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
  const w = 120;
  const h = 32;

  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * w;
    const y = h - ((p - min) / span) * (h - 6) - 3;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const fillCoords = [...coords, `${w},${h}`, `0,${h}`];

  const stroke = {
    muted: "stroke-muted-foreground/40",
    success: "stroke-status-success",
    warning: "stroke-status-warning",
    danger: "stroke-status-danger",
  }[tone];

  const fill = {
    muted: "fill-muted-foreground/5",
    success: "fill-status-success/8",
    warning: "fill-status-warning/8",
    danger: "fill-status-danger/8",
  }[tone];

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={cn("h-8 w-full overflow-visible", className)}
      fill="none"
      aria-hidden
      focusable="false"
    >
      <polygon points={fillCoords.join(" ")} className={fill} />
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
  deltaPct?: number | null;
  deltaLabel?: string;
  direction?: "up" | "down" | "flat";
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

  const accentBg =
    tone === "danger"
      ? "bg-status-danger-bg/40"
      : tone === "warning"
        ? "bg-status-warning-bg/40"
        : tone === "success"
          ? "bg-status-success-bg/40"
          : "";

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        {hint ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="cursor-help text-[12px] font-medium uppercase tracking-wide text-muted-foreground" />
              }
            >
              {label}
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{hint}</TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        )}
        {href && (
          <ArrowRight
            className="size-3.5 shrink-0 -translate-x-1 text-muted-foreground opacity-0 transition-all group-hover/kpi:translate-x-0 group-hover/kpi:opacity-100"
            aria-hidden
          />
        )}
      </div>

      <div className="mt-1.5 flex items-end justify-between gap-3">
        <span className="text-metric">{value}</span>

        {(deltaPct !== undefined || deltaLabel) && (
          <div className="mb-1 flex items-center gap-1 text-[12px]">
            {deltaPct !== null && deltaPct !== undefined && (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium tabular",
                  good === null && "bg-muted text-muted-foreground",
                  good === true && "bg-status-success-bg text-status-success",
                  good === false && "bg-status-danger-bg text-status-danger",
                )}
                data-numeric
              >
                <DeltaIcon className="size-3" aria-hidden />
                {deltaPct > 0 ? "+" : ""}
                {(deltaPct * 100).toFixed(1)}%
              </span>
            )}
          </div>
        )}
      </div>

      {deltaLabel && (
        <p className="mt-0.5 text-[11px] text-muted-foreground">{deltaLabel}</p>
      )}

      {spark && spark.length > 1 && (
        <div className="mt-2">
          <Sparkline
            points={spark}
            tone={tone === "neutral" ? "muted" : tone === "success" ? "success" : tone}
          />
        </div>
      )}
    </>
  );

  const shell = cn(
    "group/kpi relative overflow-hidden rounded-lg border bg-surface p-4 shadow-xs transition-colors",
    accentBg,
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
