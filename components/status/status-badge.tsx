import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { statusMeta } from "@/lib/status";
import type { StatusTone } from "@/lib/types";

/**
 * Status is never colour alone: every badge carries a dot glyph and a text
 * label, so it survives greyscale, colour-blindness and a printed report.
 */
const badge = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border font-medium",
  {
    variants: {
      tone: {
        neutral: "bg-status-neutral-bg text-status-neutral border-status-neutral-border",
        info: "bg-status-info-bg text-status-info border-status-info-border",
        success: "bg-status-success-bg text-status-success border-status-success-border",
        warning: "bg-status-warning-bg text-status-warning border-status-warning-border",
        danger: "bg-status-danger-bg text-status-danger border-status-danger-border",
        purple: "bg-status-purple-bg text-status-purple border-status-purple-border",
      },
      size: {
        sm: "h-5 px-1.5 text-[11px] leading-none",
        md: "h-6 px-2 text-xs leading-none",
      },
    },
    defaultVariants: { tone: "neutral", size: "sm" },
  },
);

const dot = cva("shrink-0 rounded-full", {
  variants: {
    tone: {
      neutral: "bg-status-neutral",
      info: "bg-status-info",
      success: "bg-status-success",
      warning: "bg-status-warning",
      danger: "bg-status-danger",
      purple: "bg-status-purple",
    },
    size: { sm: "size-1.5", md: "size-2" },
  },
  defaultVariants: { tone: "neutral", size: "sm" },
});

interface StatusBadgeProps extends VariantProps<typeof badge> {
  /** A status value from the domain, e.g. "partially-received". */
  status?: string;
  /** Or an explicit label + tone when the value is not a domain status. */
  label?: string;
  tone?: StatusTone;
  className?: string;
  showDot?: boolean;
}

export function StatusBadge({
  status,
  label,
  tone,
  size = "sm",
  className,
  showDot = true,
}: StatusBadgeProps) {
  const meta = status ? statusMeta(status) : { label: label ?? "—", tone: tone ?? "neutral" };
  const resolvedTone = tone ?? meta.tone;
  const text = label ?? meta.label;

  return (
    <span className={cn(badge({ tone: resolvedTone, size }), className)}>
      {showDot && <span className={dot({ tone: resolvedTone, size })} aria-hidden />}
      {text}
    </span>
  );
}

/** Same tones, no chrome — for dense table cells where a border is noise. */
export function StatusText({ status, className }: { status: string; className?: string }) {
  const meta = statusMeta(status);
  const toneClass = {
    neutral: "text-status-neutral",
    info: "text-status-info",
    success: "text-status-success",
    warning: "text-status-warning",
    danger: "text-status-danger",
    purple: "text-status-purple",
  }[meta.tone];

  return (
    <span className={cn("inline-flex items-center gap-1.5 font-medium", toneClass, className)}>
      <span className={cn(dot({ tone: meta.tone, size: "sm" }))} aria-hidden />
      {meta.label}
    </span>
  );
}
