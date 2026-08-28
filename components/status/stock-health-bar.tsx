import { cn } from "@/lib/utils";
import { healthOf } from "@/lib/repo/inventory";
import { statusMeta } from "@/lib/status";
import { qty } from "@/lib/format";
import type { StockHealth } from "@/lib/types";

const FILL: Record<StockHealth, string> = {
  healthy: "bg-status-success",
  low: "bg-status-warning",
  critical: "bg-status-danger",
  "out-of-stock": "bg-status-danger",
  overstock: "bg-status-purple",
};

/**
 * Available quantity against the reorder point, as a bar with the reorder
 * point marked. Reading "84 / reorder at 120" as a bar is faster than reading
 * two numbers, but both are present — the bar is not the only channel.
 */
export function StockHealthBar({
  available,
  reorderPoint,
  health,
  showNumbers = true,
  className,
}: {
  available: number;
  reorderPoint: number;
  health?: StockHealth;
  showNumbers?: boolean;
  className?: string;
}) {
  const resolved = health ?? healthOf(available, reorderPoint);
  const meta = statusMeta(resolved);
  // Scale to 2× the reorder point so healthy stock still has headroom on screen.
  const scale = Math.max(reorderPoint * 2, available, 1);
  const fillPct = Math.min(100, (available / scale) * 100);
  const markerPct = Math.min(100, (reorderPoint / scale) * 100);

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {showNumbers && (
        <div className="flex items-baseline justify-between gap-2 text-caption">
          <span className="font-medium tabular" data-numeric>
            {qty(available)}
          </span>
          <span className="text-muted-foreground">reorder at {qty(reorderPoint)}</span>
        </div>
      )}
      <div
        className="relative h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken"
        role="img"
        aria-label={`${meta.label}: ${available} available against a reorder point of ${reorderPoint}`}
      >
        <div className={cn("h-full rounded-full", FILL[resolved])} style={{ width: `${fillPct}%` }} />
        {reorderPoint > 0 && (
          <span
            className="absolute top-0 h-full w-px bg-foreground/45"
            style={{ left: `${markerPct}%` }}
            aria-hidden
          />
        )}
      </div>
    </div>
  );
}
