import { cn } from "@/lib/utils";
import type { StatusTone } from "@/lib/types";

const FILL: Record<StatusTone, string> = {
  neutral: "bg-status-neutral",
  info: "bg-status-info",
  success: "bg-status-success",
  warning: "bg-status-warning",
  danger: "bg-status-danger",
  purple: "bg-status-purple",
};

/**
 * A proportion bar — capacity used, share of value, count progress.
 *
 * Deliberately not the Progress component: these need to carry a status tone
 * (a bar at 92% capacity should not look like a bar at 40%), and the tone is
 * the whole reason the bar exists rather than just the number.
 */
export function MeterBar({
  value,
  tone = "neutral",
  size = "md",
  label,
  className,
}: {
  /** 0–1. Values above 1 clamp to full. */
  value: number;
  tone?: StatusTone;
  size?: "sm" | "md";
  /** Accessible description. Falls back to the percentage. */
  label?: string;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;

  return (
    <div
      role="img"
      aria-label={label ?? `${pct.toFixed(0)} percent`}
      className={cn(
        "w-full overflow-hidden rounded-full bg-surface-sunken",
        size === "sm" ? "h-1.5" : "h-2",
        className,
      )}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-200", FILL[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** Shared thresholds so "how full is it" reads the same everywhere. */
export function capacityTone(utilisation: number): StatusTone {
  if (utilisation > 0.9) return "danger";
  if (utilisation > 0.8) return "warning";
  return "success";
}
