import Link from "next/link";
import { ArrowRight, TrendingDown, TrendingUp, Minus } from "lucide-react";

import { cn } from "@/lib/utils";

function HeroSparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const w = 400;
  const h = 80;

  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * w;
    const y = h - ((p - min) / span) * (h - 8) - 4;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const fillCoords = [...coords, `${w},${h}`, `0,${h}`];

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="absolute inset-x-0 bottom-0 h-20 w-full"
      preserveAspectRatio="none"
      fill="none"
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id="hero-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.15} />
          <stop offset="100%" stopColor="var(--brand)" stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <polygon points={fillCoords.join(" ")} fill="url(#hero-fill)" />
      <polyline
        points={coords.join(" ")}
        stroke="var(--brand)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.5}
      />
    </svg>
  );
}

export interface HeroMetricProps {
  label: string;
  value: string;
  deltaPct?: number | null;
  deltaLabel?: string;
  direction?: "up" | "down" | "flat";
  goodWhen?: "up" | "down";
  href?: string;
  hint?: string;
  spark?: number[];
  className?: string;
}

export function HeroMetric({
  label,
  value,
  deltaPct,
  deltaLabel,
  direction = "flat",
  goodWhen = "up",
  href,
  spark,
  className,
}: HeroMetricProps) {
  const good = direction === "flat" ? null : (direction === "up") === (goodWhen === "up");
  const DeltaIcon = direction === "up" ? TrendingUp : direction === "down" ? TrendingDown : Minus;
  const deltaClass =
    good === null
      ? "text-muted-foreground"
      : good
        ? "text-status-success"
        : "text-status-danger";

  const content = (
    <div
      className={cn(
        "group/hero relative overflow-hidden rounded-lg border bg-surface p-5 shadow-xs transition-colors",
        href && "hover:border-brand/30 hover:shadow-md",
        className,
      )}
    >
      {spark && spark.length > 1 && <HeroSparkline points={spark} />}

      <div className="relative">
        <div className="flex items-center justify-between">
          <span className="text-label text-muted-foreground">{label}</span>
          {href && (
            <ArrowRight
              className="size-4 text-muted-foreground opacity-0 transition-all group-hover/hero:translate-x-0.5 group-hover/hero:opacity-100"
              aria-hidden
            />
          )}
        </div>

        <div className="mt-3">
          <span className="font-heading text-[32px] font-bold leading-none tracking-tight tabular">
            {value}
          </span>
        </div>

        {(deltaPct !== undefined || deltaLabel) && (
          <div className="mt-3 flex items-center gap-2 text-[13px]">
            {deltaPct !== null && deltaPct !== undefined && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium tabular",
                  good === null && "bg-muted",
                  good === true && "bg-status-success-bg text-status-success",
                  good === false && "bg-status-danger-bg text-status-danger",
                )}
                data-numeric
              >
                <DeltaIcon className="size-3.5" aria-hidden />
                {deltaPct > 0 ? "+" : ""}
                {(deltaPct * 100).toFixed(1)}%
              </span>
            )}
            {deltaLabel && <span className="text-muted-foreground">{deltaLabel}</span>}
          </div>
        )}
      </div>
    </div>
  );

  return href ? (
    <Link href={href} className="block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
      {content}
    </Link>
  ) : (
    content
  );
}
