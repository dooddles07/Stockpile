"use client";

import { useEffect } from "react";
import Link from "next/link";

import { ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";

/**
 * Route-level error boundary.
 *
 * The digest is surfaced deliberately: it is the only handle a support engineer
 * has to find the matching server log, and hiding it turns every report into
 * "a page broke, somewhere".
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[stockpile] route error", error);
  }, [error]);

  return (
    <div className="p-6">
      <div className="rounded-lg border bg-surface">
        <ErrorState
          headingLevel={1}
          title="This page could not be loaded"
          description="The data behind this screen failed to load. Nothing was changed — retrying is safe."
          detail={error.digest ? `Reference: ${error.digest}` : error.message}
          onRetry={reset}
        />
        <div className="flex justify-center pb-8">
          <Button variant="ghost" size="sm" render={<Link href="/dashboard" />}>
            Back to dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
