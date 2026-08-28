import { cn } from "@/lib/utils";
import { dateTime, relative } from "@/lib/format";
import type { StatusTone } from "@/lib/types";

export interface TimelineEntry {
  id: string;
  ts: string;
  title: React.ReactNode;
  detail?: React.ReactNode;
  actor?: string;
  tone?: StatusTone;
  icon?: React.ComponentType<{ className?: string }>;
  trailing?: React.ReactNode;
}

const DOT: Record<StatusTone, string> = {
  neutral: "bg-status-neutral",
  info: "bg-status-info",
  success: "bg-status-success",
  warning: "bg-status-warning",
  danger: "bg-status-danger",
  purple: "bg-status-purple",
};

const ICON_BG: Record<StatusTone, string> = {
  neutral: "border-status-neutral-border bg-status-neutral-bg text-status-neutral",
  info: "border-status-info-border bg-status-info-bg text-status-info",
  success: "border-status-success-border bg-status-success-bg text-status-success",
  warning: "border-status-warning-border bg-status-warning-bg text-status-warning",
  danger: "border-status-danger-border bg-status-danger-bg text-status-danger",
  purple: "border-status-purple-border bg-status-purple-bg text-status-purple",
};

/**
 * Chronological history — approvals, movements, edits. Every entry carries who
 * did it and when: an inventory change without attribution is not auditable.
 */
export function Timeline({
  entries,
  className,
}: {
  entries: TimelineEntry[];
  className?: string;
}) {
  return (
    <ol className={cn("relative", className)}>
      {entries.map((entry, i) => {
        const tone = entry.tone ?? "neutral";
        const Icon = entry.icon;
        const last = i === entries.length - 1;

        return (
          <li key={entry.id} className="relative flex gap-3 pb-4 last:pb-0">
            {!last && (
              <span className="absolute left-[11px] top-6 h-[calc(100%-1rem)] w-px bg-border" aria-hidden />
            )}

            <span
              className={cn(
                "relative z-10 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border",
                Icon ? ICON_BG[tone] : "border-border bg-surface",
              )}
              aria-hidden
            >
              {Icon ? <Icon className="size-3.5" /> : <span className={cn("size-2 rounded-full", DOT[tone])} />}
            </span>

            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <p className="min-w-0 text-[13px] font-medium leading-snug">{entry.title}</p>
                {entry.trailing ?? (
                  <time
                    dateTime={entry.ts}
                    title={dateTime(entry.ts)}
                    className="shrink-0 text-caption text-muted-foreground"
                  >
                    {relative(entry.ts)}
                  </time>
                )}
              </div>
              {entry.detail && (
                <p className="mt-0.5 text-caption leading-relaxed text-muted-foreground">
                  {entry.detail}
                </p>
              )}
              {entry.actor && (
                <p className="mt-0.5 text-[11px] text-muted-foreground">by {entry.actor}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
