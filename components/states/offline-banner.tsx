"use client";

import * as React from "react";
import { CloudOff, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

const subscribe = (onChange: () => void) => {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
};

/**
 * Connection state.
 *
 * `useSyncExternalStore` rather than an effect: the React Compiler rejects
 * setState-in-effect, and this is exactly the shape it exists for. The server
 * snapshot is always "online" — a page rendered on the server reached the
 * server, so claiming otherwise would flash a false warning on every load.
 */
function useOnline() {
  return React.useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}

/**
 * A warehouse loses signal in the racks. The banner says what that means for
 * the work in progress rather than just reporting the fact: counts and picks
 * keep working from what is already loaded, anything that writes will not.
 */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-status-warning-border bg-status-warning-bg px-4 py-2 text-[13px] text-status-warning"
    >
      <span className="flex items-center gap-2 font-medium">
        <CloudOff className="size-4 shrink-0" aria-hidden />
        No connection
      </span>
      <span className="min-w-0 flex-1">
        You can keep reading what is already loaded. Anything that saves — receipts, counts,
        approvals — will fail until the connection is back.
      </span>
      <Button
        variant="outline"
        size="sm"
        className="h-7 border-status-warning-border bg-transparent text-status-warning hover:bg-status-warning/10"
        onClick={() => window.location.reload()}
      >
        <RefreshCw className="size-3.5" aria-hidden />
        Retry
      </Button>
    </div>
  );
}
