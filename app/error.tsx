"use client";

import { useEffect } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[stockpile] root page error", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-[20px] font-semibold">Page failed to load</h1>
      <p className="max-w-sm text-[14px] text-muted-foreground">
        Something went wrong. Nothing was changed — retrying is safe.
        {error.digest && (
          <span className="mt-1 block font-mono text-[11px] text-muted-foreground/60">
            Reference: {error.digest}
          </span>
        )}
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={reset}>
          Try again
        </Button>
        <Button size="sm" render={<Link href="/dashboard" />}>
          Go to app
        </Button>
      </div>
    </div>
  );
}
