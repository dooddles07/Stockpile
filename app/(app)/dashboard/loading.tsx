import { DashboardSkeleton } from "@/components/states/page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <>
      <div className="border-b bg-surface px-4 pb-4 pt-4 sm:px-6">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="mt-2 h-3 w-96 max-w-full" />
      </div>
      <DashboardSkeleton />
    </>
  );
}
