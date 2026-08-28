import { CardSkeleton, ChartSkeleton, KpiSkeleton, TableSkeleton } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The loading state for a whole page.
 *
 * Skeletons only earn their keep when they predict the layout that follows —
 * a shape that jumps on arrival is worse than a spinner. So this is a small set
 * of variants matched to the five page shapes in the product, not one generic
 * grey block reused everywhere.
 */
export type PageShape = "table" | "detail" | "analytics" | "form" | "board";

function HeaderSkeleton({ stats = 0 }: { stats?: number }) {
  return (
    <div className="border-b bg-surface px-4 pb-4 pt-4 sm:px-6">
      <Skeleton className="h-3 w-40" />
      <Skeleton className="mt-3 h-6 w-56" />
      <Skeleton className="mt-2 h-3 w-96 max-w-full" />
      {stats > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: stats }).map((_, i) => (
            <Skeleton key={i} className="h-[4.5rem] rounded-lg" />
          ))}
        </div>
      )}
    </div>
  );
}

export function PageSkeleton({
  shape = "table",
  rows = 12,
  columns = 8,
}: {
  shape?: PageShape;
  rows?: number;
  columns?: number;
}) {
  if (shape === "detail") {
    return (
      <>
        <HeaderSkeleton stats={4} />
        <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-3">
          <div className="grid content-start gap-4 lg:col-span-2">
            <CardSkeleton lines={6} />
            <CardSkeleton lines={8} />
          </div>
          <CardSkeleton lines={7} />
        </div>
      </>
    );
  }

  if (shape === "analytics") {
    return (
      <>
        <HeaderSkeleton />
        <div className="grid gap-4 p-4 sm:p-6">
          <KpiSkeleton count={4} />
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartSkeleton />
            <ChartSkeleton />
          </div>
          <TableSkeleton rows={6} columns={6} />
        </div>
      </>
    );
  }

  if (shape === "form") {
    return (
      <>
        <HeaderSkeleton />
        <div className="grid gap-4 p-4 sm:p-6">
          {[6, 8, 4].map((lines, i) => (
            <CardSkeleton key={i} lines={lines} />
          ))}
          <div className="flex gap-2">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
      </>
    );
  }

  if (shape === "board") {
    return (
      <>
        <HeaderSkeleton stats={4} />
        <div className="grid gap-4 p-4 sm:p-6">
          <TableSkeleton rows={6} columns={6} />
          <TableSkeleton rows={4} columns={6} />
        </div>
      </>
    );
  }

  return (
    <>
      <HeaderSkeleton />
      <div className="p-4 sm:p-6">
        <TableSkeleton rows={rows} columns={columns} />
      </div>
    </>
  );
}

/** The dashboard is its own shape and nothing else shares it. */
export function DashboardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("grid gap-4 p-4 sm:p-6", className)}>
      <KpiSkeleton count={8} />
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartSkeleton className="lg:col-span-2" />
        <ChartSkeleton />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <CardSkeleton lines={6} />
        <CardSkeleton lines={6} />
      </div>
    </div>
  );
}
